import {
  CryptoHelper,
  CashuMint_DECRYPTED,
  CashuMint_ENCRYPTED,
  CashuProof,
  StorageService,
} from '@common';
import { LockedVaultContext } from './identity';

/**
 * Validate a Cashu mint URL
 */
export function isValidMintUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export const addCashuMint = async function (
  this: StorageService,
  data: {
    name: string;
    mintUrl: string;
    unit?: string;
  }
): Promise<CashuMint_DECRYPTED> {
  this.assureIsInitialized();

  // Validate the mint URL
  if (!isValidMintUrl(data.mintUrl)) {
    throw new Error('Invalid mint URL format');
  }

  // Normalize URL (remove trailing slash)
  const normalizedUrl = data.mintUrl.replace(/\/$/, '');

  // Check if a mint with the same URL already exists
  const existingMint = (
    this.getBrowserSessionHandler().browserSessionData?.cashuMints ?? []
  ).find((x) => x.mintUrl === normalizedUrl);
  if (existingMint) {
    throw new Error(
      `A connection to this mint already exists: ${existingMint.name}`
    );
  }

  const browserSessionData = this.getBrowserSessionHandler().browserSessionData;
  if (!browserSessionData) {
    throw new Error('Browser session data is undefined.');
  }

  const decryptedMint: CashuMint_DECRYPTED = {
    id: CryptoHelper.v4(),
    name: data.name,
    mintUrl: normalizedUrl,
    unit: data.unit ?? 'sat',
    createdAt: new Date().toISOString(),
    proofs: [], // Start with no proofs
    cachedBalance: 0,
    cachedBalanceAt: new Date().toISOString(),
  };

  // Initialize array if needed
  if (!browserSessionData.cashuMints) {
    browserSessionData.cashuMints = [];
  }

  // Add the new mint to the session data
  browserSessionData.cashuMints.push(decryptedMint);
  this.getBrowserSessionHandler().saveFullData(browserSessionData);

  // Encrypt the new mint and add it to the sync data
  const encryptedMint = await encryptCashuMint.call(this, decryptedMint);
  const encryptedMints = [
    ...(this.getBrowserSyncHandler().browserSyncData?.cashuMints ?? []),
    encryptedMint,
  ];

  await this.getBrowserSyncHandler().saveAndSetPartialData_CashuMints({
    cashuMints: encryptedMints,
  });

  return decryptedMint;
};

export const deleteCashuMint = async function (
  this: StorageService,
  mintId: string
): Promise<void> {
  this.assureIsInitialized();

  if (!mintId) {
    return;
  }

  const browserSessionData = this.getBrowserSessionHandler().browserSessionData;
  const browserSyncData = this.getBrowserSyncHandler().browserSyncData;
  if (!browserSessionData || !browserSyncData) {
    throw new Error('Browser session or sync data is undefined.');
  }

  // Remove from session data
  browserSessionData.cashuMints = (browserSessionData.cashuMints ?? []).filter(
    (x) => x.id !== mintId
  );
  await this.getBrowserSessionHandler().saveFullData(browserSessionData);

  // Handle Sync data
  const encryptedMintId = await this.encrypt(mintId);
  await this.getBrowserSyncHandler().saveAndSetPartialData_CashuMints({
    cashuMints: (browserSyncData.cashuMints ?? []).filter(
      (x) => x.id !== encryptedMintId
    ),
  });
};

/**
 * Update the proofs for a Cashu mint
 * This is called after send/receive operations
 */
export const updateCashuMintProofs = async function (
  this: StorageService,
  mintId: string,
  proofs: CashuProof[]
): Promise<void> {
  this.assureIsInitialized();

  const browserSessionData = this.getBrowserSessionHandler().browserSessionData;
  const browserSyncData = this.getBrowserSyncHandler().browserSyncData;
  if (!browserSessionData || !browserSyncData) {
    throw new Error('Browser session or sync data is undefined.');
  }

  const sessionMint = (browserSessionData.cashuMints ?? []).find(
    (x) => x.id === mintId
  );
  const encryptedMintId = await this.encrypt(mintId);
  const syncMint = (browserSyncData.cashuMints ?? []).find(
    (x) => x.id === encryptedMintId
  );

  if (!sessionMint || !syncMint) {
    throw new Error('Cashu mint not found for proofs update.');
  }

  const now = new Date().toISOString();
  // Calculate balance from proofs (sum of all proof amounts in satoshis)
  const balance = proofs.reduce((sum, p) => sum + p.amount, 0);

  // Update session data
  sessionMint.proofs = proofs;
  sessionMint.cachedBalance = balance;
  sessionMint.cachedBalanceAt = now;
  await this.getBrowserSessionHandler().saveFullData(browserSessionData);

  // Update sync data
  syncMint.proofs = await this.encrypt(JSON.stringify(proofs));
  syncMint.cachedBalance = await this.encrypt(balance.toString());
  syncMint.cachedBalanceAt = await this.encrypt(now);
  await this.getBrowserSyncHandler().saveAndSetPartialData_CashuMints({
    cashuMints: browserSyncData.cashuMints ?? [],
  });
};

export const encryptCashuMint = async function (
  this: StorageService,
  mint: CashuMint_DECRYPTED
): Promise<CashuMint_ENCRYPTED> {
  const encrypted: CashuMint_ENCRYPTED = {
    id: await this.encrypt(mint.id),
    name: await this.encrypt(mint.name),
    mintUrl: await this.encrypt(mint.mintUrl),
    unit: await this.encrypt(mint.unit),
    createdAt: await this.encrypt(mint.createdAt),
    proofs: await this.encrypt(JSON.stringify(mint.proofs)),
  };

  if (mint.cachedBalance !== undefined) {
    encrypted.cachedBalance = await this.encrypt(mint.cachedBalance.toString());
  }
  if (mint.cachedBalanceAt) {
    encrypted.cachedBalanceAt = await this.encrypt(mint.cachedBalanceAt);
  }

  return encrypted;
};

export const decryptCashuMint = async function (
  this: StorageService,
  mint: CashuMint_ENCRYPTED,
  withLockedVault: LockedVaultContext | undefined = undefined
): Promise<CashuMint_DECRYPTED> {
  if (typeof withLockedVault === 'undefined') {
    // Normal decryption with unlocked vault
    const proofsJson = await this.decrypt(mint.proofs, 'string');
    const decrypted: CashuMint_DECRYPTED = {
      id: await this.decrypt(mint.id, 'string'),
      name: await this.decrypt(mint.name, 'string'),
      mintUrl: await this.decrypt(mint.mintUrl, 'string'),
      unit: await this.decrypt(mint.unit, 'string'),
      createdAt: await this.decrypt(mint.createdAt, 'string'),
      proofs: JSON.parse(proofsJson) as CashuProof[],
    };

    if (mint.cachedBalance) {
      decrypted.cachedBalance = await this.decrypt(mint.cachedBalance, 'number');
    }
    if (mint.cachedBalanceAt) {
      decrypted.cachedBalanceAt = await this.decrypt(
        mint.cachedBalanceAt,
        'string'
      );
    }

    return decrypted;
  }

  // v2: Use pre-derived key
  if (withLockedVault.keyBase64) {
    const proofsJson = await this.decryptWithLockedVaultV2(
      mint.proofs,
      'string',
      withLockedVault.iv,
      withLockedVault.keyBase64
    );
    const decrypted: CashuMint_DECRYPTED = {
      id: await this.decryptWithLockedVaultV2(
        mint.id,
        'string',
        withLockedVault.iv,
        withLockedVault.keyBase64
      ),
      name: await this.decryptWithLockedVaultV2(
        mint.name,
        'string',
        withLockedVault.iv,
        withLockedVault.keyBase64
      ),
      mintUrl: await this.decryptWithLockedVaultV2(
        mint.mintUrl,
        'string',
        withLockedVault.iv,
        withLockedVault.keyBase64
      ),
      unit: await this.decryptWithLockedVaultV2(
        mint.unit,
        'string',
        withLockedVault.iv,
        withLockedVault.keyBase64
      ),
      createdAt: await this.decryptWithLockedVaultV2(
        mint.createdAt,
        'string',
        withLockedVault.iv,
        withLockedVault.keyBase64
      ),
      proofs: JSON.parse(proofsJson) as CashuProof[],
    };

    if (mint.cachedBalance) {
      decrypted.cachedBalance = await this.decryptWithLockedVaultV2(
        mint.cachedBalance,
        'number',
        withLockedVault.iv,
        withLockedVault.keyBase64
      );
    }
    if (mint.cachedBalanceAt) {
      decrypted.cachedBalanceAt = await this.decryptWithLockedVaultV2(
        mint.cachedBalanceAt,
        'string',
        withLockedVault.iv,
        withLockedVault.keyBase64
      );
    }

    return decrypted;
  }

  // v1: Use password (PBKDF2)
  const proofsJson = await this.decryptWithLockedVault(
    mint.proofs,
    'string',
    withLockedVault.iv,
    withLockedVault.password!
  );
  const decrypted: CashuMint_DECRYPTED = {
    id: await this.decryptWithLockedVault(
      mint.id,
      'string',
      withLockedVault.iv,
      withLockedVault.password!
    ),
    name: await this.decryptWithLockedVault(
      mint.name,
      'string',
      withLockedVault.iv,
      withLockedVault.password!
    ),
    mintUrl: await this.decryptWithLockedVault(
      mint.mintUrl,
      'string',
      withLockedVault.iv,
      withLockedVault.password!
    ),
    unit: await this.decryptWithLockedVault(
      mint.unit,
      'string',
      withLockedVault.iv,
      withLockedVault.password!
    ),
    createdAt: await this.decryptWithLockedVault(
      mint.createdAt,
      'string',
      withLockedVault.iv,
      withLockedVault.password!
    ),
    proofs: JSON.parse(proofsJson) as CashuProof[],
  };

  if (mint.cachedBalance) {
    decrypted.cachedBalance = await this.decryptWithLockedVault(
      mint.cachedBalance,
      'number',
      withLockedVault.iv,
      withLockedVault.password!
    );
  }
  if (mint.cachedBalanceAt) {
    decrypted.cachedBalanceAt = await this.decryptWithLockedVault(
      mint.cachedBalanceAt,
      'string',
      withLockedVault.iv,
      withLockedVault.password!
    );
  }

  return decrypted;
};

export const decryptCashuMints = async function (
  this: StorageService,
  mints: CashuMint_ENCRYPTED[],
  withLockedVault: LockedVaultContext | undefined = undefined
): Promise<CashuMint_DECRYPTED[]> {
  const decryptedMints: CashuMint_DECRYPTED[] = [];

  for (const mint of mints) {
    const decryptedMint = await decryptCashuMint.call(
      this,
      mint,
      withLockedVault
    );
    decryptedMints.push(decryptedMint);
  }

  return decryptedMints;
};
