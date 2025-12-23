import browser from 'webextension-polyfill';
import { ExtensionMethod } from '@common';
import { PromptResponse, PromptResponseMessage } from './background-common';

/**
 * Decode base64 string to UTF-8 using native browser APIs.
 * This avoids race conditions with the Buffer polyfill initialization.
 */
function base64ToUtf8(base64: string): string {
  const binaryString = atob(base64);
  const bytes = Uint8Array.from(binaryString, char => char.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

const params = new URLSearchParams(location.search);
const id = params.get('id') as string;
const method = params.get('method') as ExtensionMethod;
const host = params.get('host') as string;
const nick = params.get('nick') as string;

let event = '{}';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let eventParsed: any = {};
try {
  event = base64ToUtf8(params.get('event') as string);
  eventParsed = JSON.parse(event);
} catch (e) {
  console.error('Failed to parse event:', e);
}

let title = '';
switch (method) {
  case 'getPublicKey':
    title = 'Get Public Key';
    break;

  case 'signEvent':
    title = 'Sign Event';
    break;

  case 'nip04.encrypt':
    title = 'Encrypt';
    break;

  case 'nip44.encrypt':
    title = 'Encrypt';
    break;

  case 'nip04.decrypt':
    title = 'Decrypt';
    break;

  case 'nip44.decrypt':
    title = 'Decrypt';
    break;

  case 'getRelays':
    title = 'Get Relays';
    break;

  case 'webln.enable':
    title = 'Enable WebLN';
    break;

  case 'webln.getInfo':
    title = 'Wallet Info';
    break;

  case 'webln.sendPayment':
    title = 'Send Payment';
    break;

  case 'webln.makeInvoice':
    title = 'Create Invoice';
    break;

  case 'webln.keysend':
    title = 'Keysend Payment';
    break;

  default:
    break;
}

const titleSpanElement = document.getElementById('titleSpan');
if (titleSpanElement) {
  titleSpanElement.innerText = title;
}

Array.from(document.getElementsByClassName('nick-INSERT')).forEach(
  (element) => {
    (element as HTMLElement).innerText = nick;
  }
);

Array.from(document.getElementsByClassName('host-INSERT')).forEach(
  (element) => {
    (element as HTMLElement).innerText = host;
  }
);

const kindSpanElement = document.getElementById('kindSpan');
if (kindSpanElement && eventParsed.kind !== undefined) {
  kindSpanElement.innerText = eventParsed.kind;
}

const cardGetPublicKeyElement = document.getElementById('cardGetPublicKey');
if (cardGetPublicKeyElement) {
  if (method === 'getPublicKey') {
    // Do nothing.
  } else {
    cardGetPublicKeyElement.style.display = 'none';
  }
}

const cardGetRelaysElement = document.getElementById('cardGetRelays');
if (cardGetRelaysElement) {
  if (method === 'getRelays') {
    // Do nothing.
  } else {
    cardGetRelaysElement.style.display = 'none';
  }
}

const cardSignEventElement = document.getElementById('cardSignEvent');
const card2SignEventElement = document.getElementById('card2SignEvent');
if (cardSignEventElement && card2SignEventElement) {
  if (method === 'signEvent') {
    const card2SignEvent_jsonElement = document.getElementById(
      'card2SignEvent_json'
    );
    if (card2SignEvent_jsonElement) {
      card2SignEvent_jsonElement.innerText = event;
    }
  } else {
    cardSignEventElement.style.display = 'none';
    card2SignEventElement.style.display = 'none';
  }
}

const cardNip04EncryptElement = document.getElementById('cardNip04Encrypt');
const card2Nip04EncryptElement = document.getElementById('card2Nip04Encrypt');
if (cardNip04EncryptElement && card2Nip04EncryptElement) {
  if (method === 'nip04.encrypt') {
    const card2Nip04Encrypt_textElement = document.getElementById(
      'card2Nip04Encrypt_text'
    );
    if (card2Nip04Encrypt_textElement) {
      const eventObject = eventParsed as { peerPubkey: string; plaintext: string };
      card2Nip04Encrypt_textElement.innerText = eventObject.plaintext || '';
    }
  } else {
    cardNip04EncryptElement.style.display = 'none';
    card2Nip04EncryptElement.style.display = 'none';
  }
}

const cardNip44EncryptElement = document.getElementById('cardNip44Encrypt');
const card2Nip44EncryptElement = document.getElementById('card2Nip44Encrypt');
if (cardNip44EncryptElement && card2Nip44EncryptElement) {
  if (method === 'nip44.encrypt') {
    const card2Nip44Encrypt_textElement = document.getElementById(
      'card2Nip44Encrypt_text'
    );
    if (card2Nip44Encrypt_textElement) {
      const eventObject = eventParsed as { peerPubkey: string; plaintext: string };
      card2Nip44Encrypt_textElement.innerText = eventObject.plaintext || '';
    }
  } else {
    cardNip44EncryptElement.style.display = 'none';
    card2Nip44EncryptElement.style.display = 'none';
  }
}

const cardNip04DecryptElement = document.getElementById('cardNip04Decrypt');
const card2Nip04DecryptElement = document.getElementById('card2Nip04Decrypt');
if (cardNip04DecryptElement && card2Nip04DecryptElement) {
  if (method === 'nip04.decrypt') {
    const card2Nip04Decrypt_textElement = document.getElementById(
      'card2Nip04Decrypt_text'
    );
    if (card2Nip04Decrypt_textElement) {
      const eventObject = eventParsed as { peerPubkey: string; ciphertext: string };
      card2Nip04Decrypt_textElement.innerText = eventObject.ciphertext || '';
    }
  } else {
    cardNip04DecryptElement.style.display = 'none';
    card2Nip04DecryptElement.style.display = 'none';
  }
}

const cardNip44DecryptElement = document.getElementById('cardNip44Decrypt');
const card2Nip44DecryptElement = document.getElementById('card2Nip44Decrypt');
if (cardNip44DecryptElement && card2Nip44DecryptElement) {
  if (method === 'nip44.decrypt') {
    const card2Nip44Decrypt_textElement = document.getElementById(
      'card2Nip44Decrypt_text'
    );
    if (card2Nip44Decrypt_textElement) {
      const eventObject = eventParsed as { peerPubkey: string; ciphertext: string };
      card2Nip44Decrypt_textElement.innerText = eventObject.ciphertext || '';
    }
  } else {
    cardNip44DecryptElement.style.display = 'none';
    card2Nip44DecryptElement.style.display = 'none';
  }
}

// WebLN card visibility
const cardWeblnEnableElement = document.getElementById('cardWeblnEnable');
if (cardWeblnEnableElement) {
  if (method !== 'webln.enable') {
    cardWeblnEnableElement.style.display = 'none';
  }
}

const cardWeblnGetInfoElement = document.getElementById('cardWeblnGetInfo');
if (cardWeblnGetInfoElement) {
  if (method !== 'webln.getInfo') {
    cardWeblnGetInfoElement.style.display = 'none';
  }
}

const cardWeblnSendPaymentElement = document.getElementById('cardWeblnSendPayment');
const card2WeblnSendPaymentElement = document.getElementById('card2WeblnSendPayment');
if (cardWeblnSendPaymentElement && card2WeblnSendPaymentElement) {
  if (method === 'webln.sendPayment') {
    // Display amount in sats
    const paymentAmountSpan = document.getElementById('paymentAmountSpan');
    if (paymentAmountSpan && eventParsed.amountSats !== undefined) {
      paymentAmountSpan.innerText = `${eventParsed.amountSats.toLocaleString()} sats`;
    } else if (paymentAmountSpan) {
      paymentAmountSpan.innerText = 'unknown amount';
    }
    // Show invoice in json card
    const card2WeblnSendPayment_jsonElement = document.getElementById('card2WeblnSendPayment_json');
    if (card2WeblnSendPayment_jsonElement && eventParsed.paymentRequest) {
      card2WeblnSendPayment_jsonElement.innerText = eventParsed.paymentRequest;
    }
  } else {
    cardWeblnSendPaymentElement.style.display = 'none';
    card2WeblnSendPaymentElement.style.display = 'none';
  }
}

const cardWeblnMakeInvoiceElement = document.getElementById('cardWeblnMakeInvoice');
if (cardWeblnMakeInvoiceElement) {
  if (method === 'webln.makeInvoice') {
    const invoiceAmountSpan = document.getElementById('invoiceAmountSpan');
    if (invoiceAmountSpan) {
      const amount = eventParsed.amount ?? eventParsed.defaultAmount;
      if (amount) {
        invoiceAmountSpan.innerText = ` for ${Number(amount).toLocaleString()} sats`;
      }
    }
  } else {
    cardWeblnMakeInvoiceElement.style.display = 'none';
  }
}

const cardWeblnKeysendElement = document.getElementById('cardWeblnKeysend');
if (cardWeblnKeysendElement) {
  if (method !== 'webln.keysend') {
    cardWeblnKeysendElement.style.display = 'none';
  }
}

//
// Functions
//

async function deliver(response: PromptResponse) {
  const message: PromptResponseMessage = {
    id,
    response,
  };

  try {
    await browser.runtime.sendMessage(message);
  } catch (error) {
    console.error('Failed to send message:', error);
  }
  window.close();
}

document.addEventListener('DOMContentLoaded', function () {
  const rejectOnceButton = document.getElementById('rejectOnceButton');
  rejectOnceButton?.addEventListener('click', () => {
    deliver('reject-once');
  });

  const rejectAlwaysButton = document.getElementById('rejectAlwaysButton');
  rejectAlwaysButton?.addEventListener('click', () => {
    deliver('reject');
  });

  const approveOnceButton = document.getElementById('approveOnceButton');
  approveOnceButton?.addEventListener('click', () => {
    deliver('approve-once');
  });

  const approveAlwaysButton = document.getElementById('approveAlwaysButton');
  approveAlwaysButton?.addEventListener('click', () => {
    deliver('approve');
  });
});
