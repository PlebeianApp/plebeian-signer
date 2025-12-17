/* eslint-disable @typescript-eslint/no-explicit-any */
import { SignerMetaData, SignerMetaHandler } from '@common';
import browser from 'webextension-polyfill';

export class FirefoxMetaHandler extends SignerMetaHandler {
  async loadFullData(): Promise<Partial<Record<string, any>>> {
    const dataWithPossibleAlienProperties = await browser.storage.local.get(
      null
    );

    if (Object.keys(dataWithPossibleAlienProperties).length === 0) {
      return dataWithPossibleAlienProperties;
    }

    const data: Partial<Record<string, any>> = {};
    this.metaProperties.forEach((property) => {
      data[property] = dataWithPossibleAlienProperties[property];
    });

    return data;
  }

  async saveFullData(data: SignerMetaData): Promise<void> {
    await browser.storage.local.set(data as Record<string, any>);
    console.log(data);
  }

  async clearData(keep: string[]): Promise<void> {
    const toBeRemovedProperties: string[] = [];

    for (const property of this.metaProperties) {
      if (!keep.includes(property)) {
        toBeRemovedProperties.push(property);
      }
    }

    await browser.storage.local.remove(this.metaProperties);
  }
}
