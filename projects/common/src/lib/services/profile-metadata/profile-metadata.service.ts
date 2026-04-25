import { inject, Injectable } from '@angular/core';
import { SimplePool } from 'nostr-tools/pool';
import { FALLBACK_PROFILE_RELAYS } from '../../constants/fallback-relays';
import { ProfileMetadata, ProfileMetadataCache } from '../storage/types';
import { LoggerService } from '../logger/logger.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_TIMEOUT_MS = 10000; // 10 seconds
const FAST_FIRST_EVENT_SETTLE_MS = 350;
const STORAGE_KEY = 'profileMetadataCache';

@Injectable({
  providedIn: 'root',
})
export class ProfileMetadataService {
  readonly #logger = inject(LoggerService);
  #cache: ProfileMetadataCache = {};
  #pool: SimplePool | null = null;
  #fetchPromises = new Map<string, Promise<ProfileMetadata | null>>();
  #initialized = false;
  #initPromise: Promise<void> | null = null;

  /**
    * Initialize the service by loading cache from browser storage
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
   * Load cache from browser storage.
   * Prefer session for speed, fall back to local for persistence across restarts.
   */
  async #loadCacheFromStorage(): Promise<void> {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        return;
      }

      let loaded = false;

      // First try session cache (fast in-memory browser storage)
      if (chrome.storage.session) {
        const sessionResult = await chrome.storage.session.get(STORAGE_KEY);
        if (sessionResult[STORAGE_KEY]) {
          this.#cache = sessionResult[STORAGE_KEY];
          loaded = true;
        }
      }

      // If session cache is empty (e.g. after browser restart), hydrate from local cache
      if (!loaded && chrome.storage.local) {
        const localResult = await chrome.storage.local.get(STORAGE_KEY);
        if (localResult[STORAGE_KEY]) {
          this.#cache = localResult[STORAGE_KEY];
          loaded = true;

          // Warm session cache for faster subsequent reads in this run
          if (chrome.storage.session) {
            await chrome.storage.session.set({ [STORAGE_KEY]: this.#cache });
          }
        }
      }

      if (loaded) {
        // Clean up stale entries and persist pruned cache
        this.#pruneStaleCache();
        await this.#saveCacheToStorage();
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.#logger.logStorageError('load profile cache', errorMsg);
    }
  }

  /**
   * Save cache to browser storage.
   * Write-through to both session and local to combine speed + persistence.
   */
  async #saveCacheToStorage(): Promise<void> {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        return;
      }

      if (chrome.storage.session) {
        await chrome.storage.session.set({ [STORAGE_KEY]: this.#cache });
      }

      if (chrome.storage.local) {
        await chrome.storage.local.set({ [STORAGE_KEY]: this.#cache });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.#logger.logStorageError('save profile cache', errorMsg);
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
   * Get cached profile metadata for a pubkey
   */
  getCachedProfile(pubkey: string): ProfileMetadata | null {
    const cached = this.#cache[pubkey];
    if (!cached) {
      return null;
    }

    // Check if cache is still valid
    if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
      delete this.#cache[pubkey];
      return null;
    }

    return cached;
  }

  /**
   * Fetch profile metadata for a single pubkey
   */
  async fetchProfile(pubkey: string): Promise<ProfileMetadata | null> {
    // Ensure initialized
    await this.initialize();

    // Check cache first
    const cached = this.getCachedProfile(pubkey);
    if (cached) {
      return cached;
    }

    // Check if already fetching
    const existingPromise = this.#fetchPromises.get(pubkey);
    if (existingPromise) {
      return existingPromise;
    }

    // Start new fetch
    const fetchPromise = this.#doFetchProfile(pubkey);
    this.#fetchPromises.set(pubkey, fetchPromise);

    try {
      const result = await fetchPromise;
      return result;
    } finally {
      this.#fetchPromises.delete(pubkey);
    }
  }

  /**
   * Fetch profiles for multiple pubkeys in parallel
   */
  async fetchProfiles(pubkeys: string[]): Promise<Map<string, ProfileMetadata | null>> {
    // Ensure initialized
    await this.initialize();

    const results = new Map<string, ProfileMetadata | null>();

    // Filter out pubkeys we already have cached
    const uncachedPubkeys: string[] = [];
    for (const pubkey of pubkeys) {
      const cached = this.getCachedProfile(pubkey);
      if (cached) {
        results.set(pubkey, cached);
      } else {
        uncachedPubkeys.push(pubkey);
      }
    }

    if (uncachedPubkeys.length === 0) {
      return results;
    }

    // Fetch all uncached profiles
    const pool = this.#getPool();

    try {
      const events = await this.#queryWithTimeout(
        pool,
        FALLBACK_PROFILE_RELAYS,
        [{ kinds: [0], authors: uncachedPubkeys }],
        FETCH_TIMEOUT_MS
      );

      // Process events - keep only the most recent event per pubkey
      const latestEvents = new Map<string, { created_at: number; content: string }>();

      for (const event of events) {
        const existing = latestEvents.get(event.pubkey);
        if (!existing || event.created_at > existing.created_at) {
          latestEvents.set(event.pubkey, {
            created_at: event.created_at,
            content: event.content,
          });
        }
      }

      // Parse and cache the profiles
      for (const [pubkey, eventData] of latestEvents) {
        try {
          const content = JSON.parse(eventData.content);
          const profile: ProfileMetadata = {
            pubkey,
            name: content.name,
            display_name: content.display_name,
            displayName: content.displayName,
            picture: content.picture,
            banner: content.banner,
            about: content.about,
            website: content.website,
            nip05: content.nip05,
            lud06: content.lud06,
            lud16: content.lud16,
            fetchedAt: Date.now(),
          };
          this.#cache[pubkey] = profile;
          results.set(pubkey, profile);
        } catch {
          this.#logger.logProfileParseError(pubkey);
          results.set(pubkey, null);
        }
      }

      // Set null for pubkeys we didn't find
      for (const pubkey of uncachedPubkeys) {
        if (!results.has(pubkey)) {
          results.set(pubkey, null);
        }
      }

      // Save updated cache to storage
      await this.#saveCacheToStorage();

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.#logger.logProfileFetchError('multiple', errorMsg);
      // Set null for all unfetched pubkeys on error
      for (const pubkey of uncachedPubkeys) {
        if (!results.has(pubkey)) {
          results.set(pubkey, null);
        }
      }
    }

    return results;
  }

  /**
   * Internal method to fetch a single profile
   */
  async #doFetchProfile(pubkey: string): Promise<ProfileMetadata | null> {
    const pool = this.#getPool();

    try {
      const events = await this.#querySingleProfileFast(
        pool,
        FALLBACK_PROFILE_RELAYS,
        [{ kinds: [0], authors: [pubkey] }],
        FETCH_TIMEOUT_MS
      );

      if (events.length === 0) {
        return null;
      }

      // Get the most recent event
      const latestEvent = events.reduce((latest, event) =>
        event.created_at > latest.created_at ? event : latest
      );

      try {
        const content = JSON.parse(latestEvent.content);
        const profile: ProfileMetadata = {
          pubkey,
          name: content.name,
          display_name: content.display_name,
          displayName: content.displayName,
          picture: content.picture,
          banner: content.banner,
          about: content.about,
          website: content.website,
          nip05: content.nip05,
          lud06: content.lud06,
          lud16: content.lud16,
          fetchedAt: Date.now(),
        };
        this.#cache[pubkey] = profile;

        // Save updated cache to storage
        await this.#saveCacheToStorage();

        return profile;
      } catch {
        this.#logger.logProfileParseError(pubkey);
        return null;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.#logger.logProfileFetchError(pubkey, errorMsg);
      return null;
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
   * Query a single profile quickly: as soon as we get first event,
   * wait a short settle window for potentially newer events, then return.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async #querySingleProfileFast(pool: SimplePool, relays: string[], filters: any[], timeoutMs: number): Promise<any[]> {
    return new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const events: any[] = [];
      let settled = false;
      let settleTimer: ReturnType<typeof setTimeout> | null = null;

      const finish = () => {
        if (!settled) {
          settled = true;
          if (settleTimer) {
            clearTimeout(settleTimer);
          }
          clearTimeout(timeout);
          sub.close();
          resolve(events);
        }
      };

      const timeout = setTimeout(() => {
        finish();
      }, timeoutMs);

      const sub = pool.subscribeMany(relays, filters, {
        onevent(event) {
          events.push(event);

          // Return quickly after first result, but allow a short window
          // to collect any fresher duplicate profile events.
          if (settleTimer) {
            clearTimeout(settleTimer);
          }
          settleTimer = setTimeout(() => {
            finish();
          }, FAST_FIRST_EVENT_SETTLE_MS);
        },
        oneose() {
          finish();
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

  /**
   * Get the display name for a profile (prioritizes display_name over name)
   */
  getDisplayName(profile: ProfileMetadata | null): string | undefined {
    if (!profile) return undefined;
    return profile.display_name || profile.displayName || profile.name;
  }

  /**
   * Get the username for a profile (prioritizes name over display_name)
   */
  getUsername(profile: ProfileMetadata | null): string | undefined {
    if (!profile) return undefined;
    return profile.name || profile.display_name || profile.displayName;
  }
}
