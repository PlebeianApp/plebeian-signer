import browser from 'webextension-polyfill';
import { BackgroundRequestMessage } from './background-common';

// Inject the script that will provide window.nostr
// The script needs to run before any other scripts from the real
// page run (and maybe check for window.nostr).
const script = document.createElement('script');
script.setAttribute('async', 'false');
script.setAttribute('type', 'text/javascript');
script.setAttribute('src', browser.runtime.getURL('plebian-signer-extension.js'));
(document.head || document.documentElement).appendChild(script);

// Maximum retries for sending messages to the background service worker.
// Handles "Extension context invalidated" errors that occur when the
// service worker restarts or the extension is updated.
const MAX_SEND_RETRIES = 3;
const SEND_RETRY_DELAY_MS = 500;

/**
 * Send a message to the background with retry logic.
 * Retries on "Extension context invalidated" and similar transient errors.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendMessageWithRetry(request: BackgroundRequestMessage): Promise<any> {
  for (let attempt = 0; attempt < MAX_SEND_RETRIES; attempt++) {
    try {
      return await browser.runtime.sendMessage(request);
    } catch (error: unknown) {
      const errorMsg = (error instanceof Error ? error.message : undefined) || String(error);
      const isTransient =
        errorMsg.includes('Extension context invalidated') ||
        errorMsg.includes('Could not establish connection') ||
        errorMsg.includes('Receiving end does not exist');

      if (isTransient && attempt < MAX_SEND_RETRIES - 1) {
        await new Promise(r => setTimeout(r, SEND_RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
}

// listen for messages from that script
window.addEventListener('message', async (message) => {
  // We will also receive our own messages, that we sent.
  // We have to ignore them (they will not have a params field).

  if (message.source !== window) return;
  if (!message.data) return;
  if (!message.data.params) return;
  if (message.data.ext !== 'plebian-signer') return;

  // pass on to background
  let response;
  try {
    const request: BackgroundRequestMessage = {
      method: message.data.method,
      params: message.data.params,
      host: location.host,
    };

    response = await sendMessageWithRetry(request);
  } catch (error) {
    response = { error };
  }

  // return response
  window.postMessage(
    { id: message.data.id, ext: 'plebian-signer', response },
    message.origin
  );
});
