import {
  BrowserSessionData,
  BrowserSyncData,
  CryptoHelper,
  StorageService,
  generateSalt,
  generateIV,
  deriveKeyArgon2,
} from '@common';
import { Buffer } from 'buffer';
import { decryptCashuMints, encryptCashuMint } from './cashu';
import { decryptIdentities, encryptIdentity, LockedVaultContext } from './identity';
import { decryptNwcConnections, encryptNwcConnection } from './nwc';
import { decryptPermissions } from './permission';
import { decryptRelays, encryptRelay } from './relay';

export const createNewVault = async function (
  this: StorageService,
  password: string
): Promise<void> {
  this.assureIsInitialized();

  const vaultHash = await CryptoHelper.hash(password);

  // v2: Generate random salt and derive key with Argon2id
  const salt = generateSalt();
  const iv = generateIV();
  const saltBytes = Buffer.from(salt, 'base64');
  const keyBytes = await deriveKeyArgon2(password, saltBytes);
  const vaultKey = Buffer.from(keyBytes).toString('base64');

  const sessionData: BrowserSessionData = {
    iv,
    salt,
    vaultKey, // v2: Store pre-derived key instead of password
    identities: [],
    permissions: [],
    relays: [],
    nwcConnections: [],
    cashuMints: [],
    selectedIdentityId: null,
  };
  await this.getBrowserSessionHandler().saveFullData(sessionData);
  this.getBrowserSessionHandler().setFullData(sessionData);

  const syncData: BrowserSyncData = {
    version: this.latestVersion,
    salt, // v2: Random salt for Argon2id
    iv,
    vaultHash,
    identities: [],
    permissions: [],
    relays: [],
    nwcConnections: [],
    cashuMints: [],
    selectedIdentityId: null,
  };
  await this.getBrowserSyncHandler().saveAndSetFullData(syncData);
};

export const unlockVault = async function (
  this: StorageService,
  password: string
): Promise<void> {
  this.assureIsInitialized();
  console.log('[vault] Starting unlock...');

  let browserSessionData = this.getBrowserSessionHandler().browserSessionData;
  if (browserSessionData) {
    throw new Error(
      'Browser session data is available. Should only happen when the vault is unlocked'
    );
  }

  const browserSyncData = this.getBrowserSyncHandler().browserSyncData;
  if (!browserSyncData) {
    throw new Error(
      'Browser sync data is not available. Should have been loaded before.'
    );
  }

  console.log('[vault] Checking password hash...');
  const passwordHash = await CryptoHelper.hash(password);
  if (passwordHash !== browserSyncData.vaultHash) {
    throw new Error('Invalid password.');
  }
  console.log('[vault] Password hash verified');

  // Detect vault version
  const isV2 = !!browserSyncData.salt;
  console.log('[vault] Vault version:', isV2 ? 'v2' : 'v1');

  let withLockedVault: LockedVaultContext;
  let vaultKey: string | undefined;
  let vaultPassword: string | undefined;

  if (isV2) {
    // v2: Derive key with Argon2id (~3 seconds)
    console.log('[vault] Deriving key with Argon2id...');
    const saltBytes = Buffer.from(browserSyncData.salt!, 'base64');
    const keyBytes = await deriveKeyArgon2(password, saltBytes);
    console.log('[vault] Key derived, length:', keyBytes.length);
    vaultKey = Buffer.from(keyBytes).toString('base64');
    withLockedVault = {
      iv: browserSyncData.iv,
      keyBase64: vaultKey,
    };
  } else {
    // v1: Use password with PBKDF2
    vaultPassword = password;
    withLockedVault = {
      iv: browserSyncData.iv,
      password,
    };
  }

  // Decrypt the data
  console.log('[vault] Decrypting identities...');
  const decryptedIdentities = await decryptIdentities.call(
    this,
    browserSyncData.identities,
    withLockedVault
  );
  console.log('[vault] Decrypted', decryptedIdentities.length, 'identities');

  console.log('[vault] Decrypting permissions...');
  const decryptedPermissions = await decryptPermissions.call(
    this,
    browserSyncData.permissions,
    withLockedVault
  );
  console.log('[vault] Decrypted', decryptedPermissions.length, 'permissions');

  console.log('[vault] Decrypting relays...');
  const decryptedRelays = await decryptRelays.call(
    this,
    browserSyncData.relays,
    withLockedVault
  );
  console.log('[vault] Decrypted', decryptedRelays.length, 'relays');

  console.log('[vault] Decrypting NWC connections...');
  const decryptedNwcConnections = await decryptNwcConnections.call(
    this,
    browserSyncData.nwcConnections ?? [],
    withLockedVault
  );
  console.log('[vault] Decrypted', decryptedNwcConnections.length, 'NWC connections');

  console.log('[vault] Decrypting Cashu mints...');
  const decryptedCashuMints = await decryptCashuMints.call(
    this,
    browserSyncData.cashuMints ?? [],
    withLockedVault
  );
  console.log('[vault] Decrypted', decryptedCashuMints.length, 'Cashu mints');

  console.log('[vault] Decrypting selectedIdentityId...');
  let decryptedSelectedIdentityId: string | null = null;
  if (browserSyncData.selectedIdentityId !== null) {
    if (isV2) {
      decryptedSelectedIdentityId = await this.decryptWithLockedVaultV2(
        browserSyncData.selectedIdentityId,
        'string',
        browserSyncData.iv,
        vaultKey!
      );
    } else {
      decryptedSelectedIdentityId = await this.decryptWithLockedVault(
        browserSyncData.selectedIdentityId,
        'string',
        browserSyncData.iv,
        password
      );
    }
  }
  console.log('[vault] selectedIdentityId:', decryptedSelectedIdentityId);

  browserSessionData = {
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

  console.log('[vault] Saving session data...');
  await this.getBrowserSessionHandler().saveFullData(browserSessionData);
  this.getBrowserSessionHandler().setFullData(browserSessionData);
  console.log('[vault] Session data saved');

  // Auto-migrate v1 to v2 after successful unlock
  if (!isV2) {
    console.log('[vault] Migrating v1 to v2...');
    await migrateVaultV1ToV2.call(this, password);
    console.log('[vault] Migration complete');
  }

  console.log('[vault] Unlock complete!');
};

/**
 * Migrate a v1 vault (PBKDF2) to v2 (Argon2id)
 * Called automatically after successful v1 unlock
 */
async function migrateVaultV1ToV2(
  this: StorageService,
  password: string
): Promise<void> {
  const browserSyncData = this.getBrowserSyncHandler().browserSyncData;
  const browserSessionData = this.getBrowserSessionHandler().browserSessionData;
  if (!browserSyncData || !browserSessionData) {
    throw new Error('Cannot migrate: data not available');
  }

  // Generate new salt and derive Argon2id key
  const newSalt = generateSalt();
  const newIv = generateIV();
  const saltBytes = Buffer.from(newSalt, 'base64');
  const keyBytes = await deriveKeyArgon2(password, saltBytes);
  const vaultKey = Buffer.from(keyBytes).toString('base64');

  // Update session data with new v2 credentials
  browserSessionData.salt = newSalt;
  browserSessionData.iv = newIv;
  browserSessionData.vaultKey = vaultKey;
  browserSessionData.vaultPassword = undefined; // Remove v1 password

  // Re-encrypt all data with new v2 key
  const encryptedIdentities = [];
  for (const identity of browserSessionData.identities) {
    const encrypted = await encryptIdentity.call(this, identity);
    encryptedIdentities.push(encrypted);
  }

  const encryptedRelays = [];
  for (const relay of browserSessionData.relays) {
    const encrypted = await encryptRelay.call(this, relay);
    encryptedRelays.push(encrypted);
  }

  // For permissions, we need to re-encrypt them too
  const encryptedPermissions = [];
  for (const permission of browserSessionData.permissions) {
    const encryptedPermission = {
      id: await this.encrypt(permission.id),
      identityId: await this.encrypt(permission.identityId),
      host: await this.encrypt(permission.host),
      method: await this.encrypt(permission.method),
      methodPolicy: await this.encrypt(permission.methodPolicy),
      kind: permission.kind !== undefined ? await this.encrypt(permission.kind.toString()) : undefined,
    };
    encryptedPermissions.push(encryptedPermission);
  }

  // Re-encrypt NWC connections
  const encryptedNwcConnections = [];
  for (const nwcConnection of browserSessionData.nwcConnections ?? []) {
    const encrypted = await encryptNwcConnection.call(this, nwcConnection);
    encryptedNwcConnections.push(encrypted);
  }

  // Re-encrypt Cashu mints
  const encryptedCashuMints = [];
  for (const cashuMint of browserSessionData.cashuMints ?? []) {
    const encrypted = await encryptCashuMint.call(this, cashuMint);
    encryptedCashuMints.push(encrypted);
  }

  const encryptedSelectedIdentityId = browserSessionData.selectedIdentityId
    ? await this.encrypt(browserSessionData.selectedIdentityId)
    : null;

  // Update sync data with v2 format
  const migratedSyncData: BrowserSyncData = {
    version: this.latestVersion,
    salt: newSalt,
    iv: newIv,
    vaultHash: browserSyncData.vaultHash, // Keep same password hash
    identities: encryptedIdentities,
    permissions: encryptedPermissions,
    relays: encryptedRelays,
    nwcConnections: encryptedNwcConnections,
    cashuMints: encryptedCashuMints,
    selectedIdentityId: encryptedSelectedIdentityId,
  };

  // Save migrated data
  await this.getBrowserSyncHandler().saveAndSetFullData(migratedSyncData);
  await this.getBrowserSessionHandler().saveFullData(browserSessionData);

  console.log('Vault migrated from v1 (PBKDF2) to v2 (Argon2id)');
}

export const deleteVault = async function (
  this: StorageService,
  doNotSetIsInitializedToFalse: boolean
): Promise<void> {
  this.assureIsInitialized();
  const syncFlow = this.getSignerMetaHandler().signerMetaData?.syncFlow;
  if (typeof syncFlow === 'undefined') {
    throw new Error('Sync flow is not set.');
  }

  await this.getBrowserSyncHandler().clearData();
  await this.getBrowserSessionHandler().clearData();

  if (!doNotSetIsInitializedToFalse) {
    this.isInitialized = false;
  }
};
