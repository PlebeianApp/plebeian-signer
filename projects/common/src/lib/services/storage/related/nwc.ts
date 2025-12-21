import {
  CryptoHelper,
  NwcConnection_DECRYPTED,
  NwcConnection_ENCRYPTED,
  StorageService,
} from '@common';
import { LockedVaultContext } from './identity';

/**
 * Parse a nostr+walletconnect:// URL into its components
 */
export function parseNwcUrl(url: string): {
  walletPubkey: string;
  relayUrl: string;
  secret: string;
  lud16?: string;
} | null {
  try {
    // Format: nostr+walletconnect://<pubkey>?relay=<url>&secret=<hex>&lud16=<optional>
    const match = url.match(/^nostr\+walletconnect:\/\/([a-f0-9]{64})\?(.+)$/i);
    if (!match) {
      return null;
    }

    const walletPubkey = match[1].toLowerCase();
    const params = new URLSearchParams(match[2]);

    const relayUrl = params.get('relay');
    const secret = params.get('secret');
    const lud16 = params.get('lud16') || undefined;

    if (!relayUrl || !secret) {
      return null;
    }

    // Validate secret is 64-char hex
    if (!/^[a-f0-9]{64}$/i.test(secret)) {
      return null;
    }

    return {
      walletPubkey,
      relayUrl: decodeURIComponent(relayUrl),
      secret: secret.toLowerCase(),
      lud16,
    };
  } catch {
    return null;
  }
}

export const addNwcConnection = async function (
  this: StorageService,
  data: {
    name: string;
    connectionUrl: string;
  }
): Promise<void> {
  this.assureIsInitialized();

  // Parse the NWC URL
  const parsed = parseNwcUrl(data.connectionUrl);
  if (!parsed) {
    throw new Error('Invalid NWC URL format');
  }

  // Check if a connection with the same wallet pubkey already exists
  const existingConnection = (
    this.getBrowserSessionHandler().browserSessionData?.nwcConnections ?? []
  ).find((x) => x.walletPubkey === parsed.walletPubkey);
  if (existingConnection) {
    throw new Error(
      `A connection to this wallet already exists: ${existingConnection.name}`
    );
  }

  const browserSessionData = this.getBrowserSessionHandler().browserSessionData;
  if (!browserSessionData) {
    throw new Error('Browser session data is undefined.');
  }

  const decryptedConnection: NwcConnection_DECRYPTED = {
    id: CryptoHelper.v4(),
    name: data.name,
    connectionUrl: data.connectionUrl,
    walletPubkey: parsed.walletPubkey,
    relayUrl: parsed.relayUrl,
    secret: parsed.secret,
    lud16: parsed.lud16,
    createdAt: new Date().toISOString(),
  };

  // Initialize array if needed
  if (!browserSessionData.nwcConnections) {
    browserSessionData.nwcConnections = [];
  }

  // Add the new connection to the session data
  browserSessionData.nwcConnections.push(decryptedConnection);
  this.getBrowserSessionHandler().saveFullData(browserSessionData);

  // Encrypt the new connection and add it to the sync data
  const encryptedConnection = await encryptNwcConnection.call(
    this,
    decryptedConnection
  );
  const encryptedConnections = [
    ...(this.getBrowserSyncHandler().browserSyncData?.nwcConnections ?? []),
    encryptedConnection,
  ];

  await this.getBrowserSyncHandler().saveAndSetPartialData_NwcConnections({
    nwcConnections: encryptedConnections,
  });
};

export const deleteNwcConnection = async function (
  this: StorageService,
  connectionId: string
): Promise<void> {
  this.assureIsInitialized();

  if (!connectionId) {
    return;
  }

  const browserSessionData = this.getBrowserSessionHandler().browserSessionData;
  const browserSyncData = this.getBrowserSyncHandler().browserSyncData;
  if (!browserSessionData || !browserSyncData) {
    throw new Error('Browser session or sync data is undefined.');
  }

  // Remove from session data
  browserSessionData.nwcConnections = (
    browserSessionData.nwcConnections ?? []
  ).filter((x) => x.id !== connectionId);
  await this.getBrowserSessionHandler().saveFullData(browserSessionData);

  // Handle Sync data
  const encryptedConnectionId = await this.encrypt(connectionId);
  await this.getBrowserSyncHandler().saveAndSetPartialData_NwcConnections({
    nwcConnections: (browserSyncData.nwcConnections ?? []).filter(
      (x) => x.id !== encryptedConnectionId
    ),
  });
};

export const updateNwcConnectionBalance = async function (
  this: StorageService,
  connectionId: string,
  balanceMillisats: number
): Promise<void> {
  this.assureIsInitialized();

  const browserSessionData = this.getBrowserSessionHandler().browserSessionData;
  const browserSyncData = this.getBrowserSyncHandler().browserSyncData;
  if (!browserSessionData || !browserSyncData) {
    throw new Error('Browser session or sync data is undefined.');
  }

  const sessionConnection = (browserSessionData.nwcConnections ?? []).find(
    (x) => x.id === connectionId
  );
  const encryptedConnectionId = await this.encrypt(connectionId);
  const syncConnection = (browserSyncData.nwcConnections ?? []).find(
    (x) => x.id === encryptedConnectionId
  );

  if (!sessionConnection || !syncConnection) {
    throw new Error('NWC connection not found for balance update.');
  }

  const now = new Date().toISOString();

  // Update session data
  sessionConnection.cachedBalance = balanceMillisats;
  sessionConnection.cachedBalanceAt = now;
  await this.getBrowserSessionHandler().saveFullData(browserSessionData);

  // Update sync data
  syncConnection.cachedBalance = await this.encrypt(balanceMillisats.toString());
  syncConnection.cachedBalanceAt = await this.encrypt(now);
  await this.getBrowserSyncHandler().saveAndSetPartialData_NwcConnections({
    nwcConnections: browserSyncData.nwcConnections ?? [],
  });
};

export const encryptNwcConnection = async function (
  this: StorageService,
  connection: NwcConnection_DECRYPTED
): Promise<NwcConnection_ENCRYPTED> {
  const encrypted: NwcConnection_ENCRYPTED = {
    id: await this.encrypt(connection.id),
    name: await this.encrypt(connection.name),
    connectionUrl: await this.encrypt(connection.connectionUrl),
    walletPubkey: await this.encrypt(connection.walletPubkey),
    relayUrl: await this.encrypt(connection.relayUrl),
    secret: await this.encrypt(connection.secret),
    createdAt: await this.encrypt(connection.createdAt),
  };

  if (connection.lud16) {
    encrypted.lud16 = await this.encrypt(connection.lud16);
  }
  if (connection.cachedBalance !== undefined) {
    encrypted.cachedBalance = await this.encrypt(
      connection.cachedBalance.toString()
    );
  }
  if (connection.cachedBalanceAt) {
    encrypted.cachedBalanceAt = await this.encrypt(connection.cachedBalanceAt);
  }

  return encrypted;
};

export const decryptNwcConnection = async function (
  this: StorageService,
  connection: NwcConnection_ENCRYPTED,
  withLockedVault: LockedVaultContext | undefined = undefined
): Promise<NwcConnection_DECRYPTED> {
  if (typeof withLockedVault === 'undefined') {
    // Normal decryption with unlocked vault
    const decrypted: NwcConnection_DECRYPTED = {
      id: await this.decrypt(connection.id, 'string'),
      name: await this.decrypt(connection.name, 'string'),
      connectionUrl: await this.decrypt(connection.connectionUrl, 'string'),
      walletPubkey: await this.decrypt(connection.walletPubkey, 'string'),
      relayUrl: await this.decrypt(connection.relayUrl, 'string'),
      secret: await this.decrypt(connection.secret, 'string'),
      createdAt: await this.decrypt(connection.createdAt, 'string'),
    };

    if (connection.lud16) {
      decrypted.lud16 = await this.decrypt(connection.lud16, 'string');
    }
    if (connection.cachedBalance) {
      decrypted.cachedBalance = await this.decrypt(
        connection.cachedBalance,
        'number'
      );
    }
    if (connection.cachedBalanceAt) {
      decrypted.cachedBalanceAt = await this.decrypt(
        connection.cachedBalanceAt,
        'string'
      );
    }

    return decrypted;
  }

  // v2: Use pre-derived key
  if (withLockedVault.keyBase64) {
    const decrypted: NwcConnection_DECRYPTED = {
      id: await this.decryptWithLockedVaultV2(
        connection.id,
        'string',
        withLockedVault.iv,
        withLockedVault.keyBase64
      ),
      name: await this.decryptWithLockedVaultV2(
        connection.name,
        'string',
        withLockedVault.iv,
        withLockedVault.keyBase64
      ),
      connectionUrl: await this.decryptWithLockedVaultV2(
        connection.connectionUrl,
        'string',
        withLockedVault.iv,
        withLockedVault.keyBase64
      ),
      walletPubkey: await this.decryptWithLockedVaultV2(
        connection.walletPubkey,
        'string',
        withLockedVault.iv,
        withLockedVault.keyBase64
      ),
      relayUrl: await this.decryptWithLockedVaultV2(
        connection.relayUrl,
        'string',
        withLockedVault.iv,
        withLockedVault.keyBase64
      ),
      secret: await this.decryptWithLockedVaultV2(
        connection.secret,
        'string',
        withLockedVault.iv,
        withLockedVault.keyBase64
      ),
      createdAt: await this.decryptWithLockedVaultV2(
        connection.createdAt,
        'string',
        withLockedVault.iv,
        withLockedVault.keyBase64
      ),
    };

    if (connection.lud16) {
      decrypted.lud16 = await this.decryptWithLockedVaultV2(
        connection.lud16,
        'string',
        withLockedVault.iv,
        withLockedVault.keyBase64
      );
    }
    if (connection.cachedBalance) {
      decrypted.cachedBalance = await this.decryptWithLockedVaultV2(
        connection.cachedBalance,
        'number',
        withLockedVault.iv,
        withLockedVault.keyBase64
      );
    }
    if (connection.cachedBalanceAt) {
      decrypted.cachedBalanceAt = await this.decryptWithLockedVaultV2(
        connection.cachedBalanceAt,
        'string',
        withLockedVault.iv,
        withLockedVault.keyBase64
      );
    }

    return decrypted;
  }

  // v1: Use password (PBKDF2)
  const decrypted: NwcConnection_DECRYPTED = {
    id: await this.decryptWithLockedVault(
      connection.id,
      'string',
      withLockedVault.iv,
      withLockedVault.password!
    ),
    name: await this.decryptWithLockedVault(
      connection.name,
      'string',
      withLockedVault.iv,
      withLockedVault.password!
    ),
    connectionUrl: await this.decryptWithLockedVault(
      connection.connectionUrl,
      'string',
      withLockedVault.iv,
      withLockedVault.password!
    ),
    walletPubkey: await this.decryptWithLockedVault(
      connection.walletPubkey,
      'string',
      withLockedVault.iv,
      withLockedVault.password!
    ),
    relayUrl: await this.decryptWithLockedVault(
      connection.relayUrl,
      'string',
      withLockedVault.iv,
      withLockedVault.password!
    ),
    secret: await this.decryptWithLockedVault(
      connection.secret,
      'string',
      withLockedVault.iv,
      withLockedVault.password!
    ),
    createdAt: await this.decryptWithLockedVault(
      connection.createdAt,
      'string',
      withLockedVault.iv,
      withLockedVault.password!
    ),
  };

  if (connection.lud16) {
    decrypted.lud16 = await this.decryptWithLockedVault(
      connection.lud16,
      'string',
      withLockedVault.iv,
      withLockedVault.password!
    );
  }
  if (connection.cachedBalance) {
    decrypted.cachedBalance = await this.decryptWithLockedVault(
      connection.cachedBalance,
      'number',
      withLockedVault.iv,
      withLockedVault.password!
    );
  }
  if (connection.cachedBalanceAt) {
    decrypted.cachedBalanceAt = await this.decryptWithLockedVault(
      connection.cachedBalanceAt,
      'string',
      withLockedVault.iv,
      withLockedVault.password!
    );
  }

  return decrypted;
};

export const decryptNwcConnections = async function (
  this: StorageService,
  connections: NwcConnection_ENCRYPTED[],
  withLockedVault: LockedVaultContext | undefined = undefined
): Promise<NwcConnection_DECRYPTED[]> {
  const decryptedConnections: NwcConnection_DECRYPTED[] = [];

  for (const connection of connections) {
    const decryptedConnection = await decryptNwcConnection.call(
      this,
      connection,
      withLockedVault
    );
    decryptedConnections.push(decryptedConnection);
  }

  return decryptedConnections;
};
