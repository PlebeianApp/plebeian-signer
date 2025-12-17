import { Injectable } from '@angular/core';
import { SimplePool } from 'nostr-tools/pool';
import { FALLBACK_PROFILE_RELAYS } from '../../constants/fallback-relays';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_TIMEOUT_MS = 10000; // 10 seconds
const STORAGE_KEY = 'relayListCache';

/**
 * NIP-65 Relay List entry
 */
export interface Nip65Relay {
  url: string;
  read: boolean;
  write: boolean;
}

/**
 * Cached relay list for a pubkey
 */
export interface RelayListCache {
  pubkey: string;
  relays: Nip65Relay[];
  fetchedAt: number;
}

/**
 * Cache for relay lists, stored in session storage
 */
type RelayListCacheMap = Record<string, RelayListCache>;

@Injectable({
  providedIn: 'root',
})
export class RelayListService {
  #cache: RelayListCacheMap = {};
  #pool: SimplePool | null = null;
  #fetchPromises = new Map<string, Promise<Nip65Relay[]>>();
  #initialized = false;
  #initPromise: Promise<void> | null = null;

  /**
   * Initialize the service by loading cache from session storage
   */
  async initialize(): Promise<void> {
    if (this.#initialized) {
      return;
    }

    if (this.#initPromise) {
      return this.#initPromise;
    }

    this.#initPromise = this.#loadCacheFromStorage();
    await this.#initPromise;
    this.#initialized = true;
  }

  /**
   * Load cache from browser session storage
   */
  async #loadCacheFromStorage(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        const result = await chrome.storage.session.get(STORAGE_KEY);
        if (result[STORAGE_KEY]) {
          this.#cache = result[STORAGE_KEY];
          this.#pruneStaleCache();
        }
      }
    } catch (error) {
      console.error('Failed to load relay list cache from storage:', error);
    }
  }

  /**
   * Save cache to browser session storage
   */
  async #saveCacheToStorage(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        await chrome.storage.session.set({ [STORAGE_KEY]: this.#cache });
      }
    } catch (error) {
      console.error('Failed to save relay list cache to storage:', error);
    }
  }

  /**
   * Remove stale entries from cache
   */
  #pruneStaleCache(): void {
    const now = Date.now();
    for (const pubkey of Object.keys(this.#cache)) {
      if (now - this.#cache[pubkey].fetchedAt > CACHE_TTL_MS) {
        delete this.#cache[pubkey];
      }
    }
  }

  /**
   * Get the SimplePool instance, creating it if necessary
   */
  #getPool(): SimplePool {
    if (!this.#pool) {
      this.#pool = new SimplePool();
    }
    return this.#pool;
  }

  /**
   * Get cached relay list for a pubkey
   */
  getCachedRelayList(pubkey: string): Nip65Relay[] | null {
    const cached = this.#cache[pubkey];
    if (!cached) {
      return null;
    }

    if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
      delete this.#cache[pubkey];
      return null;
    }

    return cached.relays;
  }

  /**
   * Fetch NIP-65 relay list for a single pubkey
   */
  async fetchRelayList(pubkey: string): Promise<Nip65Relay[]> {
    await this.initialize();

    // Check cache first
    const cached = this.getCachedRelayList(pubkey);
    if (cached) {
      return cached;
    }

    // Check if already fetching
    const existingPromise = this.#fetchPromises.get(pubkey);
    if (existingPromise) {
      return existingPromise;
    }

    // Start new fetch
    const fetchPromise = this.#doFetchRelayList(pubkey);
    this.#fetchPromises.set(pubkey, fetchPromise);

    try {
      const result = await fetchPromise;
      return result;
    } finally {
      this.#fetchPromises.delete(pubkey);
    }
  }

  /**
   * Internal method to fetch a single relay list
   */
  async #doFetchRelayList(pubkey: string): Promise<Nip65Relay[]> {
    const pool = this.#getPool();

    try {
      const events = await this.#queryWithTimeout(
        pool,
        FALLBACK_PROFILE_RELAYS,
        [{ kinds: [10002], authors: [pubkey] }],
        FETCH_TIMEOUT_MS
      );

      if (events.length === 0) {
        return [];
      }

      // Get the most recent event (kind 10002 is replaceable)
      const latestEvent = events.reduce((latest, event) =>
        event.created_at > latest.created_at ? event : latest
      );

      // Parse relay tags
      const relays: Nip65Relay[] = [];
      for (const tag of latestEvent.tags) {
        if (tag[0] === 'r' && tag[1]) {
          const url = tag[1];
          const marker = tag[2]; // Optional: "read" or "write"

          let read = true;
          let write = true;

          if (marker === 'read') {
            write = false;
          } else if (marker === 'write') {
            read = false;
          }
          // No marker means both read and write

          relays.push({ url, read, write });
        }
      }

      // Cache the result
      this.#cache[pubkey] = {
        pubkey,
        relays,
        fetchedAt: Date.now(),
      };
      await this.#saveCacheToStorage();

      return relays;
    } catch (error) {
      console.error(`Failed to fetch relay list for ${pubkey}:`, error);
      return [];
    }
  }

  /**
   * Query relays with a timeout
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async #queryWithTimeout(pool: SimplePool, relays: string[], filters: any[], timeoutMs: number): Promise<any[]> {
    return new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const events: any[] = [];
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(events);
        }
      }, timeoutMs);

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

  /**
   * Clear the cache
   */
  async clearCache(): Promise<void> {
    this.#cache = {};
    await this.#saveCacheToStorage();
  }

  /**
   * Clear cache for a specific pubkey
   */
  async clearCacheForPubkey(pubkey: string): Promise<void> {
    delete this.#cache[pubkey];
    await this.#saveCacheToStorage();
  }
}
