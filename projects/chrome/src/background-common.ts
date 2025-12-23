/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BrowserSessionData,
  BrowserSyncData,
  BrowserSyncFlow,
  CryptoHelper,
  SignerMetaData,
  Identity_DECRYPTED,
  Identity_ENCRYPTED,
  Nip07Method,
  Nip07MethodPolicy,
  NostrHelper,
  Permission_DECRYPTED,
  Permission_ENCRYPTED,
  Relay_DECRYPTED,
  Relay_ENCRYPTED,
  NwcConnection_DECRYPTED,
  NwcConnection_ENCRYPTED,
  CashuMint_DECRYPTED,
  CashuMint_ENCRYPTED,
  deriveKeyArgon2,
} from '@common';
import { ChromeMetaHandler } from './app/common/data/chrome-meta-handler';
import { Event, EventTemplate, finalizeEvent, nip04, nip44 } from 'nostr-tools';
import { Buffer } from 'buffer';

// Unlock request/response message types
export interface UnlockRequestMessage {
  type: 'unlock-request';
  id: string;
  password: string;
}

export interface UnlockResponseMessage {
  type: 'unlock-response';
  id: string;
  success: boolean;
  error?: string;
}

export const debug = function (message: any) {
  const dateString = new Date().toISOString();
  console.log(`[Plebeian Signer - ${dateString}]: ${JSON.stringify(message)}`);
};

export type PromptResponse =
  | 'reject'
  | 'reject-once'
  | 'approve'
  | 'approve-once';

export interface PromptResponseMessage {
  id: string;
  response: PromptResponse;
}

export interface BackgroundRequestMessage {
  method: Nip07Method;
  params: any;
  host: string;
}

export const getBrowserSessionData = async function (): Promise<
  BrowserSessionData | undefined
> {
  const browserSessionData = await chrome.storage.session.get(null);
  if (Object.keys(browserSessionData).length === 0) {
    return undefined;
  }

  return browserSessionData as BrowserSessionData;
};

export const getSignerMetaData = async function (): Promise<SignerMetaData> {
  const signerMetaHandler = new ChromeMetaHandler();
  return (await signerMetaHandler.loadFullData()) as SignerMetaData;
};

/**
 * Check if reckless mode should auto-approve the request.
 * Returns true if should auto-approve, false if should use normal permission flow.
 *
 * Logic:
 * - If reckless mode is OFF → return false (use normal flow)
 * - If reckless mode is ON and whitelist is empty → return true (approve all)
 * - If reckless mode is ON and whitelist has entries → return true only if host is in whitelist
 */
export const shouldRecklessModeApprove = async function (
  host: string
): Promise<boolean> {
  const signerMetaData = await getSignerMetaData();
  debug(`shouldRecklessModeApprove: recklessMode=${signerMetaData.recklessMode}, host=${host}`);
  debug(`Full signerMetaData: ${JSON.stringify(signerMetaData)}`);

  if (!signerMetaData.recklessMode) {
    return false;
  }

  const whitelistedHosts = signerMetaData.whitelistedHosts ?? [];

  if (whitelistedHosts.length === 0) {
    // Reckless mode ON, no whitelist → approve all
    return true;
  }

  // Reckless mode ON, whitelist has entries → only approve if host is whitelisted
  return whitelistedHosts.includes(host);
};

export const getBrowserSyncData = async function (): Promise<
  BrowserSyncData | undefined
> {
  const signerMetaHandler = new ChromeMetaHandler();
  const signerMetaData =
    (await signerMetaHandler.loadFullData()) as SignerMetaData;

  let browserSyncData: BrowserSyncData | undefined;

  if (signerMetaData.syncFlow === BrowserSyncFlow.NO_SYNC) {
    browserSyncData = (await chrome.storage.local.get(null)) as BrowserSyncData;
  } else if (signerMetaData.syncFlow === BrowserSyncFlow.BROWSER_SYNC) {
    browserSyncData = (await chrome.storage.sync.get(null)) as BrowserSyncData;
  }

  return browserSyncData;
};

export const savePermissionsToBrowserSyncStorage = async function (
  permissions: Permission_ENCRYPTED[]
): Promise<void> {
  const signerMetaHandler = new ChromeMetaHandler();
  const signerMetaData =
    (await signerMetaHandler.loadFullData()) as SignerMetaData;

  if (signerMetaData.syncFlow === BrowserSyncFlow.NO_SYNC) {
    await chrome.storage.local.set({ permissions });
  } else if (signerMetaData.syncFlow === BrowserSyncFlow.BROWSER_SYNC) {
    await chrome.storage.sync.set({ permissions });
  }
};

export const checkPermissions = function (
  browserSessionData: BrowserSessionData,
  identity: Identity_DECRYPTED,
  host: string,
  method: Nip07Method,
  params: any
): boolean | undefined {
  const permissions = browserSessionData.permissions.filter(
    (x) =>
      x.identityId === identity.id && x.host === host && x.method === method
  );

  if (permissions.length === 0) {
    return undefined;
  }

  if (method === 'getPublicKey') {
    // No evaluation of params required.
    return permissions.every((x) => x.methodPolicy === 'allow');
  }

  if (method === 'getRelays') {
    // No evaluation of params required.
    return permissions.every((x) => x.methodPolicy === 'allow');
  }

  if (method === 'signEvent') {
    // Evaluate params.
    const eventTemplate = params as EventTemplate;
    if (
      permissions.find(
        (x) => x.methodPolicy === 'allow' && typeof x.kind === 'undefined'
      )
    ) {
      return true;
    }

    if (
      permissions.some(
        (x) => x.methodPolicy === 'allow' && x.kind === eventTemplate.kind
      )
    ) {
      return true;
    }

    if (
      permissions.some(
        (x) => x.methodPolicy === 'deny' && x.kind === eventTemplate.kind
      )
    ) {
      return false;
    }

    return undefined;
  }

  if (method === 'nip04.encrypt') {
    // No evaluation of params required.
    return permissions.every((x) => x.methodPolicy === 'allow');
  }

  if (method === 'nip44.encrypt') {
    // No evaluation of params required.
    return permissions.every((x) => x.methodPolicy === 'allow');
  }

  if (method === 'nip04.decrypt') {
    // No evaluation of params required.
    return permissions.every((x) => x.methodPolicy === 'allow');
  }

  if (method === 'nip44.decrypt') {
    // No evaluation of params required.
    return permissions.every((x) => x.methodPolicy === 'allow');
  }

  return undefined;
};

export const storePermission = async function (
  browserSessionData: BrowserSessionData,
  identity: Identity_DECRYPTED,
  host: string,
  method: Nip07Method,
  methodPolicy: Nip07MethodPolicy,
  kind?: number
) {
  const browserSyncData = await getBrowserSyncData();
  if (!browserSyncData) {
    throw new Error(`Could not retrieve sync data`);
  }

  const permission: Permission_DECRYPTED = {
    id: crypto.randomUUID(),
    identityId: identity.id,
    host,
    method,
    methodPolicy,
    kind,
  };

  // Store session data
  await chrome.storage.session.set({
    permissions: [...browserSessionData.permissions, permission],
  });

  // Encrypt permission to store in sync storage (depending on sync flow).
  const encryptedPermission = await encryptPermission(
    permission,
    browserSessionData
  );

  await savePermissionsToBrowserSyncStorage([
    ...browserSyncData.permissions,
    encryptedPermission,
  ]);
};

export const getPosition = async function (width: number, height: number) {
  let left = 0;
  let top = 0;

  try {
    const lastFocused = await chrome.windows.getLastFocused();

    if (
      lastFocused &&
      lastFocused.top !== undefined &&
      lastFocused.left !== undefined &&
      lastFocused.width !== undefined &&
      lastFocused.height !== undefined
    ) {
      // Position window in the center of the lastFocused window
      top = Math.round(lastFocused.top + (lastFocused.height - height) / 2);
      left = Math.round(lastFocused.left + (lastFocused.width - width) / 2);
    } else {
      console.error('Last focused window properties are undefined.');
    }
  } catch (error) {
    console.error('Error getting window position:', error);
  }

  return {
    top,
    left,
  };
};

export const signEvent = function (
  eventTemplate: EventTemplate,
  privkey: string
): Event {
  return finalizeEvent(eventTemplate, NostrHelper.hex2bytes(privkey));
};

export const nip04Encrypt = async function (
  privkey: string,
  peerPubkey: string,
  plaintext: string
): Promise<string> {
  return await nip04.encrypt(
    NostrHelper.hex2bytes(privkey),
    peerPubkey,
    plaintext
  );
};

export const nip44Encrypt = async function (
  privkey: string,
  peerPubkey: string,
  plaintext: string
): Promise<string> {
  const key = nip44.v2.utils.getConversationKey(
    NostrHelper.hex2bytes(privkey),
    peerPubkey
  );
  return nip44.v2.encrypt(plaintext, key);
};

export const nip04Decrypt = async function (
  privkey: string,
  peerPubkey: string,
  ciphertext: string
): Promise<string> {
  return await nip04.decrypt(
    NostrHelper.hex2bytes(privkey),
    peerPubkey,
    ciphertext
  );
};

export const nip44Decrypt = async function (
  privkey: string,
  peerPubkey: string,
  ciphertext: string
): Promise<string> {
  const key = nip44.v2.utils.getConversationKey(
    NostrHelper.hex2bytes(privkey),
    peerPubkey
  );

  return nip44.v2.decrypt(ciphertext, key);
};

const encryptPermission = async function (
  permission: Permission_DECRYPTED,
  sessionData: BrowserSessionData
): Promise<Permission_ENCRYPTED> {
  const encryptedPermission: Permission_ENCRYPTED = {
    id: await encrypt(permission.id, sessionData),
    identityId: await encrypt(permission.identityId, sessionData),
    host: await encrypt(permission.host, sessionData),
    method: await encrypt(permission.method, sessionData),
    methodPolicy: await encrypt(permission.methodPolicy, sessionData),
  };

  if (typeof permission.kind !== 'undefined') {
    encryptedPermission.kind = await encrypt(
      permission.kind.toString(),
      sessionData
    );
  }

  return encryptedPermission;
};

const encrypt = async function (
  value: string,
  sessionData: BrowserSessionData
): Promise<string> {
  // v2: Use pre-derived key with AES-GCM directly
  if (sessionData.vaultKey) {
    const keyBytes = Buffer.from(sessionData.vaultKey, 'base64');
    const iv = Buffer.from(sessionData.iv, 'base64');

    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const cipherText = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(value)
    );

    return Buffer.from(cipherText).toString('base64');
  }

  // v1: Use password with PBKDF2
  return await CryptoHelper.encrypt(value, sessionData.iv, sessionData.vaultPassword!);
};

// ==========================================
// Unlock Vault Logic (for background script)
// ==========================================

/**
 * Decrypt a value using AES-GCM with pre-derived key (v2)
 */
async function decryptV2(
  encryptedBase64: string,
  ivBase64: string,
  keyBase64: string
): Promise<string> {
  const keyBytes = Buffer.from(keyBase64, 'base64');
  const iv = Buffer.from(ivBase64, 'base64');
  const cipherText = Buffer.from(encryptedBase64, 'base64');

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    cipherText
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Decrypt a value using PBKDF2 (v1)
 */
async function decryptV1(
  encryptedBase64: string,
  ivBase64: string,
  password: string
): Promise<string> {
  return CryptoHelper.decrypt(encryptedBase64, ivBase64, password);
}

/**
 * Generic decrypt function that handles both v1 and v2
 */
async function decryptValue(
  encrypted: string,
  iv: string,
  keyOrPassword: string,
  isV2: boolean
): Promise<string> {
  if (isV2) {
    return decryptV2(encrypted, iv, keyOrPassword);
  }
  return decryptV1(encrypted, iv, keyOrPassword);
}

/**
 * Parse decrypted value to the desired type
 */
function parseValue(value: string, type: 'string' | 'number' | 'boolean'): any {
  switch (type) {
    case 'number':
      return parseInt(value);
    case 'boolean':
      return value === 'true';
    default:
      return value;
  }
}

/**
 * Decrypt an identity
 */
async function decryptIdentity(
  identity: Identity_ENCRYPTED,
  iv: string,
  keyOrPassword: string,
  isV2: boolean
): Promise<Identity_DECRYPTED> {
  return {
    id: await decryptValue(identity.id, iv, keyOrPassword, isV2),
    nick: await decryptValue(identity.nick, iv, keyOrPassword, isV2),
    createdAt: await decryptValue(identity.createdAt, iv, keyOrPassword, isV2),
    privkey: await decryptValue(identity.privkey, iv, keyOrPassword, isV2),
  };
}

/**
 * Decrypt a permission
 */
async function decryptPermission(
  permission: Permission_ENCRYPTED,
  iv: string,
  keyOrPassword: string,
  isV2: boolean
): Promise<Permission_DECRYPTED> {
  const decrypted: Permission_DECRYPTED = {
    id: await decryptValue(permission.id, iv, keyOrPassword, isV2),
    identityId: await decryptValue(permission.identityId, iv, keyOrPassword, isV2),
    host: await decryptValue(permission.host, iv, keyOrPassword, isV2),
    method: await decryptValue(permission.method, iv, keyOrPassword, isV2) as Nip07Method,
    methodPolicy: await decryptValue(permission.methodPolicy, iv, keyOrPassword, isV2) as Nip07MethodPolicy,
  };
  if (permission.kind) {
    decrypted.kind = parseValue(await decryptValue(permission.kind, iv, keyOrPassword, isV2), 'number');
  }
  return decrypted;
}

/**
 * Decrypt a relay
 */
async function decryptRelay(
  relay: Relay_ENCRYPTED,
  iv: string,
  keyOrPassword: string,
  isV2: boolean
): Promise<Relay_DECRYPTED> {
  return {
    id: await decryptValue(relay.id, iv, keyOrPassword, isV2),
    identityId: await decryptValue(relay.identityId, iv, keyOrPassword, isV2),
    url: await decryptValue(relay.url, iv, keyOrPassword, isV2),
    read: parseValue(await decryptValue(relay.read, iv, keyOrPassword, isV2), 'boolean'),
    write: parseValue(await decryptValue(relay.write, iv, keyOrPassword, isV2), 'boolean'),
  };
}

/**
 * Decrypt an NWC connection
 */
async function decryptNwcConnection(
  nwc: NwcConnection_ENCRYPTED,
  iv: string,
  keyOrPassword: string,
  isV2: boolean
): Promise<NwcConnection_DECRYPTED> {
  const decrypted: NwcConnection_DECRYPTED = {
    id: await decryptValue(nwc.id, iv, keyOrPassword, isV2),
    name: await decryptValue(nwc.name, iv, keyOrPassword, isV2),
    connectionUrl: await decryptValue(nwc.connectionUrl, iv, keyOrPassword, isV2),
    walletPubkey: await decryptValue(nwc.walletPubkey, iv, keyOrPassword, isV2),
    relayUrl: await decryptValue(nwc.relayUrl, iv, keyOrPassword, isV2),
    secret: await decryptValue(nwc.secret, iv, keyOrPassword, isV2),
    createdAt: await decryptValue(nwc.createdAt, iv, keyOrPassword, isV2),
  };
  if (nwc.lud16) {
    decrypted.lud16 = await decryptValue(nwc.lud16, iv, keyOrPassword, isV2);
  }
  if (nwc.cachedBalance) {
    decrypted.cachedBalance = parseValue(await decryptValue(nwc.cachedBalance, iv, keyOrPassword, isV2), 'number');
  }
  if (nwc.cachedBalanceAt) {
    decrypted.cachedBalanceAt = await decryptValue(nwc.cachedBalanceAt, iv, keyOrPassword, isV2);
  }
  return decrypted;
}

/**
 * Decrypt a Cashu mint
 */
async function decryptCashuMint(
  mint: CashuMint_ENCRYPTED,
  iv: string,
  keyOrPassword: string,
  isV2: boolean
): Promise<CashuMint_DECRYPTED> {
  const proofsJson = await decryptValue(mint.proofs, iv, keyOrPassword, isV2);
  const decrypted: CashuMint_DECRYPTED = {
    id: await decryptValue(mint.id, iv, keyOrPassword, isV2),
    name: await decryptValue(mint.name, iv, keyOrPassword, isV2),
    mintUrl: await decryptValue(mint.mintUrl, iv, keyOrPassword, isV2),
    unit: await decryptValue(mint.unit, iv, keyOrPassword, isV2),
    createdAt: await decryptValue(mint.createdAt, iv, keyOrPassword, isV2),
    proofs: JSON.parse(proofsJson),
  };
  if (mint.cachedBalance) {
    decrypted.cachedBalance = parseValue(await decryptValue(mint.cachedBalance, iv, keyOrPassword, isV2), 'number');
  }
  if (mint.cachedBalanceAt) {
    decrypted.cachedBalanceAt = await decryptValue(mint.cachedBalanceAt, iv, keyOrPassword, isV2);
  }
  return decrypted;
}

/**
 * Handle an unlock request from the unlock popup
 */
export async function handleUnlockRequest(
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    debug('handleUnlockRequest: Starting unlock...');

    // Check if already unlocked
    const existingSession = await getBrowserSessionData();
    if (existingSession) {
      debug('handleUnlockRequest: Already unlocked');
      return { success: true };
    }

    // Get sync data
    const browserSyncData = await getBrowserSyncData();
    if (!browserSyncData) {
      return { success: false, error: 'No vault data found' };
    }

    // Verify password
    const passwordHash = await CryptoHelper.hash(password);
    if (passwordHash !== browserSyncData.vaultHash) {
      return { success: false, error: 'Invalid password' };
    }
    debug('handleUnlockRequest: Password verified');

    // Detect vault version
    const isV2 = !!browserSyncData.salt;
    debug(`handleUnlockRequest: Vault version: ${isV2 ? 'v2' : 'v1'}`);

    let keyOrPassword: string;
    let vaultKey: string | undefined;
    let vaultPassword: string | undefined;

    if (isV2) {
      // v2: Derive key with Argon2id (~3 seconds)
      debug('handleUnlockRequest: Deriving Argon2id key...');
      const saltBytes = Buffer.from(browserSyncData.salt!, 'base64');
      const keyBytes = await deriveKeyArgon2(password, saltBytes);
      vaultKey = Buffer.from(keyBytes).toString('base64');
      keyOrPassword = vaultKey;
      debug('handleUnlockRequest: Key derived');
    } else {
      // v1: Use password directly
      vaultPassword = password;
      keyOrPassword = password;
    }

    // Decrypt identities
    debug('handleUnlockRequest: Decrypting identities...');
    const decryptedIdentities: Identity_DECRYPTED[] = [];
    for (const identity of browserSyncData.identities) {
      const decrypted = await decryptIdentity(identity, browserSyncData.iv, keyOrPassword, isV2);
      decryptedIdentities.push(decrypted);
    }
    debug(`handleUnlockRequest: Decrypted ${decryptedIdentities.length} identities`);

    // Decrypt permissions
    debug('handleUnlockRequest: Decrypting permissions...');
    const decryptedPermissions: Permission_DECRYPTED[] = [];
    for (const permission of browserSyncData.permissions) {
      try {
        const decrypted = await decryptPermission(permission, browserSyncData.iv, keyOrPassword, isV2);
        decryptedPermissions.push(decrypted);
      } catch (e) {
        debug(`handleUnlockRequest: Skipping corrupted permission: ${e}`);
      }
    }
    debug(`handleUnlockRequest: Decrypted ${decryptedPermissions.length} permissions`);

    // Decrypt relays
    debug('handleUnlockRequest: Decrypting relays...');
    const decryptedRelays: Relay_DECRYPTED[] = [];
    for (const relay of browserSyncData.relays) {
      const decrypted = await decryptRelay(relay, browserSyncData.iv, keyOrPassword, isV2);
      decryptedRelays.push(decrypted);
    }
    debug(`handleUnlockRequest: Decrypted ${decryptedRelays.length} relays`);

    // Decrypt NWC connections
    debug('handleUnlockRequest: Decrypting NWC connections...');
    const decryptedNwcConnections: NwcConnection_DECRYPTED[] = [];
    for (const nwc of browserSyncData.nwcConnections ?? []) {
      const decrypted = await decryptNwcConnection(nwc, browserSyncData.iv, keyOrPassword, isV2);
      decryptedNwcConnections.push(decrypted);
    }
    debug(`handleUnlockRequest: Decrypted ${decryptedNwcConnections.length} NWC connections`);

    // Decrypt Cashu mints
    debug('handleUnlockRequest: Decrypting Cashu mints...');
    const decryptedCashuMints: CashuMint_DECRYPTED[] = [];
    for (const mint of browserSyncData.cashuMints ?? []) {
      const decrypted = await decryptCashuMint(mint, browserSyncData.iv, keyOrPassword, isV2);
      decryptedCashuMints.push(decrypted);
    }
    debug(`handleUnlockRequest: Decrypted ${decryptedCashuMints.length} Cashu mints`);

    // Decrypt selectedIdentityId
    let decryptedSelectedIdentityId: string | null = null;
    if (browserSyncData.selectedIdentityId !== null) {
      decryptedSelectedIdentityId = await decryptValue(
        browserSyncData.selectedIdentityId,
        browserSyncData.iv,
        keyOrPassword,
        isV2
      );
    }
    debug(`handleUnlockRequest: selectedIdentityId: ${decryptedSelectedIdentityId}`);

    // Build session data
    const browserSessionData: BrowserSessionData = {
      vaultPassword: isV2 ? undefined : vaultPassword,
      vaultKey: isV2 ? vaultKey : undefined,
      iv: browserSyncData.iv,
      salt: browserSyncData.salt,
      permissions: decryptedPermissions,
      identities: decryptedIdentities,
      selectedIdentityId: decryptedSelectedIdentityId,
      relays: decryptedRelays,
      nwcConnections: decryptedNwcConnections,
      cashuMints: decryptedCashuMints,
    };

    // Save session data
    debug('handleUnlockRequest: Saving session data...');
    await chrome.storage.session.set(browserSessionData);
    debug('handleUnlockRequest: Unlock complete!');

    return { success: true };
  } catch (error: any) {
    debug(`handleUnlockRequest: Error: ${error.message}`);
    return { success: false, error: error.message || 'Unlock failed' };
  }
}

/**
 * Open the unlock popup window
 */
export async function openUnlockPopup(host?: string): Promise<void> {
  const width = 375;
  const height = 500;
  const { top, left } = await getPosition(width, height);

  const id = crypto.randomUUID();
  let url = `unlock.html?id=${id}`;
  if (host) {
    url += `&host=${encodeURIComponent(host)}`;
  }

  await chrome.windows.create({
    type: 'popup',
    url,
    height,
    width,
    top,
    left,
  });
}
