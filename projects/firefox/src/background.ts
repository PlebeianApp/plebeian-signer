/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  backgroundLogNip07Action,
  backgroundLogPermissionStored,
  NostrHelper,
  NwcClient,
  NwcConnection_DECRYPTED,
  WeblnMethod,
  Nip07Method,
  GetInfoResponse,
  SendPaymentResponse,
  RequestInvoiceResponse,
} from '@common';
import {
  BackgroundRequestMessage,
  checkPermissions,
  checkWeblnPermissions,
  debug,
  getBrowserSessionData,
  getPosition,
  handleUnlockRequest,
  isWeblnMethod,
  nip04Decrypt,
  nip04Encrypt,
  nip44Decrypt,
  nip44Encrypt,
  openUnlockPopup,
  PromptResponse,
  PromptResponseMessage,
  shouldRecklessModeApprove,
  signEvent,
  storePermission,
  UnlockRequestMessage,
  UnlockResponseMessage,
} from './background-common';
import browser from 'webextension-polyfill';
import { Buffer } from 'buffer';

// Cache for NWC clients to avoid reconnecting for each request
const nwcClientCache = new Map<string, NwcClient>();

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

// Track open prompts with metadata for cleanup
const openPrompts = new Map<
  string,
  {
    resolve: (response: PromptResponse) => void;
    reject: (reason?: any) => void;
    windowId?: number;
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
 * Show the next permission prompt from the queue
 */
async function showNextPermissionPrompt(): Promise<void> {
  if (activePromptId || permissionQueue.length === 0) {
    return;
  }

  const next = permissionQueue[0];
  activePromptId = next.id;

  const { top, left } = await getPosition(next.width, next.height);

  try {
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
  } catch (error) {
    debug(`Failed to create prompt window: ${error}`);
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
      await openUnlockPopup(req.host);
    }

    // Queue this request to be processed after unlock
    return new Promise((resolve, reject) => {
      pendingRequests.push({ request: req, resolve, reject });
    });
  }

  // Process the request (NIP-07 or WebLN)
  const req = request as BackgroundRequestMessage;
  if (isWeblnMethod(req.method)) {
    return processWeblnRequest(req);
  }
  return processNip07Request(req);
});

/**
 * Process a NIP-07 request after vault is unlocked
 */
async function processNip07Request(req: BackgroundRequestMessage): Promise<any> {
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
      const promptUrl = `prompt.html?method=${req.method}&host=${req.host}&nick=${encodeURIComponent(currentIdentity.nick)}&event=${base64Event}&queue=${queueSize}`;
      const response = await queuePermissionPromptDeduped(req.host, req.method, req.params, promptUrl, width, height);
      debug(response);

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
          req.params?.kind
        );
        await backgroundLogPermissionStored(req.host, req.method, policy, req.params?.kind);
      } else if (response === 'approve-all') {
        // P2: Store permission for ALL kinds/uses of this method from this host
        await storePermission(
          browserSessionData,
          currentIdentity,
          req.host,
          req.method,
          'allow',
          undefined // undefined kind = allow all kinds for signEvent
        );
        await backgroundLogPermissionStored(req.host, req.method, 'allow', undefined);
        debug(`Stored approve-all permission for ${req.method} from ${req.host}`);
      } else if (response === 'reject-all') {
        // P2: Store deny permission for ALL uses of this method from this host
        await storePermission(
          browserSessionData,
          currentIdentity,
          req.host,
          req.method,
          'deny',
          undefined
        );
        await backgroundLogPermissionStored(req.host, req.method, 'deny', undefined);
        debug(`Stored reject-all permission for ${req.method} from ${req.host}`);
      }

      if (['reject', 'reject-once', 'reject-all'].includes(response)) {
        await backgroundLogNip07Action(req.method, req.host, false, false, {
          kind: req.params?.kind,
          peerPubkey: req.params?.peerPubkey,
        });
        throw new Error('Permission denied');
      }
    } else {
      debug('Request allowed (via saved permission).');
    }
  }

  const relays: Relays = {};
  let result: any;

  switch (req.method) {
    case 'getPublicKey':
      result = NostrHelper.pubkeyFromPrivkey(currentIdentity.privkey);
      await backgroundLogNip07Action(req.method, req.host, true, recklessApprove);
      return result;

    case 'signEvent':
      result = signEvent(req.params, currentIdentity.privkey);
      await backgroundLogNip07Action(req.method, req.host, true, recklessApprove, {
        kind: req.params?.kind,
      });
      return result;

    case 'getRelays':
      browserSessionData.relays.forEach((x) => {
        relays[x.url] = { read: x.read, write: x.write };
      });
      await backgroundLogNip07Action(req.method, req.host, true, recklessApprove);
      return relays;

    case 'nip04.encrypt':
      result = await nip04Encrypt(
        currentIdentity.privkey,
        req.params.peerPubkey,
        req.params.plaintext
      );
      await backgroundLogNip07Action(req.method, req.host, true, recklessApprove, {
        peerPubkey: req.params.peerPubkey,
      });
      return result;

    case 'nip44.encrypt':
      result = await nip44Encrypt(
        currentIdentity.privkey,
        req.params.peerPubkey,
        req.params.plaintext
      );
      await backgroundLogNip07Action(req.method, req.host, true, recklessApprove, {
        peerPubkey: req.params.peerPubkey,
      });
      return result;

    case 'nip04.decrypt':
      result = await nip04Decrypt(
        currentIdentity.privkey,
        req.params.peerPubkey,
        req.params.ciphertext
      );
      await backgroundLogNip07Action(req.method, req.host, true, recklessApprove, {
        peerPubkey: req.params.peerPubkey,
      });
      return result;

    case 'nip44.decrypt':
      result = await nip44Decrypt(
        currentIdentity.privkey,
        req.params.peerPubkey,
        req.params.ciphertext
      );
      await backgroundLogNip07Action(req.method, req.host, true, recklessApprove, {
        peerPubkey: req.params.peerPubkey,
      });
      return result;

    default:
      throw new Error(`Not supported request method '${req.method}'.`);
  }
}

/**
 * Process a WebLN request after vault is unlocked
 */
async function processWeblnRequest(req: BackgroundRequestMessage): Promise<any> {
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

    // Store permission for non-payment methods
    if ((response === 'approve' || response === 'reject') && method !== 'webln.sendPayment' && method !== 'webln.keysend') {
      const policy = response === 'approve' ? 'allow' : 'deny';
      await storePermission(
        browserSessionData,
        null, // WebLN has no identity
        req.host,
        method,
        policy
      );
      await backgroundLogPermissionStored(req.host, method, policy);
    } else if (response === 'approve-all' && method !== 'webln.sendPayment' && method !== 'webln.keysend') {
      // P2: Store permission for all uses of this WebLN method
      await storePermission(
        browserSessionData,
        null,
        req.host,
        method,
        'allow'
      );
      await backgroundLogPermissionStored(req.host, method, 'allow');
      debug(`Stored approve-all permission for ${method} from ${req.host}`);
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
