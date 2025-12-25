/* eslint-disable @typescript-eslint/no-explicit-any */
import { VaultSession } from './types';

export abstract class BrowserSessionHandler {
  get vaultSession(): VaultSession | undefined {
    return this.#vaultSession;
  }

  /** @deprecated Use vaultSession instead */
  get browserSessionData(): VaultSession | undefined {
    return this.#vaultSession;
  }

  #vaultSession?: VaultSession;

  /**
   * Load the data from the browser session storage. It should be an empty object,
   * if no data is available yet (e.g. because the vault (from the browser sync data)
   * was not unlocked via password).
   *
   * ATTENTION: Make sure to call "setFullData(..)" afterwards to update the in-memory data.
   */
  abstract loadFullData(): Promise<Partial<Record<string, any>>>;
  setFullData(data: VaultSession) {
    this.#vaultSession = JSON.parse(JSON.stringify(data));
  }

  clearInMemoryData() {
    this.#vaultSession = undefined;
  }

  /**
   * Persist the full data to the session data storage.
   *
   * ATTENTION: Make sure to call "setFullData(..)" afterwards of before to update the in-memory data.
   */
  abstract saveFullData(data: VaultSession): Promise<void>;

  abstract clearData(): Promise<void>;
}
