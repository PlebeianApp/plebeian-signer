/**
 * NIP-61 Service - Nutzaps
 *
 * Angular service for sending and receiving Cashu nutzaps (P2PK ecash transfers).
 * Nutzaps are P2PK-locked Cashu tokens published as kind 9321 events on Nostr.
 */

import { Injectable } from '@angular/core';
import {
  Mint,
  Wallet,
  P2PKBuilder,
  type Proof,
} from '@cashu/cashu-ts';
import { SimplePool } from 'nostr-tools/pool';
import { StorageService } from '../storage/storage.service';
import { CashuService } from './cashu.service';
import { Nip60Service } from './nip60.service';
import { RelayListService } from '../relay-list/relay-list.service';
import { publishToRelaysWithAuth } from '../../helpers/websocket-auth';
import { FALLBACK_PROFILE_RELAYS } from '../../constants/fallback-relays';
import type { IdentityData, CashuProof } from '../storage/types';
import type {
  NutzapInfo,
  NutzapSendParams,
  NutzapReceived,
} from './nip60-types';
import {
  pubkeyFromPrivkey,
  buildNutzapEvent,
  parseNutzapEvent,
  parseNutzapInfoEvent,
  signEvent,
} from './nip60-core';

const QUERY_TIMEOUT_MS = 15000;

@Injectable({
  providedIn: 'root',
})
export class Nip61Service {
  constructor(
    private storageService: StorageService,
    private cashuService: CashuService,
    private nip60Service: Nip60Service,
    private relayListService: RelayListService
  ) {}

  // ---------------------------------------------------------------------------
  // Fetch Recipient Info
  // ---------------------------------------------------------------------------

  /**
   * Fetch a recipient's kind 10019 nutzap info event.
   * Returns their P2PK pubkey, preferred mints, and relay preferences.
   */
  async fetchNutzapInfo(recipientPubkey: string): Promise<NutzapInfo | null> {
    const relays = await this.getRecipientRelays(recipientPubkey);
    const pool = new SimplePool();

    try {
      const events = await this.queryWithTimeout(pool, relays, [{
        kinds: [10019],
        authors: [recipientPubkey],
      }]);

      if (events.length === 0) {
        return null;
      }

      // kind 10019 is replaceable -- take the most recent
      const latest = events.reduce((a, b) =>
        a.created_at > b.created_at ? a : b
      );

      return parseNutzapInfoEvent(latest);
    } finally {
      pool.close(relays);
    }
  }

  // ---------------------------------------------------------------------------
  // Send Nutzap
  // ---------------------------------------------------------------------------

  /**
   * Send a nutzap to a recipient.
   *
   * Flow:
   * 1. Fetch recipient's kind 10019 (mints, P2PK pubkey)
   * 2. Find a shared mint (one we have proofs for that the recipient trusts)
   * 3. P2PK-lock proofs to recipient's pubkey using NUT-11
   * 4. Update local proofs (keep change)
   * 5. Build and publish kind 9321 event
   * 6. Optionally push wallet state to relays
   */
  async sendNutzap(
    identity: IdentityData,
    params: NutzapSendParams
  ): Promise<{ eventId: string; amount: number }> {
    // 1. Get recipient's nutzap info
    const info = await this.fetchNutzapInfo(params.recipientPubkey);
    if (!info) {
      throw new Error('Recipient has no nutzap info (kind 10019). They may not accept nutzaps.');
    }
    if (!info.pubkey) {
      throw new Error('Recipient nutzap info has no P2PK pubkey.');
    }

    // 2. Find a shared mint
    const localMints = this.cashuService.getMints();
    let mintUrl = params.mintUrl;

    if (!mintUrl) {
      // Auto-select: find a mint that the recipient trusts AND we have balance on
      const sharedMint = localMints.find(m =>
        info.mints.includes(m.mintUrl) &&
        this.cashuService.getBalance(m.id) >= params.amount
      );
      if (sharedMint) {
        mintUrl = sharedMint.mintUrl;
      }
    }

    if (!mintUrl) {
      throw new Error('No shared mint with sufficient balance found. Recipient trusts: ' +
        info.mints.join(', '));
    }

    if (!info.mints.includes(mintUrl)) {
      throw new Error(`Recipient does not trust mint ${mintUrl}. Their trusted mints: ${info.mints.join(', ')}`);
    }

    const mintData = this.cashuService.getMintByUrl(mintUrl);
    if (!mintData) {
      throw new Error(`Mint ${mintUrl} not found locally.`);
    }

    const balance = this.cashuService.getBalance(mintData.id);
    if (balance < params.amount) {
      throw new Error(`Insufficient balance on mint ${mintUrl}. Have ${balance} sats, need ${params.amount} sats.`);
    }

    // 3. P2PK-lock proofs to recipient
    const localProofs: Proof[] = mintData.proofs.map(p => ({
      id: p.id,
      amount: p.amount,
      secret: p.secret,
      C: p.C,
    }));

    const mint = new Mint(mintUrl);
    const wallet = new Wallet(mint, { unit: mintData.unit || 'sat' });
    await wallet.loadMint();

    // Build P2PK output config
    const p2pkOptions = new P2PKBuilder()
      .addLockPubkey(info.pubkey)
      .toOptions();

    const { send, keep } = await wallet.send(params.amount, localProofs, {}, {
      send: { type: 'p2pk' as const, options: p2pkOptions },
    });

    // 4. Update local proofs (keep the change)
    const now = new Date().toISOString();
    const keepProofs: CashuProof[] = keep.map((p: Proof) => ({
      id: p.id,
      amount: p.amount,
      secret: p.secret,
      C: p.C,
      receivedAt: now,
    }));
    await this.storageService.updateCashuMintProofs(mintData.id, keepProofs);

    // 5. Build and publish kind 9321 event
    const sendParams: NutzapSendParams = {
      ...params,
      mintUrl,
    };
    const nutzapTemplate = buildNutzapEvent(sendParams, send);
    const nutzapEvent = signEvent(nutzapTemplate, identity.privkey);

    // Publish to recipient's relays (NIP-65 read relays) + fallback
    const recipientRelays = await this.getRecipientRelays(params.recipientPubkey);
    await publishToRelaysWithAuth(recipientRelays, nutzapEvent, identity.privkey);

    // 6. Publish spending history
    await this.nip60Service.publishSpendingHistory(identity, {
      direction: 'out',
      amount: params.amount,
      unit: 'sat',
      mint: mintUrl,
    });

    return {
      eventId: nutzapEvent.id,
      amount: params.amount,
    };
  }

  // ---------------------------------------------------------------------------
  // Receive / Redeem Nutzaps
  // ---------------------------------------------------------------------------

  /**
   * Check for and redeem incoming nutzaps.
   *
   * Flow:
   * 1. Query relays for kind 9321 events tagged with our pubkey
   * 2. Query kind 7376 events to find already-redeemed nutzaps
   * 3. For each unredeemed: verify mint, swap P2PK proofs
   * 4. Store received proofs
   * 5. Publish kind 7376 redemption history events
   */
  async redeemNutzaps(identity: IdentityData): Promise<NutzapReceived[]> {
    const pubkey = pubkeyFromPrivkey(identity.privkey);
    const readRelays = await this.nip60Service.getReadRelays(pubkey);
    const pool = new SimplePool();

    const redeemed: NutzapReceived[] = [];

    try {
      // 1. Query for nutzaps addressed to us
      const nutzapEvents = await this.queryWithTimeout(pool, readRelays, [{
        kinds: [9321],
        '#p': [pubkey],
      }]);

      if (nutzapEvents.length === 0) {
        return [];
      }

      // 2. Find already-redeemed nutzap IDs from our history
      const historyEvents = await this.queryWithTimeout(pool, readRelays, [{
        kinds: [7376],
        authors: [pubkey],
      }]);

      const redeemedIds = new Set<string>();
      for (const h of historyEvents) {
        for (const tag of h.tags) {
          if (tag[0] === 'e' && tag[3] === 'redeemed') {
            redeemedIds.add(tag[1]);
          }
        }
      }

      // 3. Get our trusted mints (from local config)
      const trustedMintUrls = new Set(
        this.cashuService.getMints().map(m => m.mintUrl)
      );

      // Get wallet privkey for P2PK unlocking
      const walletPrivkey = await this.nip60Service.getWalletPrivkey(identity);

      // 4. Process each unredeemed nutzap
      for (const event of nutzapEvents) {
        if (redeemedIds.has(event.id)) continue;

        try {
          const parsed = parseNutzapEvent(event);

          // Verify mint is trusted
          if (!trustedMintUrls.has(parsed.mint)) {
            console.warn(`Nutzap from untrusted mint ${parsed.mint}, skipping`);
            continue;
          }

          // Swap P2PK proofs using our wallet privkey
          const mint = new Mint(parsed.mint);
          const wallet = new Wallet(mint, { unit: 'sat' });
          await wallet.loadMint();

          // Receive/swap the P2PK-locked proofs
          const swappedProofs = await wallet.receive(
            { mint: parsed.mint, proofs: parsed.proofs, unit: 'sat' },
            { privkey: walletPrivkey }
          );

          // Store the swapped proofs locally
          let mintData = this.cashuService.getMintByUrl(parsed.mint);
          if (!mintData) {
            // Auto-add the mint
            const urlObj = new URL(parsed.mint);
            mintData = await this.storageService.addCashuMint({
              name: urlObj.hostname,
              mintUrl: parsed.mint,
              unit: 'sat',
            });
          }

          const now = new Date().toISOString();
          const newProofs: CashuProof[] = swappedProofs.map((p: Proof) => ({
            id: p.id,
            amount: p.amount,
            secret: p.secret,
            C: p.C,
            receivedAt: now,
          }));
          const mergedProofs = [...(mintData.proofs || []), ...newProofs];
          await this.storageService.updateCashuMintProofs(mintData.id, mergedProofs);

          // Publish kind 7376 redemption history
          await this.nip60Service.publishSpendingHistory(
            identity,
            {
              direction: 'in',
              amount: parsed.amount,
              unit: 'sat',
              mint: parsed.mint,
            },
            [{ id: event.id, marker: 'redeemed' }]
          );

          redeemed.push(parsed);
        } catch (err) {
          console.error(`Failed to redeem nutzap ${event.id}:`, err);
          // Continue to next nutzap
        }
      }
    } finally {
      pool.close(readRelays);
    }

    return redeemed;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Get relay URLs for querying a recipient's events.
   * Uses their NIP-65 read relays, falls back to profile relays.
   */
  private async getRecipientRelays(pubkey: string): Promise<string[]> {
    const nip65 = await this.relayListService.fetchRelayList(pubkey);
    const readRelays = nip65.filter(r => r.read).map(r => r.url);

    if (readRelays.length > 0) {
      return readRelays;
    }

    return FALLBACK_PROFILE_RELAYS;
  }

  /**
   * Query relays with a timeout.
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
