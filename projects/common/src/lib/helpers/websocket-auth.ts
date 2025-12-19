/**
 * NIP-42 Relay Authentication
 *
 * Handles WebSocket connections to relays that require authentication.
 * When a relay sends an AUTH challenge, this module signs the challenge
 * and authenticates before proceeding with event publishing.
 */

import { finalizeEvent, getPublicKey } from 'nostr-tools';

export interface AuthenticatedRelayConnection {
  ws: WebSocket;
  url: string;
  authenticated: boolean;
  pubkey: string;
}

export interface PublishResult {
  relay: string;
  success: boolean;
  message: string;
}

/**
 * Create a NIP-42 authentication event (kind 22242)
 */
function createAuthEvent(
  relayUrl: string,
  challenge: string,
  privateKeyHex: string
): ReturnType<typeof finalizeEvent> {
  const unsignedEvent = {
    kind: 22242,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['relay', relayUrl],
      ['challenge', challenge],
    ],
    content: '',
  };

  // Convert hex private key to Uint8Array
  const privkeyBytes = hexToBytes(privateKeyHex);
  return finalizeEvent(unsignedEvent, privkeyBytes);
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Connect to a relay with NIP-42 authentication support
 *
 * @param relayUrl - The relay WebSocket URL (e.g., wss://relay.example.com)
 * @param privateKeyHex - The private key in hex format for signing
 * @param timeoutMs - Connection and authentication timeout in milliseconds
 * @returns Promise resolving to authenticated connection or null if failed
 */
export async function connectWithAuth(
  relayUrl: string,
  privateKeyHex: string,
  timeoutMs = 10000
): Promise<AuthenticatedRelayConnection | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      ws.close();
      resolve(null);
    }, timeoutMs);

    const ws = new WebSocket(relayUrl);
    const pubkey = getPublicKey(hexToBytes(privateKeyHex));

    ws.onopen = () => {
      // Connection open, wait for AUTH challenge or proceed directly
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const messageType = message[0];

        if (messageType === 'AUTH') {
          // Relay sent an auth challenge
          const challenge = message[1];
          const authEvent = createAuthEvent(relayUrl, challenge, privateKeyHex);

          // Send AUTH response
          ws.send(JSON.stringify(['AUTH', authEvent]));
        } else if (messageType === 'OK') {
          // Check if this is the AUTH response
          const success = message[2];
          const msg = message[3] || '';

          if (success) {
            clearTimeout(timeout);
            resolve({
              ws,
              url: relayUrl,
              authenticated: true,
              pubkey,
            });
          } else {
            console.error(`Auth failed for ${relayUrl}: ${msg}`);
            clearTimeout(timeout);
            ws.close();
            resolve(null);
          }
        } else if (messageType === 'NOTICE') {
          // Some relays don't require auth - connection is ready
          clearTimeout(timeout);
          resolve({
            ws,
            url: relayUrl,
            authenticated: false,
            pubkey,
          });
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      resolve(null);
    };

    ws.onclose = () => {
      clearTimeout(timeout);
    };

    // For relays that don't send AUTH challenge, resolve after short delay
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        clearTimeout(timeout);
        resolve({
          ws,
          url: relayUrl,
          authenticated: false, // No auth was required
          pubkey,
        });
      }
    }, 2000); // Wait 2 seconds for potential AUTH challenge
  });
}

/**
 * Publish an event to a relay with NIP-42 authentication support
 *
 * This function handles the complete flow:
 * 1. Connect to relay
 * 2. Handle AUTH challenge if sent
 * 3. Publish the event
 * 4. Wait for OK response
 * 5. Close connection
 *
 * @param relayUrl - The relay WebSocket URL
 * @param signedEvent - The already-signed Nostr event to publish
 * @param privateKeyHex - Private key for AUTH (if required)
 * @param timeoutMs - Timeout for the entire operation
 * @returns Promise resolving to publish result
 */
export async function publishEventWithAuth(
  relayUrl: string,
  signedEvent: ReturnType<typeof finalizeEvent>,
  privateKeyHex: string,
  timeoutMs = 15000
): Promise<PublishResult> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      resolve({
        relay: relayUrl,
        success: false,
        message: 'Timeout',
      });
    }, timeoutMs);

    let ws: WebSocket;
    let authenticated = false;
    let eventSent = false;

    try {
      ws = new WebSocket(relayUrl);
    } catch (e) {
      clearTimeout(timeout);
      resolve({
        relay: relayUrl,
        success: false,
        message: `Connection failed: ${e}`,
      });
      return;
    }

    const sendEvent = () => {
      if (!eventSent && ws.readyState === WebSocket.OPEN) {
        eventSent = true;
        ws.send(JSON.stringify(['EVENT', signedEvent]));
      }
    };

    ws.onopen = () => {
      // Wait a moment for potential AUTH challenge before sending event
      setTimeout(() => {
        if (!authenticated) {
          // No auth challenge received, try sending event directly
          sendEvent();
        }
      }, 500);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const messageType = message[0];

        if (messageType === 'AUTH') {
          // Relay requires authentication
          const challenge = message[1];
          const authEvent = createAuthEvent(relayUrl, challenge, privateKeyHex);
          ws.send(JSON.stringify(['AUTH', authEvent]));
          authenticated = true;
        } else if (messageType === 'OK') {
          const eventId = message[1];
          const success = message[2];
          const msg = message[3] || '';

          // Check if this is our event or AUTH response
          if (eventId === signedEvent.id) {
            // This is the response to our published event
            clearTimeout(timeout);
            ws.close();

            if (success) {
              resolve({
                relay: relayUrl,
                success: true,
                message: 'Published successfully',
              });
            } else {
              // Check if we need to retry after auth
              if (msg.includes('auth-required') && !authenticated) {
                // Relay requires auth but didn't send challenge
                // This shouldn't normally happen
                resolve({
                  relay: relayUrl,
                  success: false,
                  message: 'Auth required but no challenge received',
                });
              } else {
                resolve({
                  relay: relayUrl,
                  success: false,
                  message: msg || 'Publish rejected',
                });
              }
            }
          } else if (authenticated && !eventSent) {
            // This is the OK response to our AUTH
            if (success) {
              // Auth succeeded, now send the event
              sendEvent();
            } else {
              clearTimeout(timeout);
              ws.close();
              resolve({
                relay: relayUrl,
                success: false,
                message: `Authentication failed: ${msg}`,
              });
            }
          }
        } else if (messageType === 'NOTICE') {
          // Log notices but don't fail
          console.log(`Relay ${relayUrl} notice: ${message[1]}`);
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      resolve({
        relay: relayUrl,
        success: false,
        message: 'Connection error',
      });
    };

    ws.onclose = () => {
      // If we haven't resolved yet, treat as failure
      clearTimeout(timeout);
    };
  });
}

/**
 * Publish an event to multiple relays with NIP-42 support
 *
 * @param relayUrls - Array of relay WebSocket URLs
 * @param signedEvent - The already-signed Nostr event to publish
 * @param privateKeyHex - Private key for AUTH (if required)
 * @returns Promise resolving to array of publish results
 */
export async function publishToRelaysWithAuth(
  relayUrls: string[],
  signedEvent: ReturnType<typeof finalizeEvent>,
  privateKeyHex: string
): Promise<PublishResult[]> {
  const results = await Promise.all(
    relayUrls.map((url) => publishEventWithAuth(url, signedEvent, privateKeyHex))
  );
  return results;
}
