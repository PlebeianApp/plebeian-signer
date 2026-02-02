import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { StorageService } from '../services/storage/storage.service';
import { Buffer } from 'buffer';

declare const chrome: {
  windows: {
    create: (options: {
      type: string;
      url: string;
      width: number;
      height: number;
      left: number;
      top: number;
    }) => void;
  };
  runtime: {
    sendMessage: (message: unknown) => Promise<unknown>;
  };
  downloads: {
    download: (options: { url: string; filename: string; saveAs: boolean }, callback?: (downloadId: number) => void) => void;
    open: (downloadId: number) => void;
    onChanged: {
      addListener: (callback: (delta: { id: number; state?: { current: string } }) => void) => void;
      removeListener: (callback: (delta: { id: number; state?: { current: string } }) => void) => void;
    };
  };
};

export class NavComponent {
  readonly #router = inject(Router);
  protected readonly storage = inject(StorageService);
  devMode = false;
  paused = false;

  constructor() {
    this.devMode = this.storage.getSignerMetaHandler().signerMetaData?.devMode ?? false;
    this.paused = this.storage.getSignerMetaHandler().signerMetaData?.paused ?? false;
  }

  async onTogglePause() {
    this.paused = !this.paused;
    await this.storage.getSignerMetaHandler().setPaused(this.paused);
    // Notify background script to update the icon
    await chrome.runtime.sendMessage({ type: 'set-paused', paused: this.paused });
  }

  navigateBack() {
    window.history.back();
  }

  navigate(path: string) {
    this.#router.navigate([path]);
  }

  onTestPrompt() {
    const testEvent = {
      kind: 1,
      content: 'This is a test note for permission prompt preview.',
      tags: [],
      created_at: Math.floor(Date.now() / 1000),
    };
    const base64Event = Buffer.from(JSON.stringify(testEvent, null, 2)).toString('base64');
    const currentIdentity = this.storage.getBrowserSessionHandler().browserSessionData?.identities.find(
      i => i.id === this.storage.getBrowserSessionHandler().browserSessionData?.selectedIdentityId
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
}
