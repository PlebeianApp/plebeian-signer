import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  BrowserSyncFlow,
  ConfirmComponent,
  DateHelper,
  LoggerService,
  NavComponent,
  NavItemComponent,
  StartupService,
  StorageService,
} from '@common';
import { getNewStorageServiceConfig } from '../../../common/data/get-new-storage-service-config';
import { Buffer } from 'buffer';
import browser from 'webextension-polyfill';

@Component({
  selector: 'app-settings',
  imports: [ConfirmComponent, NavItemComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent extends NavComponent implements OnInit {
  readonly #router = inject(Router);
  syncFlow: string | undefined;
  override devMode = false;

  readonly #storage = inject(StorageService);
  readonly #startup = inject(StartupService);
  readonly #logger = inject(LoggerService);

  ngOnInit(): void {
    const vault = JSON.stringify(
      this.#storage.getBrowserSyncHandler().browserSyncData
    );
    console.log(vault.length / 1024 + ' KB');

    switch (this.#storage.getSignerMetaHandler().signerMetaData?.syncFlow) {
      case BrowserSyncFlow.NO_SYNC:
        this.syncFlow = 'Off';
        break;

      case BrowserSyncFlow.BROWSER_SYNC:
        this.syncFlow = 'Mozilla Firefox';
        break;

      default:
        break;
    }

    // Load dev mode setting
    this.devMode = this.#storage.getSignerMetaHandler().signerMetaData?.devMode ?? false;
  }

  async onToggleDevMode(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.devMode = checked;
    await this.#storage.getSignerMetaHandler().setDevMode(checked);
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

    browser.windows.create({
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

  async onClickExportVault() {
    const jsonVault = this.#storage.exportVault();

    const dateTimeString = DateHelper.dateToISOLikeButLocal(new Date());
    const fileName = `Plebeian Signer Firefox - Vault Export - ${dateTimeString}.json`;

    this.#downloadJson(jsonVault, fileName);
    this.#logger.logVaultExport(fileName);
  }

  #downloadJson(jsonString: string, fileName: string) {
    const dataStr =
      'data:text/json;charset=utf-8,' + encodeURIComponent(jsonString);
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute('href', dataStr);
    downloadAnchorNode.setAttribute('download', fileName);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  }

  async onClickLock() {
    this.#logger.logVaultLock();
    await this.#storage.lockVault();
    this.#router.navigateByUrl('/vault-login');
  }
}
