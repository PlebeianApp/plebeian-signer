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

const openPrompts = new Map<
  string,
  {
    resolve: (response: PromptResponse) => void;
    reject: (reason?: any) => void;
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
      throw new Error(
        'Prompt response could not be matched to any previous request.'
      );
    }

    openPrompt.resolve(promptResponse.response);
    openPrompts.delete(promptResponse.id);
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
      // Ask user for permission.
      const width = 375;
      const height = 600;
      const { top, left } = await getPosition(width, height);

      const base64Event = Buffer.from(
        JSON.stringify(req.params ?? {}, undefined, 2)
      ).toString('base64');

      const response = await new Promise<PromptResponse>((resolve, reject) => {
        const id = crypto.randomUUID();
        openPrompts.set(id, { resolve, reject });
        browser.windows.create({
          type: 'popup',
          url: `prompt.html?method=${req.method}&host=${req.host}&id=${id}&nick=${currentIdentity.nick}&event=${base64Event}`,
          height,
          width,
          top,
          left,
        });
      });
      debug(response);
      if (response === 'approve' || response === 'reject') {
        const policy = response === 'approve' ? 'allow' : 'deny';
        await storePermission(
          browserSessionData,
          currentIdentity,
          req.host,
          req.method,
          policy,
          req.params?.kind
        );
        await backgroundLogPermissionStored(
          req.host,
          req.method,
          policy,
          req.params?.kind
        );
      }

      if (['reject', 'reject-once'].includes(response)) {
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
    // Ask user for permission
    const width = 375;
    const height = 600;
    const { top, left } = await getPosition(width, height);

    // For sendPayment, include the invoice amount in the prompt data
    let promptParams = req.params ?? {};
    if (method === 'webln.sendPayment' && req.params?.paymentRequest) {
      const amountSats = parseInvoiceAmount(req.params.paymentRequest);
      promptParams = { ...promptParams, amountSats };
    }

    const base64Event = Buffer.from(
      JSON.stringify(promptParams, undefined, 2)
    ).toString('base64');

    const response = await new Promise<PromptResponse>((resolve, reject) => {
      const id = crypto.randomUUID();
      openPrompts.set(id, { resolve, reject });
      browser.windows.create({
        type: 'popup',
        url: `prompt.html?method=${method}&host=${req.host}&id=${id}&nick=WebLN&event=${base64Event}`,
        height,
        width,
        top,
        left,
      });
    });

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
    }

    if (['reject', 'reject-once'].includes(response)) {
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
