import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  ConfirmComponent,
  DateHelper,
  IdentityData,
  LoggerService,
  NavComponent,
  NavItemComponent,
  Nip60Service,
  StartupService,
  StorageService,
  SyncFlow,
  SyncQuotaExceededError,
  VaultRelayService,
} from '@common';
import { getNewStorageServiceConfig } from '../../../common/data/get-new-storage-service-config';
import { Buffer } from 'buffer';

@Component({
  selector: 'app-settings',
  imports: [ConfirmComponent, NavItemComponent, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent extends NavComponent implements OnInit {
  @ViewChild('confirm') confirmModal!: ConfirmComponent;

  readonly #router = inject(Router);
  syncFlowValue = 0;
  switchingSyncFlow = false;
  syncMigrationStep = '';
  syncFlowError = '';
  override devMode = false;
  stayUnlocked = false;
  nip60Enabled = false;

  // NIP-60 custom relay settings
  nip60CustomRelaysEnabled = false;
  nip60CustomRelaysInput = '';
  nip60CustomRelaysSaved = '';

  // Relay sync settings
  relaySyncIdentityId = '';
  relaySyncAuthOnly = false;
  identities: IdentityData[] = [];

  readonly #storage = inject(StorageService);
  readonly #startup = inject(StartupService);
  readonly #logger = inject(LoggerService);
  readonly #nip60Service = inject(Nip60Service);
  readonly #vaultRelay = inject(VaultRelayService);

  ngOnInit(): void {
    const vault = JSON.stringify(
      this.#storage.getBrowserSyncHandler().browserSyncData
    );
    console.log(vault.length / 1024 + ' KB');

    // Load current sync flow
    this.syncFlowValue = this.#storage.getSignerMetaHandler().extensionSettings?.syncFlow ?? 0;

    // Load identities for vault owner picker
    this.identities = this.#storage.getBrowserSessionHandler().browserSessionData?.identities ?? [];

    // Load relay sync settings
    this.relaySyncIdentityId = this.#storage.getSignerMetaHandler().getRelaySyncIdentityId() ?? '';
    this.relaySyncAuthOnly = this.#storage.getSignerMetaHandler().isRelaySyncAuthOnly();

    // Load dev mode setting
    this.devMode = this.#storage.getSignerMetaHandler().extensionSettings?.devMode ?? false;
    // Load stay unlocked setting
    this.stayUnlocked = this.#storage.getSignerMetaHandler().extensionSettings?.stayUnlocked ?? false;
    // Load NIP-60 setting
    this.nip60Enabled = this.#storage.getSignerMetaHandler().isNip60Enabled();
    // Load NIP-60 custom relay settings
    this.nip60CustomRelaysEnabled = this.#storage.getSignerMetaHandler().isNip60CustomRelaysEnabled();
    this.nip60CustomRelaysInput = this.#storage.getSignerMetaHandler().getNip60CustomRelays().join('\n');
  }

  async onSyncFlowChange(value: string) {
    const newFlow = Number(value) as SyncFlow;
    const oldFlow = this.syncFlowValue;
    this.switchingSyncFlow = true;
    this.syncFlowError = '';
    this.syncMigrationStep = '';

    try {
      if (newFlow === SyncFlow.BROWSER_SYNC) {
        // Try switching to browser sync — may throw SyncQuotaExceededError
        await this.#storage.switchSyncFlow(newFlow);
        this.syncFlowValue = newFlow;
      } else if (newFlow === SyncFlow.RELAY_SYNC) {
        // Switch to local handler (relay sync uses local storage + relay push)
        await this.#storage.switchSyncFlow(newFlow);
        this.syncFlowValue = newFlow;

        // Auto-select first identity as vault owner if not set
        if (!this.relaySyncIdentityId && this.identities.length > 0) {
          this.relaySyncIdentityId = this.identities[0].id;
          await this.#storage.getSignerMetaHandler().setRelaySyncIdentityId(this.relaySyncIdentityId);
        }

        // Do initial push to relays
        await this.#doInitialRelayPush();
      } else {
        // NO_SYNC
        await this.#storage.switchSyncFlow(newFlow);
        this.syncFlowValue = newFlow;
      }
      this.switchingSyncFlow = false;
    } catch (err) {
      this.switchingSyncFlow = false;
      this.syncFlowValue = oldFlow;

      if (err instanceof SyncQuotaExceededError) {
        this.confirmModal.show(
          'Your vault is too large for browser sync storage. ' +
          'To enable sync, Cashu tokens will be migrated to Nostr relay storage (NIP-60), ' +
          'removed from the vault, and a backup will be created. ' +
          'The extension will then reinitialize. Proceed?',
          this.#handleSyncMigration.bind(this)
        );
      } else {
        this.syncFlowError = err instanceof Error ? err.message : 'Failed to switch sync mode';
        console.error('Failed to switch sync flow:', err);
      }
    }
  }

  async #doInitialRelayPush(): Promise<void> {
    const identity = this.identities.find(i => i.id === this.relaySyncIdentityId);
    if (!identity) return;

    this.syncMigrationStep = 'Pushing vault to relays...';
    try {
      const results = await this.#vaultRelay.pushVault(identity);
      const successCount = results.filter(r => r.success).length;
      if (results.length > 0 && successCount === 0) {
        this.syncFlowError = 'Vault saved locally but failed to push to relays. Will retry on next change.';
      }
    } catch (err) {
      this.syncFlowError = 'Vault saved locally but relay push failed: ' +
        (err instanceof Error ? err.message : 'Unknown error');
      console.error('Initial relay push failed:', err);
    }
    this.syncMigrationStep = '';
  }

  async onRelaySyncIdentityChange(identityId: string) {
    this.relaySyncIdentityId = identityId;
    await this.#storage.getSignerMetaHandler().setRelaySyncIdentityId(identityId);
  }

  async onToggleRelaySyncAuthOnly(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.relaySyncAuthOnly = checked;
    await this.#storage.getSignerMetaHandler().setRelaySyncAuthOnly(checked);
  }

  async #handleSyncMigration(): Promise<void> {
    this.switchingSyncFlow = true;
    this.syncFlowError = '';

    try {
      // 1. Get the active identity
      this.syncMigrationStep = 'Finding active identity...';
      const session = this.#storage.getBrowserSessionHandler().browserSessionData;
      const identity = session?.identities.find(
        i => i.id === session?.selectedIdentityId
      );
      if (!identity) {
        throw new Error('No active identity found. Unlock vault and select an identity first.');
      }

      // 2. Enable NIP-60 relay wallet sync
      this.syncMigrationStep = 'Enabling NIP-60 relay wallet sync...';
      await this.#storage.getSignerMetaHandler().setNip60Enabled(true);

      // 3. Ensure wallet privkey exists
      this.syncMigrationStep = 'Preparing wallet key...';
      await this.#nip60Service.getWalletPrivkey(identity);

      // 4. Push proofs to relays
      this.syncMigrationStep = 'Pushing tokens to Nostr relays...';
      const results = await this.#nip60Service.pushWalletToRelays(identity);
      const successCount = results.filter(r => r.success).length;
      if (results.length > 0 && successCount === 0) {
        throw new Error('Failed to push tokens to any relay. Check your relay list and try again.');
      }

      // 5. Strip proofs from vault
      this.syncMigrationStep = 'Removing tokens from vault...';
      await this.#storage.stripProofsFromVault();

      // 6. Create a backup
      this.syncMigrationStep = 'Creating vault backup...';
      const vault = this.#storage.getBrowserSyncHandler().encryptedVault;
      if (vault) {
        await this.#storage.getSignerMetaHandler().createBackup(vault, 'auto');
      }

      // 7. Retry sync switch
      this.syncMigrationStep = 'Enabling browser sync...';
      try {
        await this.#storage.switchSyncFlow(SyncFlow.BROWSER_SYNC);
      } catch (retryErr) {
        if (retryErr instanceof SyncQuotaExceededError) {
          this.syncFlowError =
            'Tokens migrated to relays and backup created, but your vault metadata ' +
            '(identities, permissions, relays) still exceeds browser sync limits. ' +
            'Remove unused identities or keep sync disabled.';
          this.syncMigrationStep = '';
          this.switchingSyncFlow = false;
          return;
        }
        throw retryErr;
      }

      // 8. Reinitialize extension
      this.syncMigrationStep = 'Reinitializing...';
      this.#storage.isInitialized = false;
      this.#startup.startOver(getNewStorageServiceConfig());
    } catch (err) {
      this.syncFlowError = err instanceof Error ? err.message : 'Migration failed';
      this.syncMigrationStep = '';
      this.switchingSyncFlow = false;
      console.error('Sync migration failed:', err);
    }
  }

  async onToggleNip60(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.nip60Enabled = checked;
    await this.#storage.getSignerMetaHandler().setNip60Enabled(checked);
  }

  async onToggleNip60CustomRelays(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.nip60CustomRelaysEnabled = checked;
    await this.#storage.getSignerMetaHandler().setNip60CustomRelaysEnabled(checked);
  }

  async onSaveNip60CustomRelays() {
    const relays = this.nip60CustomRelaysInput
      .split('\n')
      .map(r => r.trim())
      .filter(r => r.length > 0 && (r.startsWith('wss://') || r.startsWith('ws://')));
    await this.#storage.getSignerMetaHandler().setNip60CustomRelays(relays);
    this.nip60CustomRelaysSaved = `Saved ${relays.length} relay${relays.length !== 1 ? 's' : ''}`;
    setTimeout(() => this.nip60CustomRelaysSaved = '', 3000);
  }

  async onToggleDevMode(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.devMode = checked;
    await this.#storage.getSignerMetaHandler().setDevMode(checked);
  }

  async onToggleStayUnlocked(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.stayUnlocked = checked;
    await this.#storage.getSignerMetaHandler().setStayUnlocked(checked);

    if (checked) {
      // Persist the derived key from current session for auto-unlock
      try {
        const session = await chrome.storage.session.get(null);
        if (session && Object.keys(session).length > 0) {
          const isV2 = !!session['salt'];
          const key = isV2 ? session['vaultKey'] : session['vaultPassword'];
          if (key) {
            await chrome.storage.local.set({
              persistedVaultKey: { key, isV2 },
            });
          }
        }
      } catch (e) {
        console.error('Failed to persist vault key:', e);
      }
    } else {
      // Remove persisted vault key when disabling
      await chrome.storage.local.remove('persistedVaultKey');
    }
  }

  override async onTestPrompt() {
    // Open a test permission prompt window
    const testEvent = {
      kind: 1,
      content: 'This is a test note for permission prompt preview.',
      tags: [],
      created_at: Math.floor(Date.now() / 1000),
    };
    const base64Event = Buffer.from(JSON.stringify(testEvent, null, 2)).toString('base64');
    const currentIdentity = this.#storage.getBrowserSessionHandler().browserSessionData?.identities.find(
      i => i.id === this.#storage.getBrowserSessionHandler().browserSessionData?.selectedIdentityId
    );
    const nick = currentIdentity?.nick ?? 'Test Identity';

    const width = 375;
    const height = 600;
    const left = Math.round((screen.width - width) / 2);
    const top = Math.round((screen.height - height) / 2);

    chrome.windows.create({
      type: 'popup',
      url: `prompt.html?method=signEvent&host=example.com&id=test-${Date.now()}&nick=${encodeURIComponent(nick)}&event=${base64Event}`,
      width,
      height,
      left,
      top,
    });
  }

  async onResetExtension() {
    try {
      this.#logger.logVaultReset();
      await this.#storage.resetExtension();
      this.#startup.startOver(getNewStorageServiceConfig());
    } catch (error) {
      console.log(error);
      // TODO
    }
  }

  onClickImportVault() {
    chrome.runtime.sendMessage({ type: 'open-import', action: 'import' });
  }

  async onClickExportVault() {
    const jsonVault = this.#storage.exportVault();

    const dateTimeString = DateHelper.dateToISOLikeButLocal(new Date());
    const fileName = `Plebeian Signer Chrome - Vault Export - ${dateTimeString}.json`;

    this.#downloadJson(jsonVault, fileName);
    this.#logger.logVaultExport(fileName);
  }

  #downloadJson(jsonString: string, fileName: string) {
    chrome.runtime.sendMessage({ type: 'download-json', json: jsonString, filename: fileName });
  }

  async onClickLock() {
    this.#logger.logVaultLock();
    await this.#storage.lockVault();
    this.#router.navigateByUrl('/vault-login');
  }
}
