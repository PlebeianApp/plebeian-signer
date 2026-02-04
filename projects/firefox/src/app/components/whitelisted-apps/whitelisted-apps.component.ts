import { Component, inject, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import {
  ConfirmComponent,
  NavComponent,
  StorageService,
  ToastComponent,
} from '@common';
import browser from 'webextension-polyfill';

@Component({
  selector: 'app-whitelisted-apps',
  templateUrl: './whitelisted-apps.component.html',
  styleUrl: './whitelisted-apps.component.scss',
  imports: [ToastComponent, ConfirmComponent],
})
export class WhitelistedAppsComponent extends NavComponent {
  @ViewChild('toast') toast!: ToastComponent;
  @ViewChild('confirm') confirm!: ConfirmComponent;

  override readonly storage = inject(StorageService);
  readonly #router = inject(Router);

  get whitelistedHosts(): string[] {
    return this.storage.getSignerMetaHandler().signerMetaData?.whitelistedHosts ?? [];
  }

  get isAutoApprove(): boolean {
    return this.storage.getSignerMetaHandler().getPermissionLevel() === 'reckless';
  }

  async onClickWhitelistCurrentTab() {
    try {
      // Get current active tab
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0 || !tabs[0].url) {
        this.toast.show('No active tab found');
        return;
      }

      const url = new URL(tabs[0].url);
      const host = url.host;

      if (!host) {
        this.toast.show('Cannot get host from current tab');
        return;
      }

      // Check if already trusted
      if (this.whitelistedHosts.includes(host)) {
        this.toast.show(`${host} is already trusted`);
        return;
      }

      await this.storage.getSignerMetaHandler().addWhitelistedHost(host);
      this.toast.show(`Added ${host} to trusted sites`);
    } catch (error) {
      console.error('Error getting current tab:', error);
      this.toast.show('Error getting current tab');
    }
  }

  onClickRemoveHost(host: string) {
    this.confirm.show(`Remove ${host} from trusted sites?`, async () => {
      await this.storage.getSignerMetaHandler().removeWhitelistedHost(host);
      this.toast.show(`Removed ${host} from trusted sites`);
    });
  }

  onClickBack() {
    this.#router.navigateByUrl('/permission-settings');
  }
}
