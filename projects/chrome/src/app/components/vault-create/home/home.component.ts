import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  NavComponent,
  NostrHelper,
  StorageService,
  StartupService,
  SignerMetaData_VaultSnapshot,
  VaultRelayService,
} from '@common';
import { generateSecretKey } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';
import browser from 'webextension-polyfill';
import { getNewStorageServiceConfig } from '../../../common/data/get-new-storage-service-config';

const VAULT_SNAPSHOTS_KEY = 'vaultSnapshots';

@Component({
  selector: 'app-home',
  imports: [FormsModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent extends NavComponent implements OnInit {
  readonly router = inject(Router);
  readonly #storage = inject(StorageService);
  readonly #startup = inject(StartupService);
  readonly #vaultRelay = inject(VaultRelayService);

  nickname = '';
  nsecInput = '';
  isNsecValid = false;
  snapshots: SignerMetaData_VaultSnapshot[] = [];
  selectedSnapshot: SignerMetaData_VaultSnapshot | undefined;

  // Restore from relays
  relayRestoreNsec = '';
  isRelayNsecValid = false;
  relayRestoring = false;
  relayRestoreStep = '';
  relayRestoreError = '';

  ngOnInit(): void {
    this.#loadSnapshots();

    // Refresh snapshots when storage changes (e.g., import window added one)
    browser.storage.onChanged.addListener((changes) => {
      if (changes['vaultSnapshots']) {
        this.#loadSnapshots();
      }
    });
  }

  onFileButtonClick(): void {
    browser.runtime.sendMessage({ type: 'open-import', action: 'snapshot' });
  }

  generateKey() {
    const sk = generateSecretKey();
    const privkey = bytesToHex(sk);
    this.nsecInput = NostrHelper.privkey2nsec(privkey);
    this.validateNsec();
  }

  toggleVisibility(element: HTMLInputElement) {
    element.type = element.type === 'password' ? 'text' : 'password';
  }

  async copyToClipboard() {
    if (this.nsecInput) {
      await navigator.clipboard.writeText(this.nsecInput);
    }
  }

  validateNsec() {
    if (!this.nsecInput) {
      this.isNsecValid = false;
      return;
    }

    try {
      NostrHelper.getNostrPrivkeyObject(this.nsecInput.toLowerCase());
      this.isNsecValid = true;
    } catch {
      this.isNsecValid = false;
    }
  }

  onContinueWithNsec() {
    if (!this.isNsecValid || !this.nickname) {
      return;
    }
    // Navigate to password step, passing nsec and nickname in state
    this.router.navigateByUrl('/vault-create/new', {
      state: { nsec: this.nsecInput, nickname: this.nickname },
    });
  }

  async onImport() {
    if (!this.selectedSnapshot) {
      return;
    }

    try {
      // Only delete existing vault if one exists (check if there's encrypted vault data)
      const existingVault = this.#storage.getBrowserSyncHandler().encryptedVault;
      if (existingVault && Object.keys(existingVault).length > 0) {
        await this.#storage.deleteVault(true);
      }
      await this.#storage.importVault(this.selectedSnapshot.data);

      // Restart the app to properly reinitialize and route to vault-login
      this.#storage.isInitialized = false;
      this.#startup.startOver(getNewStorageServiceConfig());
    } catch (error) {
      console.error('Failed to import vault:', error);
    }
  }

  validateRelayNsec() {
    if (!this.relayRestoreNsec) {
      this.isRelayNsecValid = false;
      return;
    }
    try {
      NostrHelper.getNostrPrivkeyObject(this.relayRestoreNsec.toLowerCase());
      this.isRelayNsecValid = true;
    } catch {
      this.isRelayNsecValid = false;
    }
  }

  async onRestoreFromRelays() {
    if (!this.isRelayNsecValid) return;

    this.relayRestoring = true;
    this.relayRestoreError = '';
    this.relayRestoreStep = 'Deriving keys...';

    try {
      const privkeyObj = NostrHelper.getNostrPrivkeyObject(this.relayRestoreNsec.toLowerCase());
      const privkey = privkeyObj.hex;
      const pubkey = NostrHelper.pubkeyFromPrivkey(privkey);

      this.relayRestoreStep = 'Querying relays...';
      const result = await this.#vaultRelay.pullVault(pubkey, privkey);

      if (!result) {
        this.relayRestoreError = 'No vault found on relays for this identity.';
        this.relayRestoring = false;
        this.relayRestoreStep = '';
        return;
      }

      this.relayRestoreStep = 'Importing vault...';

      // Import the vault
      const existingVault = this.#storage.getBrowserSyncHandler().encryptedVault;
      if (existingVault && Object.keys(existingVault).length > 0) {
        await this.#storage.deleteVault(true);
      }
      await this.#storage.importVault(result.vault);

      // Auto-enable relay sync with this identity's ID
      // (The actual identity ID will be set after vault unlock when identities are available)

      // Restart to route to vault-login
      this.#storage.isInitialized = false;
      this.#startup.startOver(getNewStorageServiceConfig());
    } catch (err) {
      this.relayRestoreError = err instanceof Error ? err.message : 'Failed to restore from relays';
      this.relayRestoring = false;
      this.relayRestoreStep = '';
      console.error('Relay restore failed:', err);
    }
  }

  async #loadSnapshots() {
    const data = (await browser.storage.local.get(VAULT_SNAPSHOTS_KEY)) as {
      vaultSnapshots?: SignerMetaData_VaultSnapshot[];
    };

    this.snapshots = data.vaultSnapshots
      ? [...data.vaultSnapshots].sort((a, b) =>
          b.fileName.localeCompare(a.fileName)
        )
      : [];

    if (this.snapshots.length > 0) {
      this.selectedSnapshot = this.snapshots[0];
    }
  }

}
