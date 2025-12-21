/* eslint-disable @typescript-eslint/no-explicit-any */
import { NostrHelper } from '@common';
import { finalizeEvent, nip04, nip44, getPublicKey } from 'nostr-tools';
import {
  NwcRequest,
  NwcResponse,
  NwcGetBalanceResult,
  NwcGetInfoResult,
  NwcPayInvoiceParams,
  NwcPayInvoiceResult,
  NwcMakeInvoiceParams,
  NwcMakeInvoiceResult,
  NwcListTransactionsParams,
  NwcListTransactionsResult,
  NWC_METHODS,
} from './types';

export interface NwcConnectionData {
  walletPubkey: string;
  relayUrl: string;
  secret: string;
}

export type NwcLogLevel = 'info' | 'warn' | 'error';
export type NwcLogCallback = (level: NwcLogLevel, message: string) => void;

interface PendingRequest {
  resolve: (value: NwcResponse) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  request: NwcRequest;
  isRetry: boolean;
}

type EncryptionMode = 'nip44' | 'nip04';

/**
 * NWC Client for communicating with NIP-47 wallet services
 */
export class NwcClient {
  private ws: WebSocket | null = null;
  private connected = false;
  private pendingRequests = new Map<string, PendingRequest>();
  private subscriptionId: string | null = null;
  private conversationKey: Uint8Array;
  private clientPubkey: string;
  private encryptionMode: EncryptionMode = 'nip44';
  private logCallback: NwcLogCallback | null = null;

  constructor(
    private connectionData: NwcConnectionData,
    logCallback?: NwcLogCallback
  ) {
    this.logCallback = logCallback ?? null;
    // Derive the conversation key for NIP-44 encryption
    this.conversationKey = nip44.v2.utils.getConversationKey(
      NostrHelper.hex2bytes(connectionData.secret),
      connectionData.walletPubkey
    );
    // Derive our public key from the secret
    this.clientPubkey = getPublicKey(
      NostrHelper.hex2bytes(connectionData.secret)
    );
  }

  private log(level: NwcLogLevel, message: string): void {
    if (this.logCallback) {
      this.logCallback(level, message);
    }
  }

  /**
   * Connect to the NWC relay
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.log('info', `Connecting to ${this.connectionData.relayUrl}...`);
        this.ws = new WebSocket(this.connectionData.relayUrl);

        const timeout = setTimeout(() => {
          this.log('error', 'Connection timeout');
          reject(new Error('Connection timeout'));
          this.disconnect();
        }, 10000);

        this.ws.onopen = () => {
          clearTimeout(timeout);
          this.connected = true;
          this.log('info', 'Connected to relay');
          this.subscribe();
          resolve();
        };

        this.ws.onerror = () => {
          clearTimeout(timeout);
          this.log('error', 'WebSocket error');
          reject(new Error('WebSocket error'));
        };

        this.ws.onclose = () => {
          this.connected = false;
          this.subscriptionId = null;
          // Reject all pending requests
          for (const [, pending] of this.pendingRequests) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('Connection closed'));
          }
          this.pendingRequests.clear();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the relay
   */
  disconnect(): void {
    if (this.ws) {
      if (this.subscriptionId) {
        this.ws.send(JSON.stringify(['CLOSE', this.subscriptionId]));
      }
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.subscriptionId = null;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get wallet info
   */
  async getInfo(): Promise<NwcGetInfoResult> {
    const response = await this.sendRequest({
      method: NWC_METHODS.GET_INFO,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.result as unknown as NwcGetInfoResult;
  }

  /**
   * Get wallet balance
   */
  async getBalance(): Promise<NwcGetBalanceResult> {
    const response = await this.sendRequest({
      method: NWC_METHODS.GET_BALANCE,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.result as unknown as NwcGetBalanceResult;
  }

  /**
   * Pay a Lightning invoice
   */
  async payInvoice(params: NwcPayInvoiceParams): Promise<NwcPayInvoiceResult> {
    const response = await this.sendRequest({
      method: NWC_METHODS.PAY_INVOICE,
      params: params as unknown as Record<string, unknown>,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.result as unknown as NwcPayInvoiceResult;
  }

  /**
   * Create a Lightning invoice
   */
  async makeInvoice(
    params: NwcMakeInvoiceParams
  ): Promise<NwcMakeInvoiceResult> {
    const response = await this.sendRequest({
      method: NWC_METHODS.MAKE_INVOICE,
      params: params as unknown as Record<string, unknown>,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.result as unknown as NwcMakeInvoiceResult;
  }

  /**
   * List transaction history
   */
  async listTransactions(
    params?: NwcListTransactionsParams
  ): Promise<NwcListTransactionsResult> {
    const response = await this.sendRequest({
      method: NWC_METHODS.LIST_TRANSACTIONS,
      params: params as unknown as Record<string, unknown>,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.result as unknown as NwcListTransactionsResult;
  }

  /**
   * Encrypt content using current encryption mode
   */
  private async encryptContent(plaintext: string): Promise<string> {
    if (this.encryptionMode === 'nip04') {
      return nip04.encrypt(
        this.connectionData.secret,
        this.connectionData.walletPubkey,
        plaintext
      );
    } else {
      return nip44.v2.encrypt(plaintext, this.conversationKey);
    }
  }

  /**
   * Send a request to the wallet
   */
  private async sendRequest(
    request: NwcRequest,
    timeoutMs = 30000,
    isRetry = false
  ): Promise<NwcResponse> {
    if (!this.isConnected()) {
      await this.connect();
    }

    // Encrypt the request content
    const plaintext = JSON.stringify(request);
    this.log(
      'info',
      `Sending ${request.method} request (using ${this.encryptionMode.toUpperCase()})`
    );
    const ciphertext = await this.encryptContent(plaintext);

    // Create the NIP-47 request event (kind 23194)
    const eventTemplate = {
      kind: 23194,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', this.connectionData.walletPubkey]],
      content: ciphertext,
    };

    // Sign with the client secret
    const signedEvent = finalizeEvent(
      eventTemplate,
      NostrHelper.hex2bytes(this.connectionData.secret)
    );

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(signedEvent.id);
        this.log('error', `Request timeout for ${request.method}`);
        reject(new Error('Request timeout'));
      }, timeoutMs);

      this.pendingRequests.set(signedEvent.id, {
        resolve,
        reject,
        timeout,
        request,
        isRetry,
      });

      // Send the event
      this.ws!.send(JSON.stringify(['EVENT', signedEvent]));
    });
  }

  /**
   * Retry a request with NIP-04 encryption
   */
  private async retryWithNip04(request: NwcRequest): Promise<NwcResponse> {
    this.log('warn', 'Retrying with NIP-04 encryption...');
    this.encryptionMode = 'nip04';
    return this.sendRequest(request, 30000, true);
  }

  /**
   * Subscribe to response events from the wallet
   */
  private subscribe(): void {
    if (!this.ws || !this.connected) {
      return;
    }

    // Generate a subscription ID
    this.subscriptionId = Math.random().toString(36).substring(2, 15);

    // Subscribe to kind 23195 (response) events addressed to us
    const filter = {
      kinds: [23195],
      '#p': [this.clientPubkey],
      since: Math.floor(Date.now() / 1000) - 10, // Last 10 seconds
    };

    this.ws.send(JSON.stringify(['REQ', this.subscriptionId, filter]));
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      if (!Array.isArray(message)) {
        return;
      }

      const [type, ...rest] = message;

      switch (type) {
        case 'EVENT':
          this.handleEvent(rest[1]);
          break;
        case 'OK':
          // Event was received by relay
          break;
        case 'EOSE':
          // End of stored events
          break;
        case 'NOTICE':
          this.log('warn', `Relay notice: ${rest[0]}`);
          break;
      }
    } catch (error) {
      this.log('error', `Error parsing message: ${(error as Error).message}`);
    }
  }

  /**
   * Check if an error indicates a decryption/encryption problem
   */
  private isEncryptionError(errorMsg: string): boolean {
    const lowerMsg = errorMsg.toLowerCase();
    return (
      lowerMsg.includes('decrypt') ||
      lowerMsg.includes('initialization vector') ||
      lowerMsg.includes('iv') ||
      lowerMsg.includes('encrypt') ||
      lowerMsg.includes('cipher') ||
      lowerMsg.includes('parse')
    );
  }

  /**
   * Handle an incoming event (response from wallet)
   */
  private async handleEvent(event: any): Promise<void> {
    if (!event || event.kind !== 23195) {
      return;
    }

    // Check if this event is from the wallet
    if (event.pubkey !== this.connectionData.walletPubkey) {
      return;
    }

    // Find the request ID from the 'e' tag
    const eTag = event.tags?.find((t: string[]) => t[0] === 'e');
    if (!eTag) {
      return;
    }

    const requestId = eTag[1];
    const pending = this.pendingRequests.get(requestId);

    if (!pending) {
      // Response for unknown request (might be old or from another session)
      return;
    }

    // Clear the timeout and remove from pending
    clearTimeout(pending.timeout);
    this.pendingRequests.delete(requestId);

    try {
      // Try to decrypt the response
      let decrypted: string;

      // First, check if content looks like plain JSON (unencrypted error)
      if (
        event.content.startsWith('{') ||
        event.content.startsWith('"')
      ) {
        // Might be unencrypted error response
        try {
          const parsed = JSON.parse(event.content);
          // If it has an error field, this is an unencrypted error response
          if (parsed.error) {
            this.log(
              'error',
              `Wallet error: ${parsed.error.message || JSON.stringify(parsed.error)}`
            );

            // Check if it's an encryption error and we haven't retried yet
            const errorMsg =
              parsed.error.message || JSON.stringify(parsed.error);
            if (
              !pending.isRetry &&
              this.encryptionMode === 'nip44' &&
              this.isEncryptionError(errorMsg)
            ) {
              this.log(
                'warn',
                'Wallet returned encryption error, switching to NIP-04'
              );
              try {
                const retryResponse = await this.retryWithNip04(pending.request);
                pending.resolve(retryResponse);
                return;
              } catch (retryError) {
                pending.reject(retryError as Error);
                return;
              }
            }

            pending.resolve(parsed as NwcResponse);
            return;
          }
        } catch {
          // Not valid JSON, continue with decryption
        }
      }

      // Detect encryption format and decrypt
      // NIP-04 format contains "?iv=" in the ciphertext
      if (event.content.includes('?iv=')) {
        this.log('info', 'Decrypting response (NIP-04 format)');
        decrypted = await nip04.decrypt(
          this.connectionData.secret,
          this.connectionData.walletPubkey,
          event.content
        );
      } else {
        this.log('info', 'Decrypting response (NIP-44 format)');
        try {
          decrypted = nip44.v2.decrypt(event.content, this.conversationKey);
        } catch (nip44Error) {
          // NIP-44 decryption failed, maybe it's NIP-04 without standard format?
          // Try NIP-04 as fallback
          this.log(
            'warn',
            `NIP-44 decryption failed: ${(nip44Error as Error).message}, trying NIP-04...`
          );
          try {
            decrypted = await nip04.decrypt(
              this.connectionData.secret,
              this.connectionData.walletPubkey,
              event.content
            );
          } catch {
            // Both failed, throw original error
            throw nip44Error;
          }
        }
      }

      const response = JSON.parse(decrypted) as NwcResponse;

      // Check if the decrypted response contains an encryption error
      if (response.error) {
        const errorMsg = response.error.message || '';
        if (
          !pending.isRetry &&
          this.encryptionMode === 'nip44' &&
          this.isEncryptionError(errorMsg)
        ) {
          this.log(
            'warn',
            `Wallet returned encryption error: ${errorMsg}, retrying with NIP-04`
          );
          try {
            const retryResponse = await this.retryWithNip04(pending.request);
            pending.resolve(retryResponse);
            return;
          } catch (retryError) {
            pending.reject(retryError as Error);
            return;
          }
        }
        this.log('error', `Wallet error: ${errorMsg}`);
      } else {
        this.log('info', 'Request successful');
      }

      pending.resolve(response);
    } catch (error) {
      const errorMsg = (error as Error).message;
      this.log('error', `Failed to decrypt response: ${errorMsg}`);

      // If this is an encryption error and we haven't retried, try NIP-04
      if (
        !pending.isRetry &&
        this.encryptionMode === 'nip44' &&
        this.isEncryptionError(errorMsg)
      ) {
        this.log('warn', 'Decryption failed, retrying with NIP-04 encryption');
        try {
          const retryResponse = await this.retryWithNip04(pending.request);
          pending.resolve(retryResponse);
          return;
        } catch (retryError) {
          pending.reject(retryError as Error);
          return;
        }
      }

      pending.reject(new Error(`Failed to decrypt response: ${errorMsg}`));
    }
  }
}
