/* eslint-disable @typescript-eslint/no-explicit-any */
import { VaultSession, BrowserSessionHandler } from '@common';

export class ChromeSessionHandler extends BrowserSessionHandler {
  async loadFullData(): Promise<Partial<Record<string, any>>> {
    return chrome.storage.session.get(null);
  }

  async saveFullData(data: VaultSession): Promise<void> {
    await chrome.storage.session.set(data);
  }

  async clearData(): Promise<void> {
    await chrome.storage.session.clear();
  }
}
