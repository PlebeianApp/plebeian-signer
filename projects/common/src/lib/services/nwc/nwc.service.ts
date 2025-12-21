import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { StorageService, NwcConnection_DECRYPTED } from '@common';
import { NwcClient, NwcConnectionData, NwcLogLevel, NwcLogCallback } from './nwc-client';
import {
  NwcGetInfoResult,
  NwcPayInvoiceResult,
  NwcMakeInvoiceResult,
  NwcListTransactionsParams,
  NwcLookupInvoiceResult,
} from './types';
import { parseNwcUrl } from '../storage/related/nwc';

export interface NwcLogEntry {
  timestamp: Date;
  level: NwcLogLevel;
  message: string;
}

interface CachedClient {
  client: NwcClient;
  connectionId: string;
}

/**
 * Angular service for managing NWC wallet connections
 */
@Injectable({
  providedIn: 'root',
})
export class NwcService {
  private clients = new Map<string, CachedClient>();
  private _logs$ = new BehaviorSubject<NwcLogEntry[]>([]);
  private maxLogs = 100;

  /** Observable stream of NWC log entries */
  readonly logs$ = this._logs$.asObservable();

  constructor(private storageService: StorageService) {}

  /** Get current logs */
  get logs(): NwcLogEntry[] {
    return this._logs$.value;
  }

  /** Clear all logs */
  clearLogs(): void {
    this._logs$.next([]);
  }

  /** Add a log entry */
  private addLog(level: NwcLogLevel, message: string): void {
    const entry: NwcLogEntry = {
      timestamp: new Date(),
      level,
      message,
    };
    const logs = [entry, ...this._logs$.value].slice(0, this.maxLogs);
    this._logs$.next(logs);
  }

  /** Create a log callback for the NWC client */
  private createLogCallback(): NwcLogCallback {
    return (level: NwcLogLevel, message: string) => {
      this.addLog(level, message);
    };
  }

  /**
   * Parse and validate an NWC URL
   */
  parseNwcUrl(url: string): {
    walletPubkey: string;
    relayUrl: string;
    secret: string;
    lud16?: string;
  } | null {
    return parseNwcUrl(url);
  }

  /**
   * Get all NWC connections from storage
   */
  getConnections(): NwcConnection_DECRYPTED[] {
    const sessionData =
      this.storageService.getBrowserSessionHandler().browserSessionData;
    return sessionData?.nwcConnections ?? [];
  }

  /**
   * Get a single NWC connection by ID
   */
  getConnection(connectionId: string): NwcConnection_DECRYPTED | undefined {
    return this.getConnections().find((c) => c.id === connectionId);
  }

  /**
   * Add a new NWC connection
   */
  async addConnection(name: string, connectionUrl: string): Promise<void> {
    await this.storageService.addNwcConnection({ name, connectionUrl });
  }

  /**
   * Delete an NWC connection
   */
  async deleteConnection(connectionId: string): Promise<void> {
    // Disconnect and remove the client if it exists
    this.disconnectClient(connectionId);
    await this.storageService.deleteNwcConnection(connectionId);
  }

  /**
   * Get a connected client for a connection, creating it if necessary
   */
  private async getClient(connectionId: string): Promise<NwcClient> {
    // Check if we have a cached client
    const cached = this.clients.get(connectionId);
    if (cached && cached.client.isConnected()) {
      return cached.client;
    }

    // Get the connection data
    const connection = this.getConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    // Create a new client
    const connectionData: NwcConnectionData = {
      walletPubkey: connection.walletPubkey,
      relayUrl: connection.relayUrl,
      secret: connection.secret,
    };

    const client = new NwcClient(connectionData, this.createLogCallback());
    await client.connect();

    // Cache the client
    this.clients.set(connectionId, {
      client,
      connectionId,
    });

    return client;
  }

  /**
   * Disconnect a client
   */
  private disconnectClient(connectionId: string): void {
    const cached = this.clients.get(connectionId);
    if (cached) {
      cached.client.disconnect();
      this.clients.delete(connectionId);
    }
  }

  /**
   * Disconnect all clients
   */
  disconnectAll(): void {
    for (const cached of this.clients.values()) {
      cached.client.disconnect();
    }
    this.clients.clear();
  }

  /**
   * Get wallet info for a connection
   */
  async getInfo(connectionId: string): Promise<NwcGetInfoResult> {
    const client = await this.getClient(connectionId);
    return client.getInfo();
  }

  /**
   * Get balance for a connection (in millisatoshis)
   */
  async getBalance(connectionId: string): Promise<number> {
    const client = await this.getClient(connectionId);
    const result = await client.getBalance();

    // Update the cached balance in storage
    await this.storageService.updateNwcConnectionBalance(
      connectionId,
      result.balance
    );

    return result.balance;
  }

  /**
   * Get balances for all connections
   * Returns a map of connectionId -> balance in millisatoshis
   */
  async getAllBalances(): Promise<Map<string, number>> {
    const balances = new Map<string, number>();
    const connections = this.getConnections();

    const results = await Promise.allSettled(
      connections.map(async (conn) => {
        try {
          const balance = await this.getBalance(conn.id);
          return { id: conn.id, balance };
        } catch (error) {
          // Return cached balance if available
          if (conn.cachedBalance !== undefined) {
            return { id: conn.id, balance: conn.cachedBalance };
          }
          throw error;
        }
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        balances.set(result.value.id, result.value.balance);
      }
    }

    return balances;
  }

  /**
   * Get total balance across all connections (in millisatoshis)
   */
  async getTotalBalance(): Promise<number> {
    const balances = await this.getAllBalances();
    let total = 0;
    for (const balance of balances.values()) {
      total += balance;
    }
    return total;
  }

  /**
   * Get cached total balance (without making network requests)
   */
  getCachedTotalBalance(): number {
    const connections = this.getConnections();
    let total = 0;
    for (const conn of connections) {
      if (conn.cachedBalance !== undefined) {
        total += conn.cachedBalance;
      }
    }
    return total;
  }

  /**
   * Pay a Lightning invoice
   */
  async payInvoice(
    connectionId: string,
    invoice: string,
    amountMsat?: number
  ): Promise<NwcPayInvoiceResult> {
    const client = await this.getClient(connectionId);
    const result = await client.payInvoice({
      invoice,
      amount: amountMsat,
    });

    // Refresh balance after payment
    try {
      await this.getBalance(connectionId);
    } catch {
      // Ignore balance refresh errors
    }

    return result;
  }

  /**
   * Create a Lightning invoice
   */
  async makeInvoice(
    connectionId: string,
    amountMsat: number,
    description?: string
  ): Promise<NwcMakeInvoiceResult> {
    const client = await this.getClient(connectionId);
    return client.makeInvoice({
      amount: amountMsat,
      description,
    });
  }

  /**
   * List transaction history
   */
  async listTransactions(
    connectionId: string,
    params?: NwcListTransactionsParams
  ): Promise<NwcLookupInvoiceResult[]> {
    const client = await this.getClient(connectionId);
    const result = await client.listTransactions(params);
    return result.transactions;
  }

  /**
   * Resolve a Lightning Address (user@domain.com) to a bolt11 invoice
   * Uses LNURL-pay protocol
   */
  async resolveLightningAddress(
    address: string,
    amountMsat: number
  ): Promise<string> {
    // Parse lightning address
    const match = address.match(/^([^@]+)@([^@]+)$/);
    if (!match) {
      throw new Error('Invalid lightning address format');
    }

    const [, name, domain] = match;

    // Fetch LNURL-pay endpoint
    const lnurlpUrl = `https://${domain}/.well-known/lnurlp/${name}`;
    this.addLog('info', `Fetching LNURL-pay from ${domain}...`);

    const response = await fetch(lnurlpUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch LNURL-pay: ${response.status}`);
    }

    const lnurlpData = await response.json();

    // Validate response
    if (lnurlpData.status === 'ERROR') {
      throw new Error(lnurlpData.reason || 'LNURL-pay error');
    }

    if (!lnurlpData.callback) {
      throw new Error('Invalid LNURL-pay response: missing callback');
    }

    // Check amount bounds
    const minSendable = lnurlpData.minSendable || 1000;
    const maxSendable = lnurlpData.maxSendable || 100000000000;

    if (amountMsat < minSendable) {
      throw new Error(
        `Amount too small. Minimum: ${Math.ceil(minSendable / 1000)} sats`
      );
    }

    if (amountMsat > maxSendable) {
      throw new Error(
        `Amount too large. Maximum: ${Math.floor(maxSendable / 1000)} sats`
      );
    }

    // Request invoice from callback
    const callbackUrl = new URL(lnurlpData.callback);
    callbackUrl.searchParams.set('amount', amountMsat.toString());

    this.addLog('info', 'Requesting invoice...');
    const invoiceResponse = await fetch(callbackUrl.toString());
    if (!invoiceResponse.ok) {
      throw new Error(`Failed to get invoice: ${invoiceResponse.status}`);
    }

    const invoiceData = await invoiceResponse.json();

    if (invoiceData.status === 'ERROR') {
      throw new Error(invoiceData.reason || 'Failed to get invoice');
    }

    if (!invoiceData.pr) {
      throw new Error('Invalid invoice response: missing payment request');
    }

    this.addLog('info', 'Invoice received');
    return invoiceData.pr;
  }

  /**
   * Check if a string is a lightning address (user@domain)
   */
  isLightningAddress(input: string): boolean {
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input);
  }

  /**
   * Check if a string is a bolt11 invoice
   */
  isBolt11Invoice(input: string): boolean {
    return /^ln(bc|tb|tbs)[0-9a-z]+$/i.test(input.toLowerCase());
  }

  /**
   * Test a connection by getting wallet info
   */
  async testConnection(connectionUrl: string): Promise<NwcGetInfoResult> {
    this.addLog('info', 'Testing NWC connection...');
    const parsed = this.parseNwcUrl(connectionUrl);
    if (!parsed) {
      this.addLog('error', 'Invalid NWC URL');
      throw new Error('Invalid NWC URL');
    }

    const client = new NwcClient(parsed, this.createLogCallback());
    try {
      await client.connect();
      const info = await client.getInfo();
      this.addLog('info', `Connection test successful: ${info.alias || 'wallet'}`);
      return info;
    } catch (error) {
      this.addLog('error', `Connection test failed: ${(error as Error).message}`);
      throw error;
    } finally {
      client.disconnect();
    }
  }
}
