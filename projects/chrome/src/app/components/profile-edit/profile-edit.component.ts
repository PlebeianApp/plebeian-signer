import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  FALLBACK_PROFILE_RELAYS,
  NavComponent,
  NostrHelper,
  ProfileMetadataService,
  RelayListService,
  StorageService,
  ToastComponent,
  publishToRelaysWithAuth,
} from '@common';
import { SimplePool } from 'nostr-tools/pool';
import { finalizeEvent } from 'nostr-tools';
import { hexToBytes } from '@noble/hashes/utils';

interface ProfileFormData {
  name: string;
  display_name: string;
  picture: string;
  banner: string;
  website: string;
  about: string;
  nip05: string;
  lud16: string;
  lnurl: string;
}

@Component({
  selector: 'app-profile-edit',
  templateUrl: './profile-edit.component.html',
  styleUrl: './profile-edit.component.scss',
  imports: [FormsModule, ToastComponent],
})
export class ProfileEditComponent extends NavComponent implements OnInit {
  readonly #storage = inject(StorageService);
  readonly #router = inject(Router);
  readonly #profileMetadata = inject(ProfileMetadataService);
  readonly #relayList = inject(RelayListService);

  profile: ProfileFormData = {
    name: '',
    display_name: '',
    picture: '',
    banner: '',
    website: '',
    about: '',
    nip05: '',
    lud16: '',
    lnurl: '',
  };

  // Store original event content to preserve extra fields
  #originalContent: Record<string, unknown> = {};
  #originalTags: string[][] = [];

  loading = true;
  saving = false;
  alertMessage: string | undefined;
  #privkey: string | undefined;
  #pubkey: string | undefined;

  async ngOnInit() {
    await this.#loadProfile();
  }

  async #loadProfile() {
    try {
      const selectedIdentityId =
        this.#storage.getBrowserSessionHandler().browserSessionData
          ?.selectedIdentityId ?? null;

      const identity = this.#storage
        .getBrowserSessionHandler()
        .browserSessionData?.identities.find(
          (x) => x.id === selectedIdentityId
        );

      if (!identity) {
        this.loading = false;
        return;
      }

      this.#privkey = identity.privkey;
      this.#pubkey = NostrHelper.pubkeyFromPrivkey(identity.privkey);

      // Initialize services
      await this.#profileMetadata.initialize();

      // Try to get cached profile first
      const cachedProfile = this.#profileMetadata.getCachedProfile(this.#pubkey);
      if (cachedProfile) {
        this.profile = {
          name: cachedProfile.name || '',
          display_name: cachedProfile.display_name || cachedProfile.displayName || '',
          picture: cachedProfile.picture || '',
          banner: cachedProfile.banner || '',
          website: cachedProfile.website || '',
          about: cachedProfile.about || '',
          nip05: cachedProfile.nip05 || '',
          lud16: cachedProfile.lud16 || '',
          lnurl: cachedProfile.lud06 || '',
        };
      }

      // Fetch the actual kind 0 event to get original content and tags
      await this.#fetchOriginalEvent();

      this.loading = false;
    } catch (error) {
      console.error('Failed to load profile:', error);
      this.loading = false;
    }
  }

  async #fetchOriginalEvent() {
    if (!this.#pubkey) return;

    const pool = new SimplePool();
    try {
      const events = await this.#queryWithTimeout(
        pool,
        FALLBACK_PROFILE_RELAYS,
        [{ kinds: [0], authors: [this.#pubkey] }],
        10000
      );

      if (events.length > 0) {
        // Get the most recent event
        const latestEvent = events.reduce((latest, event) =>
          event.created_at > latest.created_at ? event : latest
        );

        // Store original tags (excluding the ones we'll update)
        this.#originalTags = latestEvent.tags.filter(
          (tag: string[]) =>
            tag[0] !== 'name' &&
            tag[0] !== 'display_name' &&
            tag[0] !== 'picture' &&
            tag[0] !== 'banner' &&
            tag[0] !== 'website' &&
            tag[0] !== 'about' &&
            tag[0] !== 'nip05' &&
            tag[0] !== 'lud16' &&
            tag[0] !== 'client'
        );

        // Parse and store original content
        try {
          this.#originalContent = JSON.parse(latestEvent.content);

          // Update form with values from event content
          this.profile = {
            name: (this.#originalContent['name'] as string) || '',
            display_name:
              (this.#originalContent['display_name'] as string) ||
              (this.#originalContent['displayName'] as string) ||
              '',
            picture: (this.#originalContent['picture'] as string) || '',
            banner: (this.#originalContent['banner'] as string) || '',
            website: (this.#originalContent['website'] as string) || '',
            about: (this.#originalContent['about'] as string) || '',
            nip05: (this.#originalContent['nip05'] as string) || '',
            lud16: (this.#originalContent['lud16'] as string) || '',
            lnurl: (this.#originalContent['lnurl'] as string) || '',
          };
        } catch {
          console.error('Failed to parse profile content');
        }
      }
    } finally {
      pool.close(FALLBACK_PROFILE_RELAYS);
    }
  }

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

  async onClickSave() {
    if (this.saving || !this.#privkey || !this.#pubkey) return;

    this.saving = true;
    this.alertMessage = undefined;

    try {
      // Build the content JSON, preserving extra fields
      const content: Record<string, unknown> = { ...this.#originalContent };

      // Update with form values
      content['name'] = this.profile.name;
      content['display_name'] = this.profile.display_name;
      content['displayName'] = this.profile.display_name; // Some clients use this
      content['picture'] = this.profile.picture;
      content['banner'] = this.profile.banner;
      content['website'] = this.profile.website;
      content['about'] = this.profile.about;
      content['nip05'] = this.profile.nip05;
      content['lud16'] = this.profile.lud16;
      if (this.profile.lnurl) {
        content['lnurl'] = this.profile.lnurl;
      }
      content['pubkey'] = this.#pubkey;

      // Build tags array, preserving extra tags
      const tags: string[][] = [...this.#originalTags];

      // Add standard tags
      if (this.profile.name) tags.push(['name', this.profile.name]);
      if (this.profile.display_name) tags.push(['display_name', this.profile.display_name]);
      if (this.profile.picture) tags.push(['picture', this.profile.picture]);
      if (this.profile.banner) tags.push(['banner', this.profile.banner]);
      if (this.profile.website) tags.push(['website', this.profile.website]);
      if (this.profile.about) tags.push(['about', this.profile.about]);
      if (this.profile.nip05) tags.push(['nip05', this.profile.nip05]);
      if (this.profile.lud16) tags.push(['lud16', this.profile.lud16]);

      // Add alt tag if not present
      if (!tags.some(t => t[0] === 'alt')) {
        tags.push(['alt', `User profile for ${this.profile.name || this.profile.display_name || 'user'}`]);
      }

      // Always add client tag
      tags.push(['client', 'plebeian-signer']);

      // Create the unsigned event
      const unsignedEvent = {
        kind: 0,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: JSON.stringify(content),
      };

      // Sign the event
      const privkeyBytes = hexToBytes(this.#privkey);
      const signedEvent = finalizeEvent(unsignedEvent, privkeyBytes);

      // Get write relays from NIP-65 or use fallback
      await this.#relayList.initialize();
      const writeRelays = await this.#relayList.fetchRelayList(this.#pubkey);
      let relayUrls: string[];

      if (writeRelays.length > 0) {
        // Filter to write relays only
        relayUrls = writeRelays
          .filter(r => r.write)
          .map(r => r.url);

        // If no write relays found, use all relays
        if (relayUrls.length === 0) {
          relayUrls = writeRelays.map(r => r.url);
        }
      } else {
        // Use fallback relays
        relayUrls = FALLBACK_PROFILE_RELAYS;
      }

      // Publish to relays with NIP-42 authentication support
      const results = await publishToRelaysWithAuth(
        relayUrls,
        signedEvent,
        this.#privkey
      );

      // Count successes
      const successes = results.filter(r => r.success);
      const failures = results.filter(r => !r.success);

      if (failures.length > 0) {
        console.log('Some relays failed:', failures.map(f => `${f.relay}: ${f.message}`));
      }

      if (successes.length === 0) {
        throw new Error('Failed to publish to any relay');
      }

      console.log(`Profile published to ${successes.length}/${results.length} relays`);

      // Clear cached profile and refetch
      await this.#profileMetadata.clearCacheForPubkey(this.#pubkey);
      await this.#profileMetadata.fetchProfile(this.#pubkey);

      // Navigate back to identity page
      this.#router.navigateByUrl('/home/identity');
    } catch (error) {
      console.error('Failed to save profile:', error);
      this.alertMessage = error instanceof Error ? error.message : 'Failed to save profile';
      setTimeout(() => {
        this.alertMessage = undefined;
      }, 4500);
    } finally {
      this.saving = false;
    }
  }

  onClickCancel() {
    this.#router.navigateByUrl('/home/identity');
  }
}
