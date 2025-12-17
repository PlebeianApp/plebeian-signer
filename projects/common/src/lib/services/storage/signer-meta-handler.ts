/* eslint-disable @typescript-eslint/no-explicit-any */
import { BrowserSyncFlow, SignerMetaData } from './types';

export abstract class SignerMetaHandler {
  get signerMetaData(): SignerMetaData | undefined {
    return this.#signerMetaData;
  }

  #signerMetaData?: SignerMetaData;

  readonly metaProperties = ['syncFlow', 'vaultSnapshots'];
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
}
