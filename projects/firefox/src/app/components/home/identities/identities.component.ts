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
import browser from 'webextension-polyfill';

const PERMISSION_LEVEL_LABELS: Record<PermissionLevel, string> = {
  cautious: 'Always Ask',
  session: 'Remember for Session',
  forever: 'Remember Forever',
  reckless: 'Auto-Approve',
};

@Component({
  selector: 'app-identities',
  imports: [IconButtonComponent, ToastComponent],
  templateUrl: './identities.component.html',
  styleUrl: './identities.component.scss',
})
export class IdentitiesComponent extends NavComponent implements OnInit {
  override readonly storage = inject(StorageService);
  readonly #router = inject(Router);
  readonly #profileMetadata = inject(ProfileMetadataService);
  readonly #logger = inject(LoggerService);
  activeHost: string | null = null;
  effectiveSelectedIdentityId: string | null = null;

  // Cache of pubkey -> profile for quick lookup
  #profileCache = new Map<string, ProfileMetadata | null>();

  get permissionLevelLabel(): string {
    const level = this.storage.getSignerMetaHandler().getPermissionLevel();
    return PERMISSION_LEVEL_LABELS[level];
  }

  async ngOnInit() {
    this.activeHost = await this.#getActiveHost();
    this.effectiveSelectedIdentityId = this.#getEffectiveSelectedIdentityId();
    await this.#profileMetadata.initialize();
    this.#loadProfiles();
  }

  async #getActiveHost(): Promise<string | null> {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const activeTabUrl = tabs[0]?.url;
      if (!activeTabUrl) {
        return null;
      }

      return new URL(activeTabUrl).host || null;
    } catch {
      return null;
    }
  }

  #getEffectiveSelectedIdentityId(): string | null {
    const sessionData = this.storage.getBrowserSessionHandler().browserSessionData;
    return this.storage.getSignerMetaHandler().getSelectedIdentityIdForHost(this.activeHost)
      ?? sessionData?.selectedIdentityId
      ?? null;
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
    if (this.activeHost) {
      await this.storage.getSignerMetaHandler().setSelectedIdentityIdForHost(this.activeHost, identityId);
      this.effectiveSelectedIdentityId = identityId;
    }
    await this.storage.switchIdentity(identityId);
  }

  isIdentitySelected(identityId: string): boolean {
    return identityId === this.effectiveSelectedIdentityId;
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
