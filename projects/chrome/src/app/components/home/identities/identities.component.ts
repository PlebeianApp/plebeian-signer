import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  IconButtonComponent,
  Identity_DECRYPTED,
  LoggerService,
  NostrHelper,
  ProfileMetadata,
  ProfileMetadataService,
  StorageService,
  ToastComponent,
} from '@common';

@Component({
  selector: 'app-identities',
  templateUrl: './identities.component.html',
  styleUrl: './identities.component.scss',
  imports: [IconButtonComponent, ToastComponent],
})
export class IdentitiesComponent implements OnInit {
  readonly storage = inject(StorageService);
  readonly #router = inject(Router);
  readonly #profileMetadata = inject(ProfileMetadataService);
  readonly #logger = inject(LoggerService);

  // Cache of pubkey -> profile for quick lookup
  #profileCache = new Map<string, ProfileMetadata | null>();

  get isRecklessMode(): boolean {
    return this.storage.getSignerMetaHandler().signerMetaData?.recklessMode ?? false;
  }

  async ngOnInit() {
    await this.#profileMetadata.initialize();
    this.#loadProfiles();
  }

  #loadProfiles() {
    const identities = this.storage.getBrowserSessionHandler().browserSessionData?.identities ?? [];
    for (const identity of identities) {
      const pubkey = NostrHelper.pubkeyFromPrivkey(identity.privkey);
      const profile = this.#profileMetadata.getCachedProfile(pubkey);
      this.#profileCache.set(identity.id, profile);
    }
  }

  getAvatarUrl(identity: Identity_DECRYPTED): string {
    const profile = this.#profileCache.get(identity.id);
    return profile?.picture || 'person-fill.svg';
  }

  getDisplayName(identity: Identity_DECRYPTED): string {
    const profile = this.#profileCache.get(identity.id) ?? null;
    return this.#profileMetadata.getDisplayName(profile) || identity.nick;
  }

  onClickNewIdentity() {
    this.#router.navigateByUrl('/new-identity');
  }

  onClickEditIdentity(identityId: string, event: MouseEvent) {
    event.stopPropagation();
    this.#router.navigateByUrl(`/edit-identity/${identityId}/home`);
  }

  async onClickSelectIdentity(identityId: string) {
    await this.storage.switchIdentity(identityId);
  }

  async onToggleRecklessMode() {
    const newValue = !this.isRecklessMode;
    await this.storage.getSignerMetaHandler().setRecklessMode(newValue);
  }

  onClickWhitelistedApps() {
    this.#router.navigateByUrl('/whitelisted-apps');
  }

  async onClickLock() {
    this.#logger.logVaultLock();
    await this.storage.lockVault();
    this.#router.navigateByUrl('/vault-login');
  }
}
