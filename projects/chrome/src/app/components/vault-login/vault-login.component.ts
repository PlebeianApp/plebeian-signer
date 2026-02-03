import { AfterViewInit, Component, ElementRef, inject, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  ConfirmComponent,
  DerivingModalComponent,
  LoggerService,
  NostrHelper,
  ProfileMetadataService,
  StartupService,
  StorageService,
  SyncFlow,
  VaultRelayService,
} from '@common';
import { getNewStorageServiceConfig } from '../../common/data/get-new-storage-service-config';

@Component({
  selector: 'app-vault-login',
  templateUrl: './vault-login.component.html',
  styleUrl: './vault-login.component.scss',
  imports: [FormsModule, ConfirmComponent, DerivingModalComponent],
})
export class VaultLoginComponent implements AfterViewInit {
  @ViewChild('passwordInputElement') passwordInput!: ElementRef<HTMLInputElement>;
  @ViewChild('derivingModal') derivingModal!: DerivingModalComponent;

  loginPassword = '';
  showInvalidPasswordAlert = false;

  readonly #storage = inject(StorageService);
  readonly #router = inject(Router);
  readonly #startup = inject(StartupService);
  readonly #profileMetadata = inject(ProfileMetadataService);
  readonly #logger = inject(LoggerService);
  readonly #vaultRelay = inject(VaultRelayService);

  ngAfterViewInit() {
    this.passwordInput.nativeElement.focus();
  }

  toggleType(element: HTMLInputElement) {
    if (element.type === 'password') {
      element.type = 'text';
    } else {
      element.type = 'password';
    }
  }

  async loginVault() {
    console.log('[login] loginVault called');
    if (!this.loginPassword) {
      console.log('[login] No password, returning');
      return;
    }

    console.log('[login] Showing deriving modal');
    // Show deriving modal during key derivation (~3-6 seconds)
    this.derivingModal.show('Unlocking vault');

    try {
      console.log('[login] Calling unlockVault...');
      await this.#storage.unlockVault(this.loginPassword);
      console.log('[login] unlockVault succeeded!');
    } catch (error) {
      console.error('[login] unlockVault FAILED:', error);
      this.derivingModal.hide();
      this.showInvalidPasswordAlert = true;
      window.setTimeout(() => {
        this.showInvalidPasswordAlert = false;
      }, 2000);
      return;
    }

    // Unlock succeeded - hide modal and navigate
    console.log('[login] Hiding modal and navigating');
    this.derivingModal.hide();
    this.#logger.logVaultUnlock();

    // Fetch profile metadata for all identities in the background
    this.#fetchAllProfiles();

    // Wire relay sync push callback and sync on unlock (background)
    this.#initRelaySync();

    this.#router.navigateByUrl('/home/identity');
  }

  /**
   * Wire the debounced relay sync push callback and perform initial sync on unlock.
   * Runs in background — does not block navigation.
   */
  async #initRelaySync() {
    if (this.#storage.getSyncFlow() !== SyncFlow.RELAY_SYNC) return;

    const session = this.#storage.getBrowserSessionHandler().browserSessionData;
    if (!session?.identities?.length) return;

    const identityId = this.#storage.getSignerMetaHandler().getRelaySyncIdentityId();
    let identity = session.identities.find(i => i.id === identityId);

    // If configured identity not found (e.g. after vault re-import), fall back
    if (!identity) {
      identity = session.identities.find(i => i.id === session.selectedIdentityId)
        ?? session.identities[0];
      // Persist the new identity selection
      await this.#storage.getSignerMetaHandler().setRelaySyncIdentityId(identity.id);
      console.log(`[relay-sync] Configured identity not found, using ${identity.nick}`);
    }

    // Wire the debounced push callback
    this.#storage.setRelaySyncCallback(async () => {
      try {
        await this.#vaultRelay.pushVault(identity);
      } catch (err) {
        console.error('Relay sync push failed:', err);
      }
    });

    // Sync on unlock: compare local vs relay, use newer
    try {
      const result = await this.#vaultRelay.syncOnUnlock(identity);
      if (result === 'relay') {
        // Relay had newer vault — reinitialize to load it
        console.log('[relay-sync] Relay had newer vault, reinitializing');
        this.#storage.isInitialized = false;
        this.#startup.startOver(getNewStorageServiceConfig());
      } else {
        console.log(`[relay-sync] Sync result: ${result}`);
      }
    } catch (err) {
      console.error('Relay sync on unlock failed:', err);
    }
  }

  /**
   * Fetch profile metadata for all identities (runs in background)
   */
  async #fetchAllProfiles() {
    try {
      const identities =
        this.#storage.getBrowserSessionHandler().browserSessionData?.identities ?? [];

      if (identities.length === 0) {
        return;
      }

      // Get all pubkeys from identities
      const pubkeys = identities.map((identity) =>
        NostrHelper.pubkeyFromPrivkey(identity.privkey)
      );

      // Fetch all profiles in parallel
      await this.#profileMetadata.fetchProfiles(pubkeys);
    } catch (error) {
      console.error('Failed to fetch profiles:', error);
    }
  }

  async onClickResetExtension() {
    try {
      this.#logger.logVaultReset();
      await this.#storage.resetExtension();
      this.#startup.startOver(getNewStorageServiceConfig());
    } catch (error) {
      console.log(error);
      // TODO
    }
  }
}
