/**
 * VaultRelayService — Push/pull encrypted vault to/from Nostr relays.
 *
 * Uses NIP-78 (kind 30078) application-specific data events.
 * The vault is compressed, NIP-44 self-encrypted, and signed by
 * the vault owner identity.
 */

import { inject, Injectable } from '@angular/core';
import { SimplePool } from 'nostr-tools/pool';
import type { EventTemplate } from 'nostr-tools/pure';
import { StorageService } from './storage.service';
import { RelayListService } from '../relay-list/relay-list.service';
import { EncryptedVault, IdentityData } from './types';
import {
  encryptToSelf,
  decryptFromSelf,
  pubkeyFromPrivkey,
  signEvent,
} from '../cashu/nip60-core';
import {
  publishToRelaysWithAuth,
  filterAuthRelays,
  type PublishResult,
} from '../../helpers/websocket-auth';
import { compressString, decompressToString } from '../../helpers/compression';
import { FALLBACK_PROFILE_RELAYS } from '../../constants/fallback-relays';
import { Buffer } from 'buffer';

const VAULT_D_TAG = 'plebeian-signer-vault';
const VAULT_EVENT_KIND = 30078;
const QUERY_TIMEOUT_MS = 15000;

@Injectable({
  providedIn: 'root',
})
export class VaultRelayService {
  readonly #storage = inject(StorageService);
  readonly #relayList = inject(RelayListService);
  #pool: SimplePool | null = null;

  #getPool(): SimplePool {
    if (!this.#pool) {
      this.#pool = new SimplePool();
    }
    return this.#pool;
  }

  /**
   * Push the current encrypted vault to the vault owner's relays.
   */
  async pushVault(identity: IdentityData): Promise<PublishResult[]> {
    const vault = this.#storage.getBrowserSyncHandler().encryptedVault;
    if (!vault) {
      throw new Error('No vault data to push.');
    }

    const pubkey = pubkeyFromPrivkey(identity.privkey);

    // Serialize → compress → base64 → NIP-44 self-encrypt
    const json = JSON.stringify(vault);
    const compressed = await compressString(json);
    const base64Blob = Buffer.from(compressed).toString('base64');
    const encrypted = encryptToSelf(base64Blob, identity.privkey);

    // Build kind 30078 event
    const eventTemplate: EventTemplate = {
      kind: VAULT_EVENT_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', VAULT_D_TAG],
        ['client', 'plebeian-signer'],
      ],
      content: encrypted,
    };

    const signedEvent = signEvent(eventTemplate, identity.privkey);

    // Get write relays
    const relays = await this.#getWriteRelays(pubkey);
    if (relays.length === 0) {
      throw new Error('No write relays found. Publish a NIP-65 relay list first.');
    }

    // Optionally filter to AUTH-only relays
    const authOnly = this.#storage.getSignerMetaHandler().isRelaySyncAuthOnly();
    const targetRelays = authOnly ? await filterAuthRelays(relays) : relays;

    if (targetRelays.length === 0) {
      throw new Error('No AUTH-required relays found in your relay list.');
    }

    const results = await publishToRelaysWithAuth(targetRelays, signedEvent, identity.privkey);

    // Update last pushed timestamp
    const successCount = results.filter(r => r.success).length;
    if (successCount > 0) {
      await this.#storage.getSignerMetaHandler().setRelaySyncLastPushed(
        Math.floor(Date.now() / 1000)
      );
    }

    return results;
  }

  /**
   * Pull the vault from relays for a given identity.
   * Returns the vault and the event's created_at, or null if not found.
   */
  async pullVault(
    pubkey: string,
    privkey: string
  ): Promise<{ vault: EncryptedVault; createdAt: number } | null> {
    // Get read relays
    const nip65 = await this.#relayList.fetchRelayList(pubkey);
    const readRelays = nip65.filter(r => r.read).map(r => r.url);
    const relays = readRelays.length > 0 ? readRelays : FALLBACK_PROFILE_RELAYS;

    // Query for vault event
    const pool = this.#getPool();
    const events = await this.#queryWithTimeout(pool, relays, [
      { kinds: [VAULT_EVENT_KIND], authors: [pubkey], '#d': [VAULT_D_TAG] },
    ]);

    if (events.length === 0) {
      return null;
    }

    // Get latest event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const latest = events.reduce((a: any, b: any) =>
      b.created_at > a.created_at ? b : a
    );

    // NIP-44 decrypt → base64 decode → decompress → parse
    const decrypted = decryptFromSelf(latest.content, privkey);
    const compressed = Buffer.from(decrypted, 'base64');
    const json = await decompressToString(new Uint8Array(compressed));
    const vault = JSON.parse(json) as EncryptedVault;

    // Basic validation
    if (!vault.version || !vault.vaultHash) {
      throw new Error('Invalid vault data from relay.');
    }

    return { vault, createdAt: latest.created_at };
  }

  /**
   * Sync vault on unlock — compare local vs relay, use newer.
   * Returns which version was used.
   */
  async syncOnUnlock(identity: IdentityData): Promise<'local' | 'relay' | 'no-change'> {
    const pubkey = pubkeyFromPrivkey(identity.privkey);

    let remote: { vault: EncryptedVault; createdAt: number } | null = null;
    try {
      remote = await this.pullVault(pubkey, identity.privkey);
    } catch (err) {
      console.error('Failed to pull vault from relays:', err);
      return 'no-change';
    }

    if (!remote) {
      // No vault on relays — push local
      try {
        await this.pushVault(identity);
        return 'local';
      } catch (err) {
        console.error('Failed to push vault to relays:', err);
        return 'no-change';
      }
    }

    const lastPushed = this.#storage.getSignerMetaHandler().getRelaySyncLastPushed();

    if (remote.createdAt > lastPushed) {
      // Relay has newer vault — import it
      await this.#storage.getBrowserSyncHandler().saveAndSetFullData(remote.vault);
      return 'relay';
    }

    if (lastPushed > remote.createdAt) {
      // Local is newer — push to relays
      try {
        await this.pushVault(identity);
      } catch (err) {
        console.error('Failed to push vault to relays:', err);
      }
      return 'local';
    }

    return 'no-change';
  }

  /**
   * Get write relays for a pubkey, falling back to FALLBACK_PROFILE_RELAYS.
   */
  async #getWriteRelays(pubkey: string): Promise<string[]> {
    const nip65 = await this.#relayList.fetchRelayList(pubkey);
    const writeRelays = nip65.filter(r => r.write).map(r => r.url);
    return writeRelays.length > 0 ? writeRelays : FALLBACK_PROFILE_RELAYS;
  }

  /**
   * Query relays with a timeout.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async #queryWithTimeout(pool: SimplePool, relays: string[], filters: any[]): Promise<any[]> {
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
