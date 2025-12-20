/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@angular/core';

declare const chrome: any;

export type LogCategory =
  | 'nip07'
  | 'permission'
  | 'vault'
  | 'profile'
  | 'bookmark'
  | 'system';

export interface LogEntry {
  timestamp: Date;
  level: 'log' | 'warn' | 'error' | 'debug';
  category: LogCategory;
  icon: string;
  message: string;
  data?: any;
}

// Serializable format for storage
interface StoredLogEntry {
  timestamp: string;
  level: 'log' | 'warn' | 'error' | 'debug';
  category: LogCategory;
  icon: string;
  message: string;
  data?: any;
}

const LOGS_STORAGE_KEY = 'extensionLogs';

@Injectable({
  providedIn: 'root',
})
export class LoggerService {
  #namespace: string | undefined;
  #logs: LogEntry[] = [];
  #maxLogs = 500;

  get logs(): LogEntry[] {
    return this.#logs;
  }

  async initialize(namespace: string): Promise<void> {
    this.#namespace = namespace;
    await this.#loadLogsFromStorage();
  }

  async #loadLogsFromStorage(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        const result = await chrome.storage.session.get(LOGS_STORAGE_KEY);
        if (result[LOGS_STORAGE_KEY]) {
          // Convert stored format back to LogEntry with Date objects
          this.#logs = (result[LOGS_STORAGE_KEY] as StoredLogEntry[]).map(
            (entry) => ({
              ...entry,
              timestamp: new Date(entry.timestamp),
            })
          );
        }
      }
    } catch (error) {
      console.error('Failed to load logs from storage:', error);
    }
  }

  async #saveLogsToStorage(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        // Convert Date to ISO string for storage
        const storedLogs: StoredLogEntry[] = this.#logs.map((entry) => ({
          ...entry,
          timestamp: entry.timestamp.toISOString(),
        }));
        await chrome.storage.session.set({ [LOGS_STORAGE_KEY]: storedLogs });
      }
    } catch (error) {
      console.error('Failed to save logs to storage:', error);
    }
  }

  async refreshLogs(): Promise<void> {
    await this.#loadLogsFromStorage();
  }

  // ============================================
  // Generic logging methods
  // ============================================

  log(value: any, data?: any) {
    this.#assureInitialized();
    this.#addLog('log', 'system', '📝', value, data);
    this.#consoleLog('log', value);
  }

  warn(value: any, data?: any) {
    this.#assureInitialized();
    this.#addLog('warn', 'system', '⚠️', value, data);
    this.#consoleLog('warn', value);
  }

  error(value: any, data?: any) {
    this.#assureInitialized();
    this.#addLog('error', 'system', '❌', value, data);
    this.#consoleLog('error', value);
  }

  debug(value: any, data?: any) {
    this.#assureInitialized();
    this.#addLog('debug', 'system', '🔍', value, data);
    this.#consoleLog('debug', value);
  }

  // ============================================
  // NIP-07 Action Logging
  // ============================================

  logNip07Action(
    method: string,
    host: string,
    approved: boolean,
    autoApproved: boolean,
    details?: { kind?: number; peerPubkey?: string }
  ) {
    this.#assureInitialized();
    const approvalType = autoApproved ? 'auto-approved' : approved ? 'approved' : 'denied';
    const icon = approved ? '✅' : '🚫';

    let message = `${method} from ${host} - ${approvalType}`;
    if (details?.kind !== undefined) {
      message += ` (kind: ${details.kind})`;
    }

    this.#addLog('log', 'nip07', icon, message, {
      method,
      host,
      approved,
      autoApproved,
      ...details,
    });
    this.#consoleLog('log', message);
  }

  logNip07GetPublicKey(host: string, approved: boolean, autoApproved: boolean) {
    this.logNip07Action('getPublicKey', host, approved, autoApproved);
  }

  logNip07SignEvent(
    host: string,
    kind: number,
    approved: boolean,
    autoApproved: boolean
  ) {
    this.logNip07Action('signEvent', host, approved, autoApproved, { kind });
  }

  logNip07Encrypt(
    method: 'nip04.encrypt' | 'nip44.encrypt',
    host: string,
    approved: boolean,
    autoApproved: boolean,
    peerPubkey?: string
  ) {
    this.logNip07Action(method, host, approved, autoApproved, { peerPubkey });
  }

  logNip07Decrypt(
    method: 'nip04.decrypt' | 'nip44.decrypt',
    host: string,
    approved: boolean,
    autoApproved: boolean,
    peerPubkey?: string
  ) {
    this.logNip07Action(method, host, approved, autoApproved, { peerPubkey });
  }

  logNip07GetRelays(host: string, approved: boolean, autoApproved: boolean) {
    this.logNip07Action('getRelays', host, approved, autoApproved);
  }

  // ============================================
  // Permission Logging
  // ============================================

  logPermissionStored(
    host: string,
    method: string,
    policy: string,
    kind?: number
  ) {
    this.#assureInitialized();
    const icon = policy === 'allow' ? '🔓' : '🔒';
    let message = `Permission stored: ${method} for ${host} - ${policy}`;
    if (kind !== undefined) {
      message += ` (kind: ${kind})`;
    }
    this.#addLog('log', 'permission', icon, message, { host, method, policy, kind });
    this.#consoleLog('log', message);
  }

  logPermissionDeleted(host: string, method: string, kind?: number) {
    this.#assureInitialized();
    let message = `Permission deleted: ${method} for ${host}`;
    if (kind !== undefined) {
      message += ` (kind: ${kind})`;
    }
    this.#addLog('log', 'permission', '🗑️', message, { host, method, kind });
    this.#consoleLog('log', message);
  }

  // ============================================
  // Vault Operations Logging
  // ============================================

  logVaultUnlock() {
    this.#assureInitialized();
    this.#addLog('log', 'vault', '🔓', 'Vault unlocked', undefined);
    this.#consoleLog('log', 'Vault unlocked');
  }

  logVaultLock() {
    this.#assureInitialized();
    this.#addLog('log', 'vault', '🔒', 'Vault locked', undefined);
    this.#consoleLog('log', 'Vault locked');
  }

  logVaultCreated() {
    this.#assureInitialized();
    this.#addLog('log', 'vault', '🆕', 'Vault created', undefined);
    this.#consoleLog('log', 'Vault created');
  }

  logVaultExport(fileName: string) {
    this.#assureInitialized();
    this.#addLog('log', 'vault', '📤', `Vault exported: ${fileName}`, { fileName });
    this.#consoleLog('log', `Vault exported: ${fileName}`);
  }

  logVaultImport(fileName: string) {
    this.#assureInitialized();
    this.#addLog('log', 'vault', '📥', `Vault imported: ${fileName}`, { fileName });
    this.#consoleLog('log', `Vault imported: ${fileName}`);
  }

  logVaultReset() {
    this.#assureInitialized();
    this.#addLog('warn', 'vault', '🗑️', 'Extension reset', undefined);
    this.#consoleLog('warn', 'Extension reset');
  }

  // ============================================
  // Profile Operations Logging
  // ============================================

  logProfileFetchError(pubkey: string, error: string) {
    this.#assureInitialized();
    const shortPubkey = pubkey.substring(0, 8) + '...';
    this.#addLog('error', 'profile', '👤', `Failed to fetch profile for ${shortPubkey}: ${error}`, {
      pubkey,
      error,
    });
    this.#consoleLog('error', `Failed to fetch profile for ${shortPubkey}: ${error}`);
  }

  logProfileParseError(pubkey: string) {
    this.#assureInitialized();
    const shortPubkey = pubkey.substring(0, 8) + '...';
    this.#addLog('error', 'profile', '👤', `Failed to parse profile content for ${shortPubkey}`, {
      pubkey,
    });
    this.#consoleLog('error', `Failed to parse profile content for ${shortPubkey}`);
  }

  logNip05ValidationError(nip05: string, error: string) {
    this.#assureInitialized();
    this.#addLog('error', 'profile', '🔗', `NIP-05 validation failed for ${nip05}: ${error}`, {
      nip05,
      error,
    });
    this.#consoleLog('error', `NIP-05 validation failed for ${nip05}: ${error}`);
  }

  logNip05ValidationSuccess(nip05: string, pubkey: string) {
    this.#assureInitialized();
    const shortPubkey = pubkey.substring(0, 8) + '...';
    this.#addLog('log', 'profile', '✓', `NIP-05 verified: ${nip05} → ${shortPubkey}`, {
      nip05,
      pubkey,
    });
    this.#consoleLog('log', `NIP-05 verified: ${nip05} → ${shortPubkey}`);
  }

  logProfileEdit(identityNick: string, field: string) {
    this.#assureInitialized();
    this.#addLog('log', 'profile', '✏️', `Profile edited: ${identityNick} - ${field}`, {
      identityNick,
      field,
    });
    this.#consoleLog('log', `Profile edited: ${identityNick} - ${field}`);
  }

  logIdentityCreated(nick: string) {
    this.#assureInitialized();
    this.#addLog('log', 'profile', '🆕', `Identity created: ${nick}`, { nick });
    this.#consoleLog('log', `Identity created: ${nick}`);
  }

  logIdentityDeleted(nick: string) {
    this.#assureInitialized();
    this.#addLog('warn', 'profile', '🗑️', `Identity deleted: ${nick}`, { nick });
    this.#consoleLog('warn', `Identity deleted: ${nick}`);
  }

  logIdentitySelected(nick: string) {
    this.#assureInitialized();
    this.#addLog('log', 'profile', '👆', `Identity selected: ${nick}`, { nick });
    this.#consoleLog('log', `Identity selected: ${nick}`);
  }

  // ============================================
  // Bookmark Operations Logging
  // ============================================

  logBookmarkAdded(url: string, title: string) {
    this.#assureInitialized();
    this.#addLog('log', 'bookmark', '🔖', `Bookmark added: ${title}`, { url, title });
    this.#consoleLog('log', `Bookmark added: ${title}`);
  }

  logBookmarkRemoved(url: string, title: string) {
    this.#assureInitialized();
    this.#addLog('log', 'bookmark', '🗑️', `Bookmark removed: ${title}`, { url, title });
    this.#consoleLog('log', `Bookmark removed: ${title}`);
  }

  // ============================================
  // System/Error Logging
  // ============================================

  logRelayFetchError(identityNick: string, error: string) {
    this.#assureInitialized();
    this.#addLog('error', 'system', '📡', `Failed to fetch relays for ${identityNick}: ${error}`, {
      identityNick,
      error,
    });
    this.#consoleLog('error', `Failed to fetch relays for ${identityNick}: ${error}`);
  }

  logStorageError(operation: string, error: string) {
    this.#assureInitialized();
    this.#addLog('error', 'system', '💾', `Storage error (${operation}): ${error}`, {
      operation,
      error,
    });
    this.#consoleLog('error', `Storage error (${operation}): ${error}`);
  }

  logCryptoError(operation: string, error: string) {
    this.#assureInitialized();
    this.#addLog('error', 'system', '🔐', `Crypto error (${operation}): ${error}`, {
      operation,
      error,
    });
    this.#consoleLog('error', `Crypto error (${operation}): ${error}`);
  }

  // ============================================
  // Internal methods
  // ============================================

  async clear(): Promise<void> {
    this.#logs = [];
    await this.#saveLogsToStorage();
  }

  #addLog(
    level: LogEntry['level'],
    category: LogCategory,
    icon: string,
    message: any,
    data?: any
  ) {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      category,
      icon,
      message: typeof message === 'string' ? message : JSON.stringify(message),
      data,
    };
    this.#logs.unshift(entry);

    // Limit stored logs
    if (this.#logs.length > this.#maxLogs) {
      this.#logs.pop();
    }

    // Save to storage asynchronously (don't block)
    this.#saveLogsToStorage();
  }

  #consoleLog(level: 'log' | 'warn' | 'error' | 'debug', message: string) {
    const nowString = new Date().toLocaleString();
    const formattedMsg = `[${this.#namespace} - ${nowString}] ${message}`;
    switch (level) {
      case 'warn':
        console.warn(formattedMsg);
        break;
      case 'error':
        console.error(formattedMsg);
        break;
      case 'debug':
        console.debug(formattedMsg);
        break;
      default:
        console.log(formattedMsg);
    }
  }

  #assureInitialized() {
    if (!this.#namespace) {
      throw new Error(
        'LoggerService not initialized. Please call initialize(..) first.'
      );
    }
  }
}

// ============================================
// Standalone functions for background script
// (Background script runs in different context without Angular DI)
// ============================================

export async function backgroundLog(
  category: LogCategory,
  icon: string,
  level: LogEntry['level'],
  message: string,
  data?: any
): Promise<void> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.session) {
      console.log(`[Background] ${message}`);
      return;
    }

    const result = await chrome.storage.session.get(LOGS_STORAGE_KEY);
    const existingLogs: StoredLogEntry[] = result[LOGS_STORAGE_KEY] || [];

    const newEntry: StoredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      icon,
      message,
      data,
    };

    const updatedLogs = [newEntry, ...existingLogs].slice(0, 500);
    await chrome.storage.session.set({ [LOGS_STORAGE_KEY]: updatedLogs });
  } catch (error) {
    console.error('Failed to add background log:', error);
  }
}

export async function backgroundLogNip07Action(
  method: string,
  host: string,
  approved: boolean,
  autoApproved: boolean,
  details?: { kind?: number; peerPubkey?: string }
): Promise<void> {
  const approvalType = autoApproved
    ? 'auto-approved'
    : approved
      ? 'approved'
      : 'denied';
  const icon = approved ? '✅' : '🚫';

  let message = `${method} from ${host} - ${approvalType}`;
  if (details?.kind !== undefined) {
    message += ` (kind: ${details.kind})`;
  }

  await backgroundLog('nip07', icon, 'log', message, {
    method,
    host,
    approved,
    autoApproved,
    ...details,
  });
}

export async function backgroundLogPermissionStored(
  host: string,
  method: string,
  policy: string,
  kind?: number
): Promise<void> {
  const icon = policy === 'allow' ? '🔓' : '🔒';
  let message = `Permission stored: ${method} for ${host} - ${policy}`;
  if (kind !== undefined) {
    message += ` (kind: ${kind})`;
  }
  await backgroundLog('permission', icon, 'log', message, {
    host,
    method,
    policy,
    kind,
  });
}
