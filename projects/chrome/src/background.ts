/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  NostrHelper,
  NwcClient,
  NwcConnection_DECRYPTED,
  WeblnMethod,
  Nip07Method,
  NutzapMethod,
  GetInfoResponse,
  SendPaymentResponse,
  RequestInvoiceResponse,
  pubkeyFromPrivkey,
  getP2pkPubkey,
  generateWalletPrivkey,
  buildNutzapEvent,
  buildUnspentProofEvent,
  parseNutzapEvent,
  parseNutzapInfoEvent,
  signEvent as signNip60Event,
  publishToRelaysWithAuth,
  FALLBACK_PROFILE_RELAYS,
} from '@common';
import {
  BackgroundRequestMessage,
  checkPermissions,
  checkWeblnPermissions,
  checkNutzapPermissions,
  debug,
  getBrowserSessionData,
  getPosition,
  getSignerMetaData,
  handleUnlockRequest,
  handleUnlockWithKey,
  isSignerPaused,
  isWeblnMethod,
  isNutzapMethod,
  nip04Decrypt,
  nip04Encrypt,
  nip44Decrypt,
  nip44Encrypt,
  openUnlockPopup,
  PromptResponse,
  PromptResponseMessage,
  getPermissionLevel,
  shouldRecklessModeApprove,
  signEvent,
  storePermission,
  encryptCashuMintForVault,
  saveCashuMintsToBrowserSyncStorage,
  getBrowserSyncData,
  UnlockRequestMessage,
  UnlockResponseMessage,
} from './background-common';
import { SimplePool } from 'nostr-tools/pool';
import { Mint, Wallet, P2PKBuilder, type Proof } from '@cashu/cashu-ts';
import browser from 'webextension-polyfill';
import { Buffer } from 'buffer';

// Cache for NWC clients to avoid reconnecting for each request
const nwcClientCache = new Map<string, NwcClient>();

// ==========================================
// Icon Management for Paused State
// ==========================================

/**
 * Update the extension icon based on paused state
 */
async function updateIcon(paused: boolean): Promise<void> {
  const suffix = paused ? '-paused' : '';
  await browser.action.setIcon({
    path: {
      48: `icon-48${suffix}.png`,
      128: `icon-128${suffix}.png`,
    },
  });
}

// Initialize icon state on startup
isSignerPaused().then(updateIcon);

// ==========================================
// Update Available Badge
// ==========================================

chrome.runtime.onUpdateAvailable.addListener((details) => {
  debug(`Update available: v${details.version}`);
  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#dc3545' });
});

// ==========================================
// Service Worker Keep-Alive & Auto-Unlock
// ==========================================

// Keep the service worker alive with a periodic alarm.
// MV3 service workers are terminated after ~30s of inactivity,
// which causes "Extension context invalidated" errors.
const KEEP_ALIVE_ALARM = 'keep-alive';
chrome.alarms.create(KEEP_ALIVE_ALARM, { periodInMinutes: 0.4 }); // ~24 seconds

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEP_ALIVE_ALARM) {
    // No-op - the alarm firing keeps the service worker alive
    return;
  }
});

// Storage key for persisted vault key (used by "Stay Unlocked" feature)
const PERSISTED_VAULT_KEY_STORAGE = 'persistedVaultKey';

/**
 * Try to auto-unlock the vault using a persisted key (from "Stay Unlocked" setting).
 * Returns true if auto-unlock succeeded.
 */
async function tryAutoUnlock(): Promise<boolean> {
  try {
    // Check if already unlocked
    const existing = await getBrowserSessionData();
    if (existing) return true;

    // Check for persisted vault key
    const stored = await chrome.storage.local.get(PERSISTED_VAULT_KEY_STORAGE);
    const persistedData = stored[PERSISTED_VAULT_KEY_STORAGE];
    if (!persistedData?.key) return false;

    debug('Auto-unlock: Found persisted vault key, attempting unlock...');
    const result = await handleUnlockWithKey(persistedData.key, persistedData.isV2 ?? false);
    if (result.success) {
      debug('Auto-unlock: Vault unlocked successfully');
      return true;
    } else {
      debug(`Auto-unlock: Failed - ${result.error}`);
      // Clear invalid persisted key
      await chrome.storage.local.remove(PERSISTED_VAULT_KEY_STORAGE);
      return false;
    }
  } catch (error) {
    debug(`Auto-unlock: Error - ${error}`);
    return false;
  }
}

// On browser startup, try auto-unlock or open unlock popup
chrome.runtime.onStartup.addListener(async () => {
  debug('Browser startup detected');
  const unlocked = await tryAutoUnlock();
  if (!unlocked) {
    // Vault is locked and no persisted key - open unlock popup after a short delay
    // to let the browser fully initialize its window management
    setTimeout(async () => {
      try {
        const stillLocked = !(await getBrowserSessionData());
        if (stillLocked) {
          debug('Opening unlock popup on browser startup');
          await openUnlockPopup();
        }
      } catch (error) {
        debug(`Failed to open unlock popup on startup: ${error}`);
      }
    }, 1500);
  }
});

// Also try auto-unlock when the service worker first loads (handles extension install/update)
tryAutoUnlock();

/**
 * Get or create an NWC client for a connection
 */
async function getNwcClient(connection: NwcConnection_DECRYPTED): Promise<NwcClient> {
  const cached = nwcClientCache.get(connection.id);
  if (cached && cached.isConnected()) {
    return cached;
  }

  const client = new NwcClient({
    walletPubkey: connection.walletPubkey,
    relayUrl: connection.relayUrl,
    secret: connection.secret,
  });

  await client.connect();
  nwcClientCache.set(connection.id, client);
  return client;
}

/**
 * Parse invoice amount from a BOLT11 invoice string
 * Returns amount in satoshis, or undefined if no amount specified
 */
function parseInvoiceAmount(invoice: string): number | undefined {
  try {
    // BOLT11 invoices start with 'ln' followed by network prefix and amount
    // Format: ln[network][amount][multiplier]1[data]
    // Examples: lnbc1500n1... (1500 sat), lnbc1m1... (0.001 BTC = 100000 sat)
    const match = invoice.toLowerCase().match(/^ln(bc|tb|tbs|bcrt)(\d+)([munp])?1/);
    if (!match) {
      return undefined;
    }

    const amountStr = match[2];
    const multiplier = match[3];

    let amount = parseInt(amountStr, 10);

    // Apply multiplier (amount is in BTC by default)
    switch (multiplier) {
      case 'm': // milli-bitcoin (0.001 BTC)
        amount = amount * 100000;
        break;
      case 'u': // micro-bitcoin (0.000001 BTC)
        amount = amount * 100;
        break;
      case 'n': // nano-bitcoin (0.000000001 BTC) = 0.1 sat
        amount = Math.floor(amount / 10);
        break;
      case 'p': // pico-bitcoin (0.000000000001 BTC) = 0.0001 sat
        amount = Math.floor(amount / 10000);
        break;
      default:
        // No multiplier means BTC
        amount = amount * 100000000;
    }

    return amount;
  } catch {
    return undefined;
  }
}

type Relays = Record<string, { read: boolean; write: boolean }>;

// ==========================================
// Permission Prompt Queue System (P0)
// ==========================================

// Timeout for permission prompts (30 seconds)
const PROMPT_TIMEOUT_MS = 30000;

// Maximum number of queued permission requests (prevent DoS)
const MAX_PERMISSION_QUEUE_SIZE = 100;

// Retry settings for window creation (handles browser startup timing)
const WINDOW_CREATE_MAX_RETRIES = 5;
const WINDOW_CREATE_BASE_DELAY_MS = 300;

// Track open prompts with metadata for cleanup
const openPrompts = new Map<
  string,
  {
    resolve: (response: PromptResponse) => void;
    reject: (reason?: any) => void;
    windowId?: number;
    tabId?: number;
    timeoutId?: ReturnType<typeof setTimeout>;
  }
>();

// Track if unlock popup is already open
let unlockPopupOpen = false;

// Queue of pending NIP-07 requests waiting for unlock
const pendingRequests: {
  request: BackgroundRequestMessage;
  resolve: (result: any) => void;
  reject: (error: any) => void;
}[] = [];

// Queue for permission requests (only one prompt shown at a time)
interface PermissionQueueItem {
  id: string;
  url: string;
  width: number;
  height: number;
  resolve: (response: PromptResponse) => void;
  reject: (reason?: any) => void;
}

const permissionQueue: PermissionQueueItem[] = [];
let activePromptId: string | null = null;

/**
 * Show the next permission prompt from the queue.
 * Retries with exponential backoff if window creation fails
 * (e.g. during browser startup when APIs aren't ready yet).
 */
async function showNextPermissionPrompt(): Promise<void> {
  if (activePromptId || permissionQueue.length === 0) {
    return;
  }

  const next = permissionQueue[0];
  activePromptId = next.id;

  // Try creating a positioned popup window with retries
  for (let attempt = 0; attempt < WINDOW_CREATE_MAX_RETRIES; attempt++) {
    try {
      const { top, left } = await getPosition(next.width, next.height);

      const window = await browser.windows.create({
        type: 'popup',
        url: next.url,
        height: next.height,
        width: next.width,
        top,
        left,
      });

      const promptData = openPrompts.get(next.id);
      if (promptData && window.id) {
        promptData.windowId = window.id;
        promptData.timeoutId = setTimeout(() => {
          debug(`Prompt ${next.id} timed out after ${PROMPT_TIMEOUT_MS}ms`);
          cleanupPrompt(next.id, 'timeout');
        }, PROMPT_TIMEOUT_MS);
      }
      return; // Success
    } catch (error) {
      debug(`Failed to create prompt window (attempt ${attempt + 1}/${WINDOW_CREATE_MAX_RETRIES}): ${error}`);
      if (attempt < WINDOW_CREATE_MAX_RETRIES - 1) {
        const delay = WINDOW_CREATE_BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  // Fallback 1: try popup without position (invalid top/left can cause failures)
  try {
    debug('Trying popup without position...');
    const window = await browser.windows.create({
      type: 'popup',
      url: next.url,
      height: next.height,
      width: next.width,
    });
    const promptData = openPrompts.get(next.id);
    if (promptData && window.id) {
      promptData.windowId = window.id;
      promptData.timeoutId = setTimeout(() => {
        cleanupPrompt(next.id, 'timeout');
      }, PROMPT_TIMEOUT_MS);
    }
    return; // Success
  } catch (error) {
    debug(`Popup without position also failed: ${error}`);
  }

  // Fallback 2: open as a tab (most reliable)
  try {
    debug('Falling back to tab...');
    const tab = await browser.tabs.create({ url: next.url });
    const promptData = openPrompts.get(next.id);
    if (promptData && tab.id) {
      promptData.tabId = tab.id;
      promptData.timeoutId = setTimeout(() => {
        cleanupPrompt(next.id, 'timeout');
      }, PROMPT_TIMEOUT_MS);
    }
    return; // Success
  } catch (tabError) {
    debug(`Tab fallback also failed: ${tabError}`);
    cleanupPrompt(next.id, 'error');
  }
}

/**
 * Clean up a prompt and process the next one in queue
 */
function cleanupPrompt(promptId: string, reason: 'response' | 'timeout' | 'closed' | 'error'): void {
  const promptData = openPrompts.get(promptId);

  if (promptData) {
    if (promptData.timeoutId) {
      clearTimeout(promptData.timeoutId);
    }
    if (reason !== 'response') {
      promptData.reject(new Error(`Permission prompt ${reason}`));
    }
    openPrompts.delete(promptId);
  }

  const queueIndex = permissionQueue.findIndex(item => item.id === promptId);
  if (queueIndex !== -1) {
    permissionQueue.splice(queueIndex, 1);
  }

  if (activePromptId === promptId) {
    activePromptId = null;
  }

  showNextPermissionPrompt();
}

/**
 * Queue a permission prompt request
 */
function queuePermissionPrompt(
  urlWithoutId: string,
  width: number,
  height: number
): Promise<PromptResponse> {
  return new Promise((resolve, reject) => {
    if (permissionQueue.length >= MAX_PERMISSION_QUEUE_SIZE) {
      reject(new Error('Too many pending permission requests. Please try again later.'));
      return;
    }

    const id = crypto.randomUUID();
    const separator = urlWithoutId.includes('?') ? '&' : '?';
    const url = `${urlWithoutId}${separator}id=${id}`;

    openPrompts.set(id, { resolve, reject });
    permissionQueue.push({ id, url, width, height, resolve, reject });

    debug(`Queued permission prompt ${id}. Queue size: ${permissionQueue.length}`);
    showNextPermissionPrompt();
  });
}

// Listen for window close events to clean up orphaned prompts
browser.windows.onRemoved.addListener((windowId: number) => {
  for (const [promptId, promptData] of openPrompts.entries()) {
    if (promptData.windowId === windowId) {
      debug(`Prompt window ${windowId} closed without response`);
      cleanupPrompt(promptId, 'closed');
      break;
    }
  }
});

// Listen for tab close events to clean up prompts opened as tab fallback
browser.tabs.onRemoved.addListener((tabId: number) => {
  for (const [promptId, promptData] of openPrompts.entries()) {
    if (promptData.tabId === tabId) {
      debug(`Prompt tab ${tabId} closed without response`);
      cleanupPrompt(promptId, 'closed');
      break;
    }
  }
});

// ==========================================
// Request Deduplication (P1)
// ==========================================

const pendingRequestPromises = new Map<string, Promise<PromptResponse>>();

/**
 * Generate a hash key for request deduplication
 */
function getRequestHash(host: string, method: string, params: any): string {
  if (method === 'signEvent' && params?.kind !== undefined) {
    return `${host}:${method}:kind${params.kind}`;
  }
  if ((method.includes('encrypt') || method.includes('decrypt')) && params?.peerPubkey) {
    return `${host}:${method}:${params.peerPubkey}`;
  }
  return `${host}:${method}`;
}

/**
 * Queue a permission prompt with deduplication
 */
function queuePermissionPromptDeduped(
  host: string,
  method: string,
  params: any,
  urlWithoutId: string,
  width: number,
  height: number
): Promise<PromptResponse> {
  const hash = getRequestHash(host, method, params);

  const existingPromise = pendingRequestPromises.get(hash);
  if (existingPromise) {
    debug(`Deduplicating request: ${hash}`);
    return existingPromise;
  }

  const promise = queuePermissionPrompt(urlWithoutId, width, height)
    .finally(() => {
      pendingRequestPromises.delete(hash);
    });

  pendingRequestPromises.set(hash, promise);
  debug(`New permission request: ${hash}`);

  return promise;
}

browser.runtime.onMessage.addListener(async (message /*, sender*/) => {
  debug('Message received');

  // Handle download request from UI (avoids popup-context download crash in Brave)
  if ((message as { type: string })?.type === 'download-json') {
    const { json, filename } = message as { type: string; json: string; filename: string };
    const dataUrl = 'data:application/json;base64,' + btoa(unescape(encodeURIComponent(json)));
    chrome.downloads.download({ url: dataUrl, filename, saveAs: true });
    return { success: true };
  }

  // Handle text download (for log export)
  if ((message as { type: string })?.type === 'download-text') {
    const { text, filename } = message as { type: string; text: string; filename: string };
    const dataUrl = 'data:text/plain;base64,' + btoa(unescape(encodeURIComponent(text)));
    chrome.downloads.download({ url: dataUrl, filename, saveAs: true });
    return { success: true };
  }

  // Open the import file picker in a new tab
  if ((message as { type: string })?.type === 'open-import') {
    const { action } = message as { type: string; action: string };
    await browser.tabs.create({
      url: browser.runtime.getURL(`import.html?action=${action || 'import'}`),
    });
    return { success: true };
  }

  // Handle direct vault import from import window
  if ((message as { type: string })?.type === 'import-vault-data') {
    try {
      const { vault } = message as { type: string; vault: Record<string, unknown> };
      // Determine storage target based on current sync flow
      const meta = await browser.storage.local.get('syncFlow');
      const syncFlow = (meta as { syncFlow?: number }).syncFlow ?? 0;
      const storage = syncFlow === 1 ? browser.storage.sync : browser.storage.local;
      await storage.set(vault);
      // Reload extension to pick up the new vault
      setTimeout(() => browser.runtime.reload(), 500);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Import failed' };
    }
  }

  // Handle adding a vault snapshot from import window
  if ((message as { type: string })?.type === 'add-vault-snapshot') {
    try {
      const { vault, filename } = message as { type: string; vault: Record<string, unknown>; filename: string };
      const data = await browser.storage.local.get('vaultSnapshots') as { vaultSnapshots?: unknown[] };
      const existing = data.vaultSnapshots ?? [];
      // Check for duplicate filename
      if (existing.some((s) => (s as Record<string, unknown>)['fileName'] === filename)) {
        return { success: false, error: 'A snapshot with this filename already exists.' };
      }
      const snapshot = {
        id: crypto.randomUUID(),
        fileName: filename,
        createdAt: new Date().toISOString(),
        data: vault,
        identityCount: (vault['identities'] as unknown[] | undefined)?.length ?? 0,
        reason: 'manual',
      };
      existing.push(snapshot);
      await browser.storage.local.set({ vaultSnapshots: existing });
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Failed to add snapshot' };
    }
  }

  // Handle pause state change from UI
  if ((message as { type: string; paused: boolean })?.type === 'set-paused') {
    const pausedMsg = message as { type: string; paused: boolean };
    await updateIcon(pausedMsg.paused);
    return { success: true };
  }

  // Handle unlock request from unlock popup
  if ((message as UnlockRequestMessage)?.type === 'unlock-request') {
    const unlockReq = message as UnlockRequestMessage;
    debug('Processing unlock request');
    const result = await handleUnlockRequest(unlockReq.password);
    const response: UnlockResponseMessage = {
      type: 'unlock-response',
      id: unlockReq.id,
      success: result.success,
      error: result.error,
    };

    if (result.success) {
      unlockPopupOpen = false;

      // If "Stay Unlocked" is enabled, persist the derived key for auto-unlock
      try {
        const metaData = await getSignerMetaData();
        if (metaData.stayUnlocked) {
          const session = await getBrowserSessionData();
          if (session) {
            const isV2 = !!session.salt;
            const key = isV2 ? session.vaultKey : session.vaultPassword;
            if (key) {
              await chrome.storage.local.set({
                [PERSISTED_VAULT_KEY_STORAGE]: { key, isV2 },
              });
              debug('Persisted vault key for auto-unlock');
            }
          }
        }
      } catch (e) {
        debug(`Failed to persist vault key: ${e}`);
      }

      // Process any pending NIP-07 requests
      debug(`Processing ${pendingRequests.length} pending requests`);
      while (pendingRequests.length > 0) {
        const pending = pendingRequests.shift()!;
        try {
          const pendingResult = await processNip07Request(pending.request);
          pending.resolve(pendingResult);
        } catch (error) {
          pending.reject(error);
        }
      }
    }

    return response;
  }

  const request = message as BackgroundRequestMessage | PromptResponseMessage;
  debug(request);

  if ((request as PromptResponseMessage)?.id) {
    // Handle prompt response
    const promptResponse = request as PromptResponseMessage;
    const openPrompt = openPrompts.get(promptResponse.id);
    if (!openPrompt) {
      debug('Prompt response could not be matched (may have timed out)');
      return;
    }

    openPrompt.resolve(promptResponse.response);
    cleanupPrompt(promptResponse.id, 'response');
    return;
  }

  const browserSessionData = await getBrowserSessionData();

  if (!browserSessionData) {
    // Vault is locked - open unlock popup and queue the request
    const req = request as BackgroundRequestMessage;
    debug('Vault locked, opening unlock popup');

    if (!unlockPopupOpen) {
      unlockPopupOpen = true;
      try {
        await openUnlockPopup(req.host);
      } catch (error) {
        unlockPopupOpen = false;
        debug(`Failed to open unlock popup: ${error}`);
      }
    }

    // Queue this request to be processed after unlock
    return new Promise((resolve, reject) => {
      pendingRequests.push({ request: req, resolve, reject });
    });
  }

  // Process the request (NIP-07, WebLN, or Nutzap)
  const req = request as BackgroundRequestMessage;
  if (isWeblnMethod(req.method)) {
    return processWeblnRequest(req);
  }
  if (isNutzapMethod(req.method)) {
    return processNutzapRequest(req);
  }
  return processNip07Request(req);
});

/**
 * Process a NIP-07 request after vault is unlocked
 */
async function processNip07Request(req: BackgroundRequestMessage): Promise<any> {
  // Check if signer is paused - silently reject
  if (await isSignerPaused()) {
    return undefined;
  }

  const browserSessionData = await getBrowserSessionData();

  if (!browserSessionData) {
    throw new Error('Plebeian Signer vault not unlocked by the user.');
  }

  const currentIdentity = browserSessionData.identities.find(
    (x) => x.id === browserSessionData.selectedIdentityId
  );

  if (!currentIdentity) {
    throw new Error('No Nostr identity available at endpoint.');
  }

  // Check reckless mode first
  const recklessApprove = await shouldRecklessModeApprove(req.host);
  debug(`recklessApprove result: ${recklessApprove}`);
  if (recklessApprove) {
    debug('Request auto-approved via reckless mode.');
  } else {
    // Normal permission flow
    const permissionState = checkPermissions(
      browserSessionData,
      currentIdentity,
      req.host,
      req.method as Nip07Method,
      req.params
    );
    debug(`permissionState result: ${permissionState}`);

    if (permissionState === false) {
      throw new Error('Permission denied');
    }

    if (permissionState === undefined) {
      // Ask user for permission (queued + deduplicated)
      const width = 375;
      const height = 600;

      const base64Event = Buffer.from(
        JSON.stringify(req.params ?? {}, undefined, 2)
      ).toString('base64');

      // Include queue info for user awareness
      const queueSize = permissionQueue.length;
      const promptUrl = `prompt.html?method=${req.method}&host=${req.host}&nick=${encodeURIComponent(currentIdentity.nick)}&event=${base64Event}&queueSize=${queueSize}`;
      const response = await queuePermissionPromptDeduped(req.host, req.method, req.params, promptUrl, width, height);
      debug(response);

      // Get current permission level to control storage behavior
      const permLevel = await getPermissionLevel();

      // Handle permission storage based on response type
      if (response === 'approve' || response === 'reject') {
        // Store permission for this specific kind (if signEvent) or method
        const policy = response === 'approve' ? 'allow' : 'deny';
        await storePermission(
          browserSessionData,
          currentIdentity,
          req.host,
          req.method,
          policy,
          req.params?.kind,
          permLevel
        );
      } else if (response === 'approve-all') {
        // P2: Store permission for ALL kinds/uses of this method from this host
        await storePermission(
          browserSessionData,
          currentIdentity,
          req.host,
          req.method,
          'allow',
          undefined, // undefined kind = allow all kinds for signEvent
          permLevel
        );
      } else if (response === 'reject-all') {
        // P2: Store deny permission for ALL uses of this method from this host
        await storePermission(
          browserSessionData,
          currentIdentity,
          req.host,
          req.method,
          'deny',
          undefined,
          permLevel
        );
      }

      if (['reject', 'reject-once', 'reject-all'].includes(response)) {
        throw new Error('Permission denied');
      }
    } else {
      debug('Request allowed (via saved permission).');
    }
  }

  const relays: Relays = {};

  switch (req.method) {
    case 'getPublicKey':
      return NostrHelper.pubkeyFromPrivkey(currentIdentity.privkey);

    case 'signEvent':
      return signEvent(req.params, currentIdentity.privkey);

    case 'getRelays':
      browserSessionData.relays.forEach((x) => {
        relays[x.url] = { read: x.read, write: x.write };
      });
      return relays;

    case 'nip04.encrypt':
      return await nip04Encrypt(
        currentIdentity.privkey,
        req.params.peerPubkey,
        req.params.plaintext
      );

    case 'nip44.encrypt':
      return await nip44Encrypt(
        currentIdentity.privkey,
        req.params.peerPubkey,
        req.params.plaintext
      );

    case 'nip04.decrypt':
      return await nip04Decrypt(
        currentIdentity.privkey,
        req.params.peerPubkey,
        req.params.ciphertext
      );

    case 'nip44.decrypt':
      return await nip44Decrypt(
        currentIdentity.privkey,
        req.params.peerPubkey,
        req.params.ciphertext
      );

    default:
      throw new Error(`Not supported request method '${req.method}'.`);
  }
}

/**
 * Process a WebLN request after vault is unlocked
 */
async function processWeblnRequest(req: BackgroundRequestMessage): Promise<any> {
  // Check if signer is paused - silently reject
  if (await isSignerPaused()) {
    return undefined;
  }

  const browserSessionData = await getBrowserSessionData();

  if (!browserSessionData) {
    throw new Error('Plebeian Signer vault not unlocked by the user.');
  }

  const nwcConnections = browserSessionData.nwcConnections ?? [];
  const method = req.method as WeblnMethod;

  // webln.enable just checks if NWC is configured
  if (method === 'webln.enable') {
    if (nwcConnections.length === 0) {
      throw new Error('No wallet configured. Please add an NWC connection in Plebeian Signer settings.');
    }
    debug('WebLN enabled');
    return { enabled: true };  // Return explicit value (undefined gets filtered by content script)
  }

  // All other methods require an NWC connection
  const defaultConnection = nwcConnections[0];
  if (!defaultConnection) {
    throw new Error('No wallet configured. Please add an NWC connection in Plebeian Signer settings.');
  }

  // Check reckless mode (but still prompt for payments)
  const recklessApprove = await shouldRecklessModeApprove(req.host);

  // Check WebLN permissions
  const permissionState = recklessApprove && method !== 'webln.sendPayment' && method !== 'webln.keysend'
    ? true
    : checkWeblnPermissions(browserSessionData, req.host, method);

  if (permissionState === false) {
    throw new Error('Permission denied');
  }

  if (permissionState === undefined) {
    // Ask user for permission (queued + deduplicated)
    const width = 375;
    const height = 600;

    // For sendPayment, include the invoice amount in the prompt data
    let promptParams = req.params ?? {};
    if (method === 'webln.sendPayment' && req.params?.paymentRequest) {
      const amountSats = parseInvoiceAmount(req.params.paymentRequest);
      promptParams = { ...promptParams, amountSats };
    }

    const base64Event = Buffer.from(
      JSON.stringify(promptParams, undefined, 2)
    ).toString('base64');

    // Include queue info for user awareness
    const queueSize = permissionQueue.length;
    const promptUrl = `prompt.html?method=${method}&host=${req.host}&nick=WebLN&event=${base64Event}&queue=${queueSize}`;
    const response = await queuePermissionPromptDeduped(req.host, method, req.params, promptUrl, width, height);

    debug(response);

    // Get current permission level to control storage behavior
    const weblnPermLevel = await getPermissionLevel();

    // Store permission for non-payment methods
    if ((response === 'approve' || response === 'reject') && method !== 'webln.sendPayment' && method !== 'webln.keysend') {
      const policy = response === 'approve' ? 'allow' : 'deny';
      await storePermission(
        browserSessionData,
        null, // WebLN has no identity
        req.host,
        method,
        policy,
        undefined,
        weblnPermLevel
      );
    } else if (response === 'approve-all' && method !== 'webln.sendPayment' && method !== 'webln.keysend') {
      // P2: Store permission for all uses of this WebLN method
      await storePermission(
        browserSessionData,
        null,
        req.host,
        method,
        'allow',
        undefined,
        weblnPermLevel
      );
    }

    if (['reject', 'reject-once', 'reject-all'].includes(response)) {
      throw new Error('Permission denied');
    }
  }

  // Execute the WebLN method
  let result: any;
  const client = await getNwcClient(defaultConnection);

  switch (method) {
    case 'webln.getInfo': {
      const info = await client.getInfo();
      result = {
        node: {
          alias: info.alias,
          pubkey: info.pubkey,
          color: info.color,
        },
      } as GetInfoResponse;
      debug('webln.getInfo result:');
      debug(result);
      return result;
    }

    case 'webln.sendPayment': {
      const invoice = req.params.paymentRequest;
      const payResult = await client.payInvoice({ invoice });
      result = { preimage: payResult.preimage } as SendPaymentResponse;
      debug('webln.sendPayment result:');
      debug(result);
      return result;
    }

    case 'webln.makeInvoice': {
      // Convert sats to millisats (NWC uses millisats)
      const amountSats = typeof req.params.amount === 'string'
        ? parseInt(req.params.amount, 10)
        : req.params.amount ?? req.params.defaultAmount ?? 0;
      const amountMsat = amountSats * 1000;

      const invoiceResult = await client.makeInvoice({
        amount: amountMsat,
        description: req.params.defaultMemo,
      });
      result = { paymentRequest: invoiceResult.invoice } as RequestInvoiceResponse;
      debug('webln.makeInvoice result:');
      debug(result);
      return result;
    }

    case 'webln.keysend':
      throw new Error('keysend is not yet supported');

    default:
      throw new Error(`Not supported WebLN method '${method}'.`);
  }
}

// ==========================================
// Nutzap Request Processing (NIP-61)
// ==========================================

const NUTZAP_QUERY_TIMEOUT_MS = 15000;

/**
 * Query relays with a timeout using SimplePool.
 */
function queryRelaysWithTimeout(pool: SimplePool, relays: string[], filters: any[]): Promise<any[]> {
  return new Promise((resolve) => {
    const events: any[] = [];
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(events);
      }
    }, NUTZAP_QUERY_TIMEOUT_MS);

    const sub = pool.subscribeMany(relays, filters, {
      onevent(event: any) {
        events.push(event);
      },
      oneose() {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          sub.close();
          resolve(events);
        }
      },
    });
  });
}

/**
 * Get relay URLs for a pubkey's NIP-65 read relays.
 * Falls back to FALLBACK_PROFILE_RELAYS if none found.
 */
async function getRecipientReadRelays(pubkey: string): Promise<string[]> {
  const pool = new SimplePool();
  try {
    const events = await queryRelaysWithTimeout(pool, FALLBACK_PROFILE_RELAYS, [{
      kinds: [10002],
      authors: [pubkey],
    }]);

    if (events.length === 0) return FALLBACK_PROFILE_RELAYS;

    const latest = events.reduce((a: any, b: any) =>
      a.created_at > b.created_at ? a : b
    );

    const readRelays = latest.tags
      .filter((t: string[]) => t[0] === 'r' && (t.length === 2 || t[2] === 'read'))
      .map((t: string[]) => t[1]);

    return readRelays.length > 0 ? readRelays : FALLBACK_PROFILE_RELAYS;
  } finally {
    pool.close(FALLBACK_PROFILE_RELAYS);
  }
}

/**
 * Process a Nutzap request after vault is unlocked
 */
async function processNutzapRequest(req: BackgroundRequestMessage): Promise<any> {
  // Check if signer is paused - silently reject
  if (await isSignerPaused()) {
    return undefined;
  }

  const browserSessionData = await getBrowserSessionData();

  if (!browserSessionData) {
    throw new Error('Plebeian Signer vault not unlocked by the user.');
  }

  const currentIdentity = browserSessionData.identities.find(
    (x) => x.id === browserSessionData.selectedIdentityId
  );

  if (!currentIdentity) {
    throw new Error('No Nostr identity available at endpoint.');
  }

  const method = req.method as NutzapMethod;
  const cashuMints = browserSessionData.cashuMints ?? [];

  // Check reckless mode (but still prompt for nutzap.send)
  const recklessApprove = await shouldRecklessModeApprove(req.host);

  // Check permissions
  const permissionState = recklessApprove && method !== 'nutzap.send'
    ? true
    : checkNutzapPermissions(browserSessionData, currentIdentity, req.host, method);

  if (permissionState === false) {
    throw new Error('Permission denied');
  }

  if (permissionState === undefined) {
    const width = 375;
    const height = 600;

    const base64Event = Buffer.from(
      JSON.stringify(req.params ?? {}, undefined, 2)
    ).toString('base64');

    const queueSize = permissionQueue.length;
    const promptUrl = `prompt.html?method=${method}&host=${req.host}&nick=${encodeURIComponent(currentIdentity.nick)}&event=${base64Event}&queueSize=${queueSize}`;
    const response = await queuePermissionPromptDeduped(req.host, method, req.params, promptUrl, width, height);
    debug(response);

    // Get current permission level to control storage behavior
    const nutzapPermLevel = await getPermissionLevel();

    // Store permission for non-send methods
    if ((response === 'approve' || response === 'reject') && method !== 'nutzap.send') {
      const policy = response === 'approve' ? 'allow' : 'deny';
      await storePermission(
        browserSessionData,
        currentIdentity,
        req.host,
        method,
        policy,
        undefined,
        nutzapPermLevel
      );
    } else if (response === 'approve-all' && method !== 'nutzap.send') {
      await storePermission(
        browserSessionData,
        currentIdentity,
        req.host,
        method,
        'allow',
        undefined,
        nutzapPermLevel
      );
    }

    if (['reject', 'reject-once', 'reject-all'].includes(response)) {
      throw new Error('Permission denied');
    }
  }

  switch (method) {
    case 'nutzap.getInfo': {
      // Return the current identity's nutzap info
      let walletPrivkey = currentIdentity.walletPrivkey;
      if (!walletPrivkey) {
        // Auto-generate wallet privkey on first use
        walletPrivkey = generateWalletPrivkey();
        // Note: persisting walletPrivkey to vault requires re-encryption
        // which is handled by the UI/StorageService. For now, return ephemeral info.
        debug('nutzap.getInfo: No wallet privkey, generated ephemeral one');
      }

      const p2pkPubkey = getP2pkPubkey(walletPrivkey);
      const mints = cashuMints.map(m => m.mintUrl);
      const relays = browserSessionData.relays
        .filter(r => r.write)
        .map(r => r.url);

      const result = { pubkey: p2pkPubkey, mints, relays };
      debug('nutzap.getInfo result:');
      debug(result);
      return result;
    }

    case 'nutzap.send': {
      const { recipientPubkey, amount, mintUrl: preferredMint, eventId, comment } = req.params;

      if (!recipientPubkey || !amount || amount <= 0) {
        throw new Error('nutzap.send requires recipientPubkey and a positive amount');
      }

      // 1. Fetch recipient's kind 10019 nutzap info
      const recipientRelays = await getRecipientReadRelays(recipientPubkey);
      const pool = new SimplePool();

      let recipientInfo;
      try {
        const infoEvents = await queryRelaysWithTimeout(pool, recipientRelays, [{
          kinds: [10019],
          authors: [recipientPubkey],
        }]);

        if (infoEvents.length === 0) {
          throw new Error('Recipient has no nutzap info (kind 10019). They may not accept nutzaps.');
        }

        const latest = infoEvents.reduce((a: any, b: any) =>
          a.created_at > b.created_at ? a : b
        );
        recipientInfo = parseNutzapInfoEvent(latest);
      } finally {
        pool.close(recipientRelays);
      }

      if (!recipientInfo.pubkey) {
        throw new Error('Recipient nutzap info has no P2PK pubkey.');
      }

      // 2. Find a shared mint
      let selectedMintUrl = preferredMint;
      if (!selectedMintUrl) {
        const sharedMint = cashuMints.find(m =>
          recipientInfo.mints.includes(m.mintUrl) &&
          m.proofs.reduce((sum, p) => sum + p.amount, 0) >= amount
        );
        if (sharedMint) {
          selectedMintUrl = sharedMint.mintUrl;
        }
      }

      if (!selectedMintUrl) {
        throw new Error('No shared mint with sufficient balance found. Recipient trusts: ' +
          recipientInfo.mints.join(', '));
      }

      if (!recipientInfo.mints.includes(selectedMintUrl)) {
        throw new Error(`Recipient does not trust mint ${selectedMintUrl}`);
      }

      const mintData = cashuMints.find(m => m.mintUrl === selectedMintUrl);
      if (!mintData) {
        throw new Error(`Mint ${selectedMintUrl} not found locally.`);
      }

      const balance = mintData.proofs.reduce((sum, p) => sum + p.amount, 0);
      if (balance < amount) {
        throw new Error(`Insufficient balance on mint ${selectedMintUrl}. Have ${balance} sats, need ${amount} sats.`);
      }

      // 3. P2PK-lock proofs to recipient
      const localProofs: Proof[] = mintData.proofs.map(p => ({
        id: p.id,
        amount: p.amount,
        secret: p.secret,
        C: p.C,
      }));

      const mint = new Mint(selectedMintUrl);
      const wallet = new Wallet(mint, { unit: mintData.unit || 'sat' });
      await wallet.loadMint();

      const p2pkOptions = new P2PKBuilder()
        .addLockPubkey(recipientInfo.pubkey)
        .toOptions();

      const { send, keep } = await wallet.send(amount, localProofs, {}, {
        send: { type: 'p2pk' as const, options: p2pkOptions },
      });

      // 4. Update local proofs in session storage AND vault
      const now = new Date().toISOString();
      const updatedMints = cashuMints.map(m => {
        if (m.id !== mintData.id) return m;
        return {
          ...m,
          proofs: keep.map((p: Proof) => ({
            id: p.id,
            amount: p.amount,
            secret: p.secret,
            C: p.C,
            receivedAt: now,
          })),
          cachedBalance: keep.reduce((sum: number, p: Proof) => sum + p.amount, 0),
          cachedBalanceAt: now,
        };
      });
      await chrome.storage.session.set({ cashuMints: updatedMints });

      // Persist proofs: vault or relay depending on NIP-60 setting
      const signerMeta = await getSignerMetaData();
      const writeRelays = browserSessionData.relays
        .filter(r => r.write)
        .map(r => r.url);
      if (signerMeta.nip60Enabled && writeRelays.length > 0) {
        // Push updated proofs to relays (only if identity has real relays, not fallback)
        const updatedMint = updatedMints.find(m => m.id === mintData.id);
        if (updatedMint && updatedMint.proofs.length > 0) {
          const proofTemplate = buildUnspentProofEvent(
            currentIdentity.privkey,
            selectedMintUrl,
            updatedMint.proofs.map((p: any) => ({ id: p.id, amount: p.amount, secret: p.secret, C: p.C })),
            'sat'
          );
          const proofEvent = signNip60Event(proofTemplate, currentIdentity.privkey);
          await publishToRelaysWithAuth(writeRelays, proofEvent, currentIdentity.privkey);
        }
      } else {
        const syncData = await getBrowserSyncData();
        if (syncData) {
          const encryptedMints = await Promise.all(
            updatedMints.map(m => encryptCashuMintForVault(m, browserSessionData))
          );
          await saveCashuMintsToBrowserSyncStorage(encryptedMints);
        }
      }

      // 5. Build and publish kind 9321 nutzap event
      const nutzapTemplate = buildNutzapEvent(
        { recipientPubkey, amount, mintUrl: selectedMintUrl, eventId, comment },
        send
      );
      const nutzapEvent = signNip60Event(nutzapTemplate, currentIdentity.privkey);

      // Publish to recipient's relays
      await publishToRelaysWithAuth(recipientRelays, nutzapEvent, currentIdentity.privkey);

      const result = { eventId: nutzapEvent.id, amount };
      debug('nutzap.send result:');
      debug(result);
      return result;
    }

    case 'nutzap.redeem': {
      const pubkey = pubkeyFromPrivkey(currentIdentity.privkey);
      const readRelays = browserSessionData.relays
        .filter(r => r.read)
        .map(r => r.url);
      const queryRelays = readRelays.length > 0 ? readRelays : FALLBACK_PROFILE_RELAYS;

      const pool = new SimplePool();
      const redeemed: {
        eventId: string;
        senderPubkey: string;
        amount: number;
        mint: string;
      }[] = [];

      try {
        // 1. Query for nutzaps addressed to us
        const nutzapEvents = await queryRelaysWithTimeout(pool, queryRelays, [{
          kinds: [9321],
          '#p': [pubkey],
        }]);

        if (nutzapEvents.length === 0) {
          return [];
        }

        // 2. Find already-redeemed nutzap IDs
        const historyEvents = await queryRelaysWithTimeout(pool, queryRelays, [{
          kinds: [7376],
          authors: [pubkey],
        }]);

        const redeemedIds = new Set<string>();
        for (const h of historyEvents) {
          for (const tag of h.tags) {
            if (tag[0] === 'e' && tag[3] === 'redeemed') {
              redeemedIds.add(tag[1]);
            }
          }
        }

        // 3. Get trusted mint URLs
        const trustedMintUrls = new Set(cashuMints.map(m => m.mintUrl));

        // Get wallet privkey for P2PK unlocking
        const walletPrivkey = currentIdentity.walletPrivkey;
        if (!walletPrivkey) {
          throw new Error('No wallet private key configured. Please set up NIP-60 wallet first.');
        }

        // 4. Process each unredeemed nutzap
        for (const event of nutzapEvents) {
          if (redeemedIds.has(event.id)) continue;

          try {
            const parsed = parseNutzapEvent(event);

            if (!trustedMintUrls.has(parsed.mint)) {
              debug(`Nutzap from untrusted mint ${parsed.mint}, skipping`);
              continue;
            }

            // Swap P2PK proofs using wallet privkey
            const mint = new Mint(parsed.mint);
            const wallet = new Wallet(mint, { unit: 'sat' });
            await wallet.loadMint();

            const swappedProofs = await wallet.receive(
              { mint: parsed.mint, proofs: parsed.proofs, unit: 'sat' },
              { privkey: walletPrivkey }
            );

            // Store received proofs in session AND vault
            const now = new Date().toISOString();
            const updatedMints = (await getBrowserSessionData())?.cashuMints ?? cashuMints;
            const targetMint = updatedMints.find(m => m.mintUrl === parsed.mint);

            if (targetMint) {
              const newProofs = swappedProofs.map((p: Proof) => ({
                id: p.id,
                amount: p.amount,
                secret: p.secret,
                C: p.C,
                receivedAt: now,
              }));
              targetMint.proofs = [...(targetMint.proofs || []), ...newProofs];
              targetMint.cachedBalance = targetMint.proofs.reduce((sum, p) => sum + p.amount, 0);
              targetMint.cachedBalanceAt = now;
              await chrome.storage.session.set({ cashuMints: updatedMints });

              // Persist proofs: vault or relay depending on NIP-60 setting
              const redeemSignerMeta = await getSignerMetaData();
              const redeemWriteRelays = browserSessionData.relays
                .filter(r => r.write)
                .map(r => r.url);
              if (redeemSignerMeta.nip60Enabled && redeemWriteRelays.length > 0) {
                // Push updated proofs to relays (only if identity has real relays, not fallback)
                if (targetMint.proofs.length > 0) {
                  const proofTemplate = buildUnspentProofEvent(
                    currentIdentity.privkey,
                    parsed.mint,
                    targetMint.proofs.map((p: any) => ({ id: p.id, amount: p.amount, secret: p.secret, C: p.C })),
                    'sat'
                  );
                  const proofEvent = signNip60Event(proofTemplate, currentIdentity.privkey);
                  await publishToRelaysWithAuth(redeemWriteRelays, proofEvent, currentIdentity.privkey);
                }
              } else {
                const latestSession = await getBrowserSessionData();
                if (latestSession) {
                  const syncData = await getBrowserSyncData();
                  if (syncData) {
                    const encryptedMints = await Promise.all(
                      updatedMints.map(m => encryptCashuMintForVault(m, latestSession))
                    );
                    await saveCashuMintsToBrowserSyncStorage(encryptedMints);
                  }
                }
              }
            }

            redeemed.push({
              eventId: event.id,
              senderPubkey: event.pubkey,
              amount: parsed.amount,
              mint: parsed.mint,
            });
          } catch (err) {
            debug(`Failed to redeem nutzap ${event.id}: ${err}`);
          }
        }
      } finally {
        pool.close(queryRelays);
      }

      debug('nutzap.redeem result:');
      debug(redeemed);
      return redeemed;
    }

    default:
      throw new Error(`Not supported Nutzap method '${method}'.`);
  }
}
