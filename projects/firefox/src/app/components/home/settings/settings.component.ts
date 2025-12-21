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

@Component({
  selector: 'app-settings',
  imports: [ConfirmComponent, NavItemComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent extends NavComponent implements OnInit {
  readonly #router = inject(Router);
  syncFlow: string | undefined;

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
