import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  ConfirmComponent,
  LoggerService,
  SignerMetaData_VaultSnapshot,
  StartupService,
  StorageService,
} from '@common';
import { getNewStorageServiceConfig } from '../../../common/data/get-new-storage-service-config';

@Component({
  selector: 'app-backups',
  templateUrl: './backups.component.html',
  styleUrl: './backups.component.scss',
  imports: [ConfirmComponent],
})
export class BackupsComponent implements OnInit {
  readonly #router = inject(Router);
  readonly #storage = inject(StorageService);
  readonly #startup = inject(StartupService);
  readonly #logger = inject(LoggerService);

  backups: SignerMetaData_VaultSnapshot[] = [];
  maxBackups = 5;
  restoringBackupId: string | null = null;

  ngOnInit(): void {
    this.loadBackups();
    this.maxBackups = this.#storage.getSignerMetaHandler().getMaxBackups();
  }

  loadBackups(): void {
    this.backups = this.#storage.getSignerMetaHandler().getBackups();
  }

  async onMaxBackupsChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const value = parseInt(input.value, 10);
    if (!isNaN(value) && value >= 1 && value <= 20) {
      this.maxBackups = value;
      await this.#storage.getSignerMetaHandler().setMaxBackups(value);
    }
  }

  async createManualBackup(): Promise<void> {
    const browserSyncData = this.#storage.getBrowserSyncHandler().browserSyncData;
    if (browserSyncData) {
      await this.#storage.getSignerMetaHandler().createBackup(browserSyncData, 'manual');
      this.loadBackups();
    }
  }

  async restoreBackup(backupId: string): Promise<void> {
    this.restoringBackupId = backupId;
    try {
      // First, create a pre-restore backup of current state
      const currentData = this.#storage.getBrowserSyncHandler().browserSyncData;
      if (currentData) {
        await this.#storage.getSignerMetaHandler().createBackup(currentData, 'pre-restore');
      }

      // Get the backup data
      const backupData = this.#storage.getSignerMetaHandler().getBackupData(backupId);
      if (!backupData) {
        throw new Error('Backup not found');
      }

      // Import the backup
      await this.#storage.deleteVault(true);
      await this.#storage.importVault(backupData);
      this.#logger.logVaultImport('Backup Restore');
      this.#storage.isInitialized = false;
      this.#startup.startOver(getNewStorageServiceConfig());
    } catch (error) {
      console.error('Failed to restore backup:', error);
      this.restoringBackupId = null;
    }
  }

  async deleteBackup(backupId: string): Promise<void> {
    await this.#storage.getSignerMetaHandler().deleteBackup(backupId);
    this.loadBackups();
  }

  formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }

  getReasonLabel(reason?: string): string {
    switch (reason) {
      case 'auto':
        return 'Auto';
      case 'manual':
        return 'Manual';
      case 'pre-restore':
        return 'Pre-Restore';
      default:
        return 'Unknown';
    }
  }

  getReasonClass(reason?: string): string {
    switch (reason) {
      case 'auto':
        return 'reason-auto';
      case 'manual':
        return 'reason-manual';
      case 'pre-restore':
        return 'reason-prerestore';
      default:
        return '';
    }
  }

  goBack(): void {
    this.#router.navigateByUrl('/home/settings');
  }

  async onClickLock(): Promise<void> {
    this.#logger.logVaultLock();
    await this.#storage.lockVault();
    this.#router.navigateByUrl('/vault-login');
  }
}
