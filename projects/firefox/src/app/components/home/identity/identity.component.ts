import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  Identity_DECRYPTED,
  LoggerService,
  NostrHelper,
  ProfileMetadata,
  ProfileMetadataService,
  PubkeyComponent,
  StorageService,
  ToastComponent,
  VisualNip05Pipe,
  validateNip05,
} from '@common';

@Component({
  selector: 'app-identity',
  imports: [PubkeyComponent, VisualNip05Pipe, ToastComponent],
  templateUrl: './identity.component.html',
  styleUrl: './identity.component.scss',
})
export class IdentityComponent implements OnInit {
  selectedIdentity: Identity_DECRYPTED | undefined;
  selectedIdentityNpub: string | undefined;
  profile: ProfileMetadata | null = null;
  nip05isValidated: boolean | undefined;
  validating = false;
  loading = true;

  readonly #storage = inject(StorageService);
  readonly #router = inject(Router);
  readonly #profileMetadata = inject(ProfileMetadataService);
  readonly #logger = inject(LoggerService);

  ngOnInit(): void {
    this.#loadData();
  }

  get displayName(): string | undefined {
    return this.#profileMetadata.getDisplayName(this.profile);
  }

  get username(): string | undefined {
    return this.#profileMetadata.getUsername(this.profile);
  }

  get avatarUrl(): string | undefined {
    return this.profile?.picture;
  }

  get bannerUrl(): string | undefined {
    return this.profile?.banner;
  }

  get aboutText(): string | undefined {
    return this.profile?.about;
  }

  copyToClipboard(pubkey: string | undefined) {
    if (!pubkey) {
      return;
    }
    navigator.clipboard.writeText(pubkey);
  }

  onClickShowDetails() {
    if (!this.selectedIdentity) {
      return;
    }

    this.#router.navigateByUrl(
      `/edit-identity/${this.selectedIdentity.id}/home`
    );
  }

  onClickEditProfile() {
    if (!this.selectedIdentity) {
      return;
    }
    this.#router.navigateByUrl('/profile-edit');
  }

  async onClickLock() {
    this.#logger.logVaultLock();
    await this.#storage.lockVault();
    this.#router.navigateByUrl('/vault-login');
  }

  async #loadData() {
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

      this.selectedIdentity = identity;
      const pubkey = NostrHelper.pubkeyFromPrivkey(identity.privkey);
      this.selectedIdentityNpub = NostrHelper.pubkey2npub(pubkey);

      // Initialize the profile metadata service (loads cache from storage)
      await this.#profileMetadata.initialize();

      // Check if we have cached profile data
      const cachedProfile = this.#profileMetadata.getCachedProfile(pubkey);
      if (cachedProfile) {
        this.profile = cachedProfile;
        this.loading = false;
        // Validate NIP-05 if present (in background)
        if (cachedProfile.nip05) {
          this.#validateNip05(pubkey, cachedProfile.nip05);
        }
        return; // Use cached data, don't fetch again
      }

      // No cached data, fetch from relays
      this.loading = true;
      const fetchedProfile = await this.#profileMetadata.fetchProfile(pubkey);
      if (fetchedProfile) {
        this.profile = fetchedProfile;
        // Validate NIP-05 if present
        if (fetchedProfile.nip05) {
          this.#validateNip05(pubkey, fetchedProfile.nip05);
        }
      }

      this.loading = false;
    } catch (error) {
      console.error(error);
      this.loading = false;
    }
  }

  async #validateNip05(pubkey: string, nip05: string) {
    try {
      this.validating = true;

      // Direct NIP-05 validation - fetches .well-known/nostr.json directly
      const result = await validateNip05(nip05, pubkey);
      this.nip05isValidated = result.valid;

      if (result.valid) {
        this.#logger.logNip05ValidationSuccess(nip05, pubkey);
      } else {
        this.#logger.logNip05ValidationError(nip05, result.error ?? 'Unknown error');
      }

      this.validating = false;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.#logger.logNip05ValidationError(nip05, errorMsg);
      this.nip05isValidated = false;
      this.validating = false;
    }
  }
}
