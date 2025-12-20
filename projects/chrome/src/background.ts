/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  backgroundLogNip07Action,
  backgroundLogPermissionStored,
  NostrHelper,
} from '@common';
import {
  BackgroundRequestMessage,
  checkPermissions,
  debug,
  getBrowserSessionData,
  getPosition,
  nip04Decrypt,
  nip04Encrypt,
  nip44Decrypt,
  nip44Encrypt,
  PromptResponse,
  PromptResponseMessage,
  shouldRecklessModeApprove,
  signEvent,
  storePermission,
} from './background-common';
import browser from 'webextension-polyfill';
import { Buffer } from 'buffer';

type Relays = Record<string, { read: boolean; write: boolean }>;

const openPrompts = new Map<
  string,
  {
    resolve: (response: PromptResponse) => void;
    reject: (reason?: any) => void;
  }
>();

browser.runtime.onMessage.addListener(async (message /*, sender*/) => {
  debug('Message received');
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
    throw new Error('Plebeian Signer vault not unlocked by the user.');
  }

  const currentIdentity = browserSessionData.identities.find(
    (x) => x.id === browserSessionData.selectedIdentityId
  );

  if (!currentIdentity) {
    throw new Error('No Nostr identity available at endpoint.');
  }

  const req = request as BackgroundRequestMessage;

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
      req.method,
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
});
