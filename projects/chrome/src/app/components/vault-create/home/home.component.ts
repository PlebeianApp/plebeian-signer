import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  NavComponent,
  NostrHelper,
  StorageService,
  StartupService,
  SignerMetaData_VaultSnapshot,
  BrowserSyncData,
} from '@common';
import { generateSecretKey } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';
import { v4 as uuidv4 } from 'uuid';
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

  nickname = '';
  nsecInput = '';
  isNsecValid = false;
  snapshots: SignerMetaData_VaultSnapshot[] = [];
  selectedSnapshot: SignerMetaData_VaultSnapshot | undefined;

  ngOnInit(): void {
    this.#loadSnapshots();
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

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) {
      return;
    }

    try {
      const file = files[0];
      const text = await file.text();
      const vault = JSON.parse(text) as BrowserSyncData;

      // Check if file already exists
      if (this.snapshots.some((s) => s.fileName === file.name)) {
        input.value = '';
        return;
      }

      const newSnapshot: SignerMetaData_VaultSnapshot = {
        id: uuidv4(),
        fileName: file.name,
        createdAt: new Date().toISOString(),
        data: vault,
        identityCount: vault.identities?.length ?? 0,
        reason: 'manual',
      };

      this.snapshots = [...this.snapshots, newSnapshot].sort((a, b) =>
        b.fileName.localeCompare(a.fileName)
      );
      this.selectedSnapshot = newSnapshot;

      await this.#saveSnapshots();
    } catch (error) {
      console.error('Failed to load vault file:', error);
    }

    // Reset input so same file can be selected again
    input.value = '';
  }

  async onImport() {
    if (!this.selectedSnapshot) {
      return;
    }

    try {
      await this.#storage.deleteVault(true);
      await this.#storage.importVault(this.selectedSnapshot.data);

      // Restart the app to properly reinitialize and route to vault-login
      this.#storage.isInitialized = false;
      this.#startup.startOver(getNewStorageServiceConfig());
    } catch (error) {
      console.error('Failed to import vault:', error);
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

  async #saveSnapshots() {
    await browser.storage.local.set({
      [VAULT_SNAPSHOTS_KEY]: this.snapshots,
    });
  }
}
