/**
 * NIP-60 Service
 *
 * Angular service for managing NIP-60 Cashu wallet state on Nostr relays.
 * Handles bidirectional sync (push local state to relays, pull from relays)
 * and publishes kind 10019 nutzap info events.
 */

import { Injectable } from '@angular/core';
import { SimplePool } from 'nostr-tools/pool';
import { StorageService } from '../storage/storage.service';
import { CashuService } from './cashu.service';
import { RelayListService } from '../relay-list/relay-list.service';
import { publishToRelaysWithAuth, filterAuthRelays, type PublishResult } from '../../helpers/websocket-auth';
import { FALLBACK_PROFILE_RELAYS } from '../../constants/fallback-relays';
import type { IdentityData, CashuProof } from '../storage/types';
import {
  generateWalletPrivkey,
  getP2pkPubkey,
  pubkeyFromPrivkey,
  buildWalletConfigEvent,
  buildUnspentProofEvent,
  buildSpendingHistoryEvent,
  buildDeletionEvent,
  buildNutzapInfoEvent,
  parseWalletConfigEvent,
  parseUnspentProofEvent,
  signEvent,
} from './nip60-core';
import type { Nip60SpendingHistory } from './nip60-types';

const QUERY_TIMEOUT_MS = 15000;

@Injectable({
  providedIn: 'root',
})
export class Nip60Service {
  constructor(
    private storageService: StorageService,
    private cashuService: CashuService,
    private relayListService: RelayListService
  ) {}

  /**
   * Get or generate the wallet private key for an identity.
   * If walletPrivkey is not set, generates one and persists it to the vault.
   */
  async getWalletPrivkey(identity: IdentityData): Promise<string> {
    if (identity.walletPrivkey) {
      return identity.walletPrivkey;
    }

    const walletPrivkey = generateWalletPrivkey();
    await this.storageService.updateIdentityWalletPrivkey(identity.id, walletPrivkey);
    identity.walletPrivkey = walletPrivkey;
    return walletPrivkey;
  }

  /**
   * Get the 02-prefixed P2PK public key for an identity's wallet.
   */
  async getP2pkPubkey(identity: IdentityData): Promise<string> {
    const walletPrivkey = await this.getWalletPrivkey(identity);
    return getP2pkPubkey(walletPrivkey);
  }

  /**
   * Check if the identity has a NIP-65 relay list published.
   * NIP-60 wallet sync depends on this — no relay list means no sync.
   */
  async hasIdentityRelays(pubkey: string): Promise<boolean> {
    const nip65 = await this.relayListService.fetchRelayList(pubkey);
    return nip65.length > 0;
  }

  /**
   * Get any user-configured custom NIP-60 relay URLs.
   */
  private getCustomRelays(): string[] {
    const meta = this.storageService.getSignerMetaHandler();
    if (meta.isNip60CustomRelaysEnabled()) {
      return meta.getNip60CustomRelays();
    }
    return [];
  }

  /**
   * Get relay URLs for publishing wallet events.
   * Priority: user's NIP-65 write relays → fallback relays.
   * Custom relays (if enabled) are always merged in.
   */
  async getWalletRelays(pubkey: string): Promise<string[]> {
    const nip65 = await this.relayListService.fetchRelayList(pubkey);
    const writeRelays = nip65
      .filter(r => r.write)
      .map(r => r.url);

    const baseRelays = writeRelays.length > 0 ? writeRelays : FALLBACK_PROFILE_RELAYS;
    const custom = this.getCustomRelays();
    return [...new Set([...baseRelays, ...custom])];
  }

  /**
   * Get relay URLs for reading wallet events (including read relays).
   * Custom relays (if enabled) are always merged in.
   */
  async getReadRelays(pubkey: string): Promise<string[]> {
    const nip65 = await this.relayListService.fetchRelayList(pubkey);
    const readRelays = nip65
      .filter(r => r.read)
      .map(r => r.url);

    const baseRelays = readRelays.length > 0 ? readRelays : FALLBACK_PROFILE_RELAYS;
    const custom = this.getCustomRelays();
    return [...new Set([...baseRelays, ...custom])];
  }

  // ---------------------------------------------------------------------------
  // Push: Local State → Relays
  // ---------------------------------------------------------------------------

  /**
   * Publish the full wallet state to relays.
   * 1. kind 17375 (wallet config with mint list and encrypted walletPrivkey)
   * 2. kind 7375 per mint (encrypted unspent proofs)
   */
  async pushWalletToRelays(identity: IdentityData): Promise<PublishResult[]> {
    const walletPrivkey = await this.getWalletPrivkey(identity);
    const pubkey = pubkeyFromPrivkey(identity.privkey);
    const relays = await this.applyAuthFilter(await this.getWalletRelays(pubkey));
    const allResults: PublishResult[] = [];

    // 1. Build and publish wallet config
    const mints = this.cashuService.getMints();
    const mintUrls = mints.map(m => m.mintUrl);
    const configTemplate = buildWalletConfigEvent(identity.privkey, mintUrls, walletPrivkey);
    const configEvent = signEvent(configTemplate, identity.privkey);
    const configResults = await publishToRelaysWithAuth(relays, configEvent, identity.privkey);
    allResults.push(...configResults);

    // 2. Build and publish unspent proofs per mint
    for (const mint of mints) {
      const proofs = this.cashuService.getProofs(mint.id);
      if (proofs.length === 0) continue;

      const cashuProofs = proofs.map(p => ({
        id: p.id,
        amount: p.amount,
        secret: p.secret,
        C: p.C,
      }));

      const proofTemplate = buildUnspentProofEvent(
        identity.privkey,
        mint.mintUrl,
        cashuProofs,
        mint.unit || 'sat'
      );
      const proofEvent = signEvent(proofTemplate, identity.privkey);
      const proofResults = await publishToRelaysWithAuth(relays, proofEvent, identity.privkey);
      allResults.push(...proofResults);
    }

    return allResults;
  }

  /**
   * Push proofs for a single mint to relays.
   * Used after cashu operations when NIP-60 is enabled.
   */
  async pushMintProofsToRelays(
    identity: IdentityData,
    mintUrl: string,
    proofs: CashuProof[]
  ): Promise<PublishResult[]> {
    const pubkey = pubkeyFromPrivkey(identity.privkey);
    const relays = await this.applyAuthFilter(await this.getWalletRelays(pubkey));

    if (proofs.length === 0) return [];

    const cashuProofs = proofs.map(p => ({
      id: p.id,
      amount: p.amount,
      secret: p.secret,
      C: p.C,
    }));

    const proofTemplate = buildUnspentProofEvent(
      identity.privkey,
      mintUrl,
      cashuProofs,
      'sat'
    );
    const proofEvent = signEvent(proofTemplate, identity.privkey);
    return publishToRelaysWithAuth(relays, proofEvent, identity.privkey);
  }

  // ---------------------------------------------------------------------------
  // Pull: Relays → Local State
  // ---------------------------------------------------------------------------

  /**
   * Fetch existing NIP-60 wallet events from relays and merge with local state.
   */
  async pullWalletFromRelays(identity: IdentityData): Promise<{
    newMints: string[];
    newProofsCount: number;
  }> {
    const pubkey = pubkeyFromPrivkey(identity.privkey);
    const relays = await this.getReadRelays(pubkey);
    const pool = new SimplePool();

    const newMints: string[] = [];
    let newProofsCount = 0;

    try {
      // 1. Fetch wallet config (kind 17375)
      const configEvents = await this.queryWithTimeout(pool, relays, [{
        kinds: [17375],
        authors: [pubkey],
      }]);

      if (configEvents.length > 0) {
        const latest = configEvents.reduce((a, b) =>
          a.created_at > b.created_at ? a : b
        );

        try {
          const config = parseWalletConfigEvent(latest, identity.privkey);

          // If relay has a walletPrivkey and we don't, adopt it
          if (config.privkey && !identity.walletPrivkey) {
            await this.storageService.updateIdentityWalletPrivkey(identity.id, config.privkey);
            identity.walletPrivkey = config.privkey;
          }

          // Add any new mints
          for (const mintUrl of config.mints) {
            if (!this.cashuService.getMintByUrl(mintUrl)) {
              try {
                const urlObj = new URL(mintUrl);
                await this.cashuService.addMint(urlObj.hostname, mintUrl);
                newMints.push(mintUrl);
              } catch {
                // Skip invalid mint URLs
              }
            }
          }
        } catch {
          // Skip unparseable config events
        }
      }

      // 2. Fetch unspent proof events (kind 7375)
      const proofEvents = await this.queryWithTimeout(pool, relays, [{
        kinds: [7375],
        authors: [pubkey],
      }]);

      for (const event of proofEvents) {
        try {
          const parsed = parseUnspentProofEvent(event, identity.privkey);
          const existingMint = this.cashuService.getMintByUrl(parsed.mint);

          if (existingMint) {
            // Merge proofs by secret (dedup)
            const existingSecrets = new Set(existingMint.proofs.map(p => p.secret));
            const newProofs = parsed.proofs.filter(p => !existingSecrets.has(p.secret));

            if (newProofs.length > 0) {
              const now = new Date().toISOString();
              const mergedProofs: CashuProof[] = [
                ...existingMint.proofs,
                ...newProofs.map(p => ({
                  id: p.id,
                  amount: p.amount,
                  secret: p.secret,
                  C: p.C,
                  receivedAt: now,
                })),
              ];
              await this.storageService.updateCashuMintProofs(existingMint.id, mergedProofs, true);
              newProofsCount += newProofs.length;
            }
          }
        } catch {
          // Skip unparseable proof events
        }
      }
    } finally {
      pool.close(relays);
    }

    return { newMints, newProofsCount };
  }

  // ---------------------------------------------------------------------------
  // NIP-61: Publish Nutzap Info (kind 10019)
  // ---------------------------------------------------------------------------

  /**
   * Build and publish kind 10019 nutzap info event.
   */
  async publishNutzapInfo(identity: IdentityData): Promise<PublishResult[]> {
    const walletPrivkey = await this.getWalletPrivkey(identity);
    const p2pk = getP2pkPubkey(walletPrivkey);
    const pubkey = pubkeyFromPrivkey(identity.privkey);

    const mints = this.cashuService.getMints().map(m => m.mintUrl);
    const allRelays = await this.getWalletRelays(pubkey);
    const publishRelays = await this.applyAuthFilter(allRelays);

    // Event content lists all write relays (so senders know where to find wallet),
    // but we only publish to auth-filtered relays if the setting is enabled.
    const template = buildNutzapInfoEvent(p2pk, mints, allRelays);
    const event = signEvent(template, identity.privkey);

    return publishToRelaysWithAuth(publishRelays, event, identity.privkey);
  }

  // ---------------------------------------------------------------------------
  // Spending History
  // ---------------------------------------------------------------------------

  /**
   * Publish a kind 7376 spending history event.
   */
  async publishSpendingHistory(
    identity: IdentityData,
    history: Nip60SpendingHistory,
    referencedEventIds?: { id: string; marker: string }[]
  ): Promise<PublishResult[]> {
    const pubkey = pubkeyFromPrivkey(identity.privkey);
    const relays = await this.applyAuthFilter(await this.getWalletRelays(pubkey));

    const template = buildSpendingHistoryEvent(
      identity.privkey,
      history,
      referencedEventIds
    );
    const event = signEvent(template, identity.privkey);

    return publishToRelaysWithAuth(relays, event, identity.privkey);
  }

  /**
   * Publish NIP-09 deletion events for spent token event IDs.
   */
  async publishDeletion(
    identity: IdentityData,
    eventIds: string[]
  ): Promise<PublishResult[]> {
    if (eventIds.length === 0) return [];

    const pubkey = pubkeyFromPrivkey(identity.privkey);
    const relays = await this.applyAuthFilter(await this.getWalletRelays(pubkey));

    const template = buildDeletionEvent(eventIds);
    const event = signEvent(template, identity.privkey);

    return publishToRelaysWithAuth(relays, event, identity.privkey);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * If the user has enabled AUTH-only relay sync, filter to only AUTH-required relays.
   * Otherwise returns the relay list unchanged.
   */
  private async applyAuthFilter(relays: string[]): Promise<string[]> {
    const authOnly = this.storageService.getSignerMetaHandler().isRelaySyncAuthOnly();
    if (!authOnly) return relays;

    const filtered = await filterAuthRelays(relays);
    if (filtered.length === 0) {
      console.warn('[nip60] AUTH-only enabled but no AUTH-required relays found, using all relays');
      return relays;
    }
    return filtered;
  }

  /**
   * Query relays with a timeout using SimplePool.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private queryWithTimeout(pool: SimplePool, relays: string[], filters: any[]): Promise<any[]> {
    return new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const events: any[] = [];
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(events);
        }
      }, QUERY_TIMEOUT_MS);

      const sub = pool.subscribeMany(relays, filters, {
        onevent(event) {
          events.push(event);
        },
        oneose() {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            sub.close();
            resolve(events);
          }
        },
      });
    });
  }
}
