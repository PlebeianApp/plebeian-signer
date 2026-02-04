import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  IconButtonComponent,
  Identity_DECRYPTED,
  LoggerService,
  NavComponent,
  NostrHelper,
  PermissionLevel,
  ProfileMetadata,
  ProfileMetadataService,
  StorageService,
  ToastComponent,
} from '@common';

const PERMISSION_LEVEL_LABELS: Record<PermissionLevel, string> = {
  cautious: 'Always Ask',
  session: 'Remember for Session',
  forever: 'Remember Forever',
  reckless: 'Auto-Approve',
};

@Component({
  selector: 'app-identities',
  templateUrl: './identities.component.html',
  styleUrl: './identities.component.scss',
  imports: [IconButtonComponent, ToastComponent],
})
export class IdentitiesComponent extends NavComponent implements OnInit {
  override readonly storage = inject(StorageService);
  readonly #router = inject(Router);
  readonly #profileMetadata = inject(ProfileMetadataService);
  readonly #logger = inject(LoggerService);

  // Cache of pubkey -> profile for quick lookup
  #profileCache = new Map<string, ProfileMetadata | null>();

  get permissionLevelLabel(): string {
    const level = this.storage.getSignerMetaHandler().getPermissionLevel();
    return PERMISSION_LEVEL_LABELS[level];
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

  onClickPermissionSettings() {
    this.#router.navigateByUrl('/permission-settings');
  }

  async onClickLock() {
    this.#logger.logVaultLock();
    await this.storage.lockVault();
    this.#router.navigateByUrl('/vault-login');
  }
}
