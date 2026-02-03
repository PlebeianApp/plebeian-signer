/**
 * NIP-60 / NIP-61 Core Functions
 *
 * Pure functions for building and parsing NIP-60 (Cashu Wallet) and NIP-61 (Nutzap)
 * Nostr events. These work in both Angular DI context and background service worker.
 */

import { nip44 } from 'nostr-tools';
import { finalizeEvent, type EventTemplate } from 'nostr-tools/pure';
import { getPublicKey, generateSecretKey } from 'nostr-tools';
import { secp256k1 } from '@noble/curves/secp256k1';
import * as utils from '@noble/curves/abstract/utils';
import type { Proof } from '@cashu/cashu-ts';
import type {
  Nip60WalletConfig,
  Nip60UnspentProofs,
  Nip60SpendingHistory,
  NutzapInfo,
  NutzapSendParams,
  NutzapReceived,
} from './nip60-types';

// ---------------------------------------------------------------------------
// Key Management
// ---------------------------------------------------------------------------

/**
 * Generate a new wallet private key (32-byte hex string).
 */
export function generateWalletPrivkey(): string {
  const secretKey = generateSecretKey();
  return utils.bytesToHex(secretKey);
}

/**
 * Derive the 02-prefixed compressed public key from a wallet private key.
 * This is the key used for P2PK (NUT-11) ecash locking in NIP-61.
 */
export function getP2pkPubkey(walletPrivkeyHex: string): string {
  const privBytes = utils.hexToBytes(walletPrivkeyHex);
  const pubPoint = secp256k1.getPublicKey(privBytes, true); // compressed
  return utils.bytesToHex(pubPoint);
}

/**
 * Derive the standard (x-only) Nostr public key from a private key hex.
 */
export function pubkeyFromPrivkey(privkeyHex: string): string {
  return getPublicKey(utils.hexToBytes(privkeyHex));
}

// ---------------------------------------------------------------------------
// NIP-44 Encrypt-to-Self
// ---------------------------------------------------------------------------

/**
 * Encrypt plaintext to self using NIP-44.
 * The conversation key is derived between the identity's privkey and its own pubkey.
 */
export function encryptToSelf(plaintext: string, identityPrivkeyHex: string): string {
  const pubkey = pubkeyFromPrivkey(identityPrivkeyHex);
  const key = nip44.v2.utils.getConversationKey(
    utils.hexToBytes(identityPrivkeyHex),
    pubkey
  );
  return nip44.v2.encrypt(plaintext, key);
}

/**
 * Decrypt ciphertext from self using NIP-44.
 */
export function decryptFromSelf(ciphertext: string, identityPrivkeyHex: string): string {
  const pubkey = pubkeyFromPrivkey(identityPrivkeyHex);
  const key = nip44.v2.utils.getConversationKey(
    utils.hexToBytes(identityPrivkeyHex),
    pubkey
  );
  return nip44.v2.decrypt(ciphertext, key);
}

// ---------------------------------------------------------------------------
// NIP-60 Event Builders
// ---------------------------------------------------------------------------

/**
 * Build a kind 17375 wallet config event template.
 * Content is NIP-44 encrypted to self containing mints and wallet privkey.
 */
export function buildWalletConfigEvent(
  identityPrivkeyHex: string,
  mints: string[],
  walletPrivkey: string
): EventTemplate {
  const content = JSON.stringify({
    mints,
    privkey: walletPrivkey,
  });

  const encrypted = encryptToSelf(content, identityPrivkeyHex);

  return {
    kind: 17375,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: encrypted,
  };
}

/**
 * Build a kind 7375 unspent proof event template.
 * Content is NIP-44 encrypted to self containing mint URL, unit, and proofs.
 */
export function buildUnspentProofEvent(
  identityPrivkeyHex: string,
  mintUrl: string,
  proofs: Proof[],
  unit = 'sat',
  deletedEventIds?: string[]
): EventTemplate {
  const pubkey = pubkeyFromPrivkey(identityPrivkeyHex);

  const contentObj: Nip60UnspentProofs = {
    mint: mintUrl,
    proofs,
    unit,
  };
  if (deletedEventIds && deletedEventIds.length > 0) {
    contentObj.del = deletedEventIds;
  }

  const encrypted = encryptToSelf(JSON.stringify(contentObj), identityPrivkeyHex);

  return {
    kind: 7375,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['a', `17375:${pubkey}:`],
    ],
    content: encrypted,
  };
}

/**
 * Build a kind 7376 spending history event template.
 * Content is NIP-44 encrypted to self.
 * For nutzap redemptions, includes unencrypted ["e", id, "", "redeemed"] tag.
 */
export function buildSpendingHistoryEvent(
  identityPrivkeyHex: string,
  history: Nip60SpendingHistory,
  referencedEventIds?: { id: string; marker: string }[]
): EventTemplate {
  const pubkey = pubkeyFromPrivkey(identityPrivkeyHex);
  const encrypted = encryptToSelf(JSON.stringify(history), identityPrivkeyHex);

  const tags: string[][] = [
    ['a', `17375:${pubkey}:`],
  ];

  if (referencedEventIds) {
    for (const ref of referencedEventIds) {
      tags.push(['e', ref.id, '', ref.marker]);
    }
  }

  return {
    kind: 7376,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: encrypted,
  };
}

/**
 * Build a kind 5 (NIP-09) deletion event for spent token events.
 */
export function buildDeletionEvent(
  eventIds: string[]
): EventTemplate {
  const tags: string[][] = [
    ['k', '7375'],
    ...eventIds.map(id => ['e', id]),
  ];

  return {
    kind: 5,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: '',
  };
}

/**
 * Build a kind 10019 nutzap info event template.
 * Tags contain the 02-prefixed P2PK pubkey, preferred mints, and relays.
 */
export function buildNutzapInfoEvent(
  p2pkPubkey: string,
  mints: string[],
  relays: string[]
): EventTemplate {
  const tags: string[][] = [
    ['pubkey', p2pkPubkey],
    ...mints.map(m => ['mint', m]),
    ...relays.map(r => ['relay', r]),
  ];

  return {
    kind: 10019,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: '',
  };
}

/**
 * Build a kind 9321 nutzap event template.
 * Contains P2PK-locked proofs in content (not encrypted -- P2PK is the security).
 */
export function buildNutzapEvent(
  params: NutzapSendParams,
  lockedProofs: Proof[]
): EventTemplate {
  const amount = lockedProofs.reduce((sum, p) => sum + p.amount, 0);

  const tags: string[][] = [
    ['amount', amount.toString()],
    ['unit', 'sat'],
    ['u', params.mintUrl!],
    ['p', params.recipientPubkey],
  ];

  if (params.eventId) {
    tags.push(['e', params.eventId]);
  }

  return {
    kind: 9321,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: JSON.stringify(lockedProofs),
  };
}

// ---------------------------------------------------------------------------
// NIP-60 Event Parsers
// ---------------------------------------------------------------------------

/**
 * Parse a kind 17375 wallet config event.
 */
export function parseWalletConfigEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any,
  identityPrivkeyHex: string
): Nip60WalletConfig {
  const decrypted = decryptFromSelf(event.content, identityPrivkeyHex);
  const parsed = JSON.parse(decrypted);

  return {
    mints: parsed.mints || [],
    privkey: parsed.privkey,
  };
}

/**
 * Parse a kind 7375 unspent proof event.
 */
export function parseUnspentProofEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any,
  identityPrivkeyHex: string
): Nip60UnspentProofs {
  const decrypted = decryptFromSelf(event.content, identityPrivkeyHex);
  const parsed = JSON.parse(decrypted);

  return {
    mint: parsed.mint,
    proofs: parsed.proofs || [],
    unit: parsed.unit || 'sat',
    del: parsed.del,
  };
}

/**
 * Parse a kind 9321 nutzap event.
 */
export function parseNutzapEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any
): NutzapReceived {
  const mintTag = event.tags.find((t: string[]) => t[0] === 'u');
  const eventTag = event.tags.find((t: string[]) => t[0] === 'e');
  const amountTag = event.tags.find((t: string[]) => t[0] === 'amount');

  const proofs: Proof[] = JSON.parse(event.content);
  const amount = amountTag
    ? parseInt(amountTag[1], 10)
    : proofs.reduce((sum: number, p: Proof) => sum + p.amount, 0);

  return {
    eventId: event.id,
    senderPubkey: event.pubkey,
    amount,
    mint: mintTag?.[1] || '',
    proofs,
    comment: undefined, // Content is proofs JSON, not a comment
    targetEventId: eventTag?.[1],
    createdAt: event.created_at,
  };
}

/**
 * Parse a kind 10019 nutzap info event.
 */
export function parseNutzapInfoEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any
): NutzapInfo {
  const pubkeyTag = event.tags.find((t: string[]) => t[0] === 'pubkey');
  const mintTags = event.tags.filter((t: string[]) => t[0] === 'mint');
  const relayTags = event.tags.filter((t: string[]) => t[0] === 'relay');

  return {
    pubkey: pubkeyTag?.[1] || '',
    mints: mintTags.map((t: string[]) => t[1]),
    relays: relayTags.map((t: string[]) => t[1]),
  };
}

// ---------------------------------------------------------------------------
// Signing Helper
// ---------------------------------------------------------------------------

/**
 * Sign an event template with a private key.
 */
export function signEvent(
  eventTemplate: EventTemplate,
  privkeyHex: string
): ReturnType<typeof finalizeEvent> {
  return finalizeEvent(eventTemplate, utils.hexToBytes(privkeyHex));
}
