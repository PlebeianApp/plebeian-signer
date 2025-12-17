/* eslint-disable @typescript-eslint/no-explicit-any */
import { Event, EventTemplate } from 'nostr-tools';
import { Nip07Method } from '@common';

type Relays = Record<string, { read: boolean; write: boolean }>;

// Fallback UUID generator for contexts where crypto.randomUUID is unavailable
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback using crypto.getRandomValues
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

class Messenger {
  #requests = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason: any) => void;
    }
  >();

  constructor() {
    window.addEventListener('message', this.#handleCallResponse.bind(this));
  }

  async request(method: Nip07Method, params: any): Promise<any> {
    const id = generateUUID();

    return new Promise((resolve, reject) => {
      this.#requests.set(id, { resolve, reject });
      window.postMessage(
        {
          id,
          ext: 'plebian-signer',
          method,
          params,
        },
        '*'
      );
    });
  }

  #handleCallResponse(message: MessageEvent) {
    // We also will receive our own messages, that we sent.
    // We have to ignore them (they will not have a response field).
    if (
      !message.data ||
      message.data.response === null ||
      message.data.response === undefined ||
      message.data.ext !== 'plebian-signer' ||
      !this.#requests.has(message.data.id)
    ) {
      return;
    }

    if (message.data.response.error) {
      this.#requests.get(message.data.id)?.reject(message.data.response.error);
    } else {
      this.#requests.get(message.data.id)?.resolve(message.data.response);
    }

    this.#requests.delete(message.data.id);
  }
}

const nostr = {
  messenger: new Messenger(),

  async getPublicKey(): Promise<string> {
    debug('getPublicKey received');
    const pubkey = await this.messenger.request('getPublicKey', {});
    debug(`getPublicKey response:`);
    debug(pubkey);
    return pubkey;
  },

  async signEvent(event: EventTemplate): Promise<Event> {
    debug('signEvent received');
    const signedEvent = await this.messenger.request('signEvent', event);
    debug('signEvent response:');
    debug(signedEvent);
    return signedEvent;
  },

  async getRelays(): Promise<Relays> {
    debug('getRelays received');
    const relays = (await this.messenger.request('getRelays', {})) as Relays;
    debug('getRelays response:');
    debug(relays);
    return relays;
  },

  nip04: {
    that: this,

    async encrypt(peerPubkey: string, plaintext: string): Promise<string> {
      debug('nip04.encrypt received');
      const ciphertext = (await nostr.messenger.request('nip04.encrypt', {
        peerPubkey,
        plaintext,
      })) as string;
      debug('nip04.encrypt response:');
      debug(ciphertext);
      return ciphertext;
    },

    async decrypt(peerPubkey: string, ciphertext: string): Promise<string> {
      debug('nip04.decrypt received');
      const plaintext = (await nostr.messenger.request('nip04.decrypt', {
        peerPubkey,
        ciphertext,
      })) as string;
      debug('nip04.decrypt response:');
      debug(plaintext);
      return plaintext;
    },
  },

  nip44: {
    async encrypt(peerPubkey: string, plaintext: string): Promise<string> {
      debug('nip44.encrypt received');
      const ciphertext = (await nostr.messenger.request('nip44.encrypt', {
        peerPubkey,
        plaintext,
      })) as string;
      debug('nip44.encrypt response:');
      debug(ciphertext);
      return ciphertext;
    },

    async decrypt(peerPubkey: string, ciphertext: string): Promise<string> {
      debug('nip44.decrypt received');
      const plaintext = (await nostr.messenger.request('nip44.decrypt', {
        peerPubkey,
        ciphertext,
      })) as string;
      debug('nip44.decrypt response:');
      debug(plaintext);
      return plaintext;
    },
  },
};

window.nostr = nostr as any;

const debug = function (value: any) {
  console.log(JSON.stringify(value));
};
