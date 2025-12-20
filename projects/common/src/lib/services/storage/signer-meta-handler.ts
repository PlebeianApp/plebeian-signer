/* eslint-disable @typescript-eslint/no-explicit-any */
import { Bookmark, BrowserSyncFlow, SignerMetaData } from './types';

export abstract class SignerMetaHandler {
  get signerMetaData(): SignerMetaData | undefined {
    return this.#signerMetaData;
  }

  #signerMetaData?: SignerMetaData;

  readonly metaProperties = ['syncFlow', 'vaultSnapshots', 'recklessMode', 'whitelistedHosts', 'bookmarks'];
  /**
   * Load the full data from the storage. If the storage is used for storing
   * other data (e.g. browser sync data when the user decided to NOT sync),
   * make sure to handle the "meta properties" to only load these.
   *
   * ATTENTION: Make sure to call "setFullData(..)" afterwards to update the in-memory data.
   */
  abstract loadFullData(): Promise<Partial<Record<string, any>>>;

  setFullData(data: SignerMetaData) {
    this.#signerMetaData = data;
  }

  abstract saveFullData(data: SignerMetaData): Promise<void>;

  /**
   * Sets the browser sync flow for the user and immediately saves it.
   */
  async setBrowserSyncFlow(flow: BrowserSyncFlow): Promise<void> {
    if (!this.#signerMetaData) {
      this.#signerMetaData = {
        syncFlow: flow,
      };
    } else {
      this.#signerMetaData.syncFlow = flow;
    }

    await this.saveFullData(this.#signerMetaData);
  }

  abstract clearData(keep: string[]): Promise<void>;

  /**
   * Sets the reckless mode and immediately saves it.
   */
  async setRecklessMode(enabled: boolean): Promise<void> {
    if (!this.#signerMetaData) {
      this.#signerMetaData = {
        recklessMode: enabled,
      };
    } else {
      this.#signerMetaData.recklessMode = enabled;
    }

    await this.saveFullData(this.#signerMetaData);
  }

  /**
   * Adds a host to the whitelist and immediately saves it.
   */
  async addWhitelistedHost(host: string): Promise<void> {
    if (!this.#signerMetaData) {
      this.#signerMetaData = {
        whitelistedHosts: [host],
      };
    } else {
      const hosts = this.#signerMetaData.whitelistedHosts ?? [];
      if (!hosts.includes(host)) {
        hosts.push(host);
        this.#signerMetaData.whitelistedHosts = hosts;
      }
    }

    await this.saveFullData(this.#signerMetaData);
  }

  /**
   * Removes a host from the whitelist and immediately saves it.
   */
  async removeWhitelistedHost(host: string): Promise<void> {
    if (!this.#signerMetaData?.whitelistedHosts) {
      return;
    }

    this.#signerMetaData.whitelistedHosts = this.#signerMetaData.whitelistedHosts.filter(
      (h) => h !== host
    );

    await this.saveFullData(this.#signerMetaData);
  }

  /**
   * Sets the bookmarks array and immediately saves it.
   */
  async setBookmarks(bookmarks: Bookmark[]): Promise<void> {
    if (!this.#signerMetaData) {
      this.#signerMetaData = {
        bookmarks,
      };
    } else {
      this.#signerMetaData.bookmarks = bookmarks;
    }

    await this.saveFullData(this.#signerMetaData);
  }

  /**
   * Gets the current bookmarks.
   */
  getBookmarks(): Bookmark[] {
    return this.#signerMetaData?.bookmarks ?? [];
  }
}
