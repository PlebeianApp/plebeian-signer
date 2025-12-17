import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  ConfirmComponent,
  NostrHelper,
  ProfileMetadataService,
  StartupService,
  StorageService,
} from '@common';
import { getNewStorageServiceConfig } from '../../common/data/get-new-storage-service-config';

@Component({
  selector: 'app-vault-login',
  templateUrl: './vault-login.component.html',
  styleUrl: './vault-login.component.scss',
  imports: [FormsModule, ConfirmComponent],
})
export class VaultLoginComponent {
  loginPassword = '';
  showInvalidPasswordAlert = false;

  readonly #storage = inject(StorageService);
  readonly #router = inject(Router);
  readonly #startup = inject(StartupService);
  readonly #profileMetadata = inject(ProfileMetadataService);

  toggleType(element: HTMLInputElement) {
    if (element.type === 'password') {
      element.type = 'text';
    } else {
      element.type = 'password';
    }
  }

  async loginVault() {
    if (!this.loginPassword) {
      return;
    }

    try {
      await this.#storage.unlockVault(this.loginPassword);

      // Fetch profile metadata for all identities in the background
      this.#fetchAllProfiles();

      this.#router.navigateByUrl('/home/identity');
    } catch (error) {
      this.showInvalidPasswordAlert = true;
      console.log(error);
      window.setTimeout(() => {
        this.showInvalidPasswordAlert = false;
      }, 2000);
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
      await this.#storage.resetExtension();
      this.#startup.startOver(getNewStorageServiceConfig());
    } catch (error) {
      console.log(error);
      // TODO
    }
  }
}
