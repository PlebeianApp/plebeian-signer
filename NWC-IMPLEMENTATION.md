# Nostr Wallet Connect (NWC) Implementation Guide

This document provides guidance for implementing NIP-47 (Nostr Wallet Connect) support in the Plebeian Signer browser extension.

## What is Nostr Wallet Connect?

Nostr Wallet Connect (NWC), defined in [NIP-47](https://nips.nostr.com/47), is a protocol that enables Nostr applications to interact with Lightning wallets through encrypted messages over Nostr relays. It allows apps to:

- Request payments (pay invoices, keysend)
- Create invoices
- Check wallet balance
- List transactions
- Receive payment notifications

The key benefit is that users can connect their Lightning wallet once and authorize apps to make payments without requiring manual approval for each transaction (within configured limits).

## Wallets Supporting NWC

### Self-Custodial Wallets

| Wallet | Description | Link |
|--------|-------------|------|
| **Alby Hub** | Self-custodial Lightning node with seamless NWC service | [getalby.com](https://getalby.com) |
| **Phoenix** | Popular self-custodial Lightning wallet (via Phoenixd) | [phoenix.acinq.co](https://phoenix.acinq.co) |
| **Electrum** | Legendary on-chain and Lightning wallet | [electrum.org](https://electrum.org) |
| **Flash Wallet** | Self-custodial wallet built on Breez SDK | [paywithflash.com](https://paywithflash.com) |
| **Blitz** | Self-custodial wallet supporting Spark and Lightning | - |
| **LNbits** | Powerful suite of Bitcoin tools with NWC plugin | [lnbits.com](https://lnbits.com) |
| **Minibits** | Ecash wallet with focus on performance | [minibits.cash](https://minibits.cash) |
| **Cashu.me** | Ecash-based Cashu PWA wallet | [cashu.me](https://cashu.me) |

### Custodial Wallets

| Wallet | Description |
|--------|-------------|
| **Primal Wallet** | Integrated with Primal Nostr clients |
| **Coinos** | Free custodial web wallet and payment page |
| **Bitvora** | Custodial wallet and Bitcoin Lightning API platform |
| **Orange Pill App** | Social app with integrated custodial wallet |

### Node Software with NWC Support

- **Umbrel** - NWC app available in official marketplace
- **Start9** - Embassy OS with NWC support

## NIP-47 Protocol Specification

### Event Kinds

| Kind | Purpose | Encrypted |
|------|---------|-----------|
| 13194 | Wallet Info (capabilities) | No |
| 23194 | Client Request | Yes |
| 23195 | Wallet Response | Yes |
| 23197 | Notifications (NIP-44) | Yes |
| 23196 | Notifications (NIP-04 legacy) | Yes |

### Connection URI Format

```
nostr+walletconnect://<wallet_pubkey>?relay=<relay_url>&secret=<client_secret>&lud16=<optional_lightning_address>
```

**Example:**
```
nostr+walletconnect://b889ff5b1513b641e2a139f661a661364979c5beee91842f8f0ef42ab558e9d4?relay=wss%3A%2F%2Frelay.damus.io&secret=71a8c14c1407c113601079c4302dab36460f0ccd0ad506f1f2dc73b5100e4f3c
```

Components:
- **wallet_pubkey**: The wallet service's public key (used for encryption)
- **relay**: Nostr relay URL for communication (URL-encoded)
- **secret**: 32-byte hex client secret key for signing requests
- **lud16**: Optional Lightning address for the wallet

### Supported Methods

| Method | Description |
|--------|-------------|
| `get_info` | Get wallet info and supported methods |
| `get_balance` | Get wallet balance in millisatoshis |
| `pay_invoice` | Pay a BOLT11 Lightning invoice |
| `multi_pay_invoice` | Pay multiple invoices in batch |
| `pay_keysend` | Send spontaneous payment to a pubkey |
| `multi_pay_keysend` | Batch keysend payments |
| `make_invoice` | Create a new Lightning invoice |
| `lookup_invoice` | Look up invoice status |
| `list_transactions` | Get transaction history |

### Error Codes

| Code | Description |
|------|-------------|
| `RATE_LIMITED` | Too many requests |
| `NOT_IMPLEMENTED` | Method not supported |
| `INSUFFICIENT_BALANCE` | Not enough funds |
| `QUOTA_EXCEEDED` | Spending limit reached |
| `RESTRICTED` | Operation not allowed for this connection |
| `UNAUTHORIZED` | No wallet connected for this pubkey |
| `INTERNAL` | Internal wallet error |
| `UNSUPPORTED_ENCRYPTION` | Encryption method not supported |
| `OTHER` | Generic error |

### Encryption

NWC supports two encryption methods:
- **NIP-44 v2** (preferred): Modern, secure encryption
- **NIP-04** (deprecated): Legacy support only

The wallet advertises supported encryption in the info event (kind 13194). Clients should prefer NIP-44 when available.

## Request/Response Formats

### Request Structure

```json
{
  "method": "method_name",
  "params": {
    // method-specific parameters
  }
}
```

### Response Structure

```json
{
  "result_type": "method_name",
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  },
  "result": {
    // method-specific response
  }
}
```

### Method Examples

#### get_info

**Request:**
```json
{
  "method": "get_info",
  "params": {}
}
```

**Response:**
```json
{
  "result_type": "get_info",
  "result": {
    "alias": "My Wallet",
    "color": "#ff9900",
    "pubkey": "03abcdef...",
    "network": "mainnet",
    "block_height": 800000,
    "methods": ["pay_invoice", "get_balance", "make_invoice"],
    "notifications": ["payment_received", "payment_sent"]
  }
}
```

#### get_balance

**Request:**
```json
{
  "method": "get_balance",
  "params": {}
}
```

**Response:**
```json
{
  "result_type": "get_balance",
  "result": {
    "balance": 100000000
  }
}
```

Balance is in **millisatoshis** (1 sat = 1000 msats).

#### pay_invoice

**Request:**
```json
{
  "method": "pay_invoice",
  "params": {
    "invoice": "lnbc50n1p3...",
    "amount": 5000,
    "metadata": {
      "comment": "Payment for coffee"
    }
  }
}
```

**Response:**
```json
{
  "result_type": "pay_invoice",
  "result": {
    "preimage": "0123456789abcdef...",
    "fees_paid": 10
  }
}
```

#### make_invoice

**Request:**
```json
{
  "method": "make_invoice",
  "params": {
    "amount": 21000,
    "description": "Donation",
    "expiry": 3600
  }
}
```

**Response:**
```json
{
  "result_type": "make_invoice",
  "result": {
    "type": "incoming",
    "state": "pending",
    "invoice": "lnbc210n1p3...",
    "payment_hash": "abc123...",
    "amount": 21000,
    "created_at": 1700000000,
    "expires_at": 1700003600
  }
}
```

## Implementation for Browser Extension

### Architecture Overview

For Plebeian Signer, NWC support would add a new capability alongside NIP-07:

```
Web App
    ↓
window.nostr.nwc.* (new NWC methods)
    ↓
Content Script
    ↓
Background Service Worker
    ↓
Nostr Relay (WebSocket)
    ↓
Lightning Wallet Service
```

### Recommended SDK

Use the **Alby JS SDK** for NWC client implementation:

```bash
npm install @getalby/sdk
```

### Code Examples

#### Basic NWC Client Setup

```typescript
import { nwc } from '@getalby/sdk';

// Parse and validate NWC connection URL
function parseNwcUrl(url: string): {
  walletPubkey: string;
  relayUrl: string;
  secret: string;
  lud16?: string;
} {
  const parsed = new URL(url);
  if (parsed.protocol !== 'nostr+walletconnect:') {
    throw new Error('Invalid NWC URL protocol');
  }

  return {
    walletPubkey: parsed.hostname || parsed.pathname.replace('//', ''),
    relayUrl: decodeURIComponent(parsed.searchParams.get('relay') || ''),
    secret: parsed.searchParams.get('secret') || '',
    lud16: parsed.searchParams.get('lud16') || undefined,
  };
}

// Create NWC client from connection URL
async function createNwcClient(connectionUrl: string) {
  const client = new nwc.NWCClient({
    nostrWalletConnectUrl: connectionUrl,
  });

  return client;
}
```

#### Implementing NWC Methods

```typescript
import { nwc } from '@getalby/sdk';

class NwcService {
  private client: nwc.NWCClient | null = null;

  async connect(connectionUrl: string): Promise<void> {
    this.client = new nwc.NWCClient({
      nostrWalletConnectUrl: connectionUrl,
    });
  }

  async getInfo(): Promise<any> {
    if (!this.client) throw new Error('Not connected');
    return await this.client.getInfo();
  }

  async getBalance(): Promise<{ balance: number }> {
    if (!this.client) throw new Error('Not connected');
    return await this.client.getBalance();
  }

  async payInvoice(invoice: string, amount?: number): Promise<{
    preimage: string;
    fees_paid?: number;
  }> {
    if (!this.client) throw new Error('Not connected');
    return await this.client.payInvoice({
      invoice,
      amount,
    });
  }

  async makeInvoice(params: {
    amount: number;
    description?: string;
    expiry?: number;
  }): Promise<{
    invoice: string;
    payment_hash: string;
  }> {
    if (!this.client) throw new Error('Not connected');
    return await this.client.makeInvoice(params);
  }

  async lookupInvoice(params: {
    payment_hash?: string;
    invoice?: string;
  }): Promise<any> {
    if (!this.client) throw new Error('Not connected');
    return await this.client.lookupInvoice(params);
  }

  async listTransactions(params?: {
    from?: number;
    until?: number;
    limit?: number;
    offset?: number;
    type?: 'incoming' | 'outgoing';
  }): Promise<any> {
    if (!this.client) throw new Error('Not connected');
    return await this.client.listTransactions(params);
  }

  disconnect(): void {
    // Clean up WebSocket connection
    this.client = null;
  }
}
```

#### Manual Implementation (Without SDK)

If you prefer not to use the SDK, here's how to implement NWC manually using your existing Nostr helpers:

```typescript
import { NostrHelper, CryptoHelper } from '@common';

interface NwcConnection {
  walletPubkey: string;
  relayUrl: string;
  secret: string;  // Client's private key for this connection
}

class ManualNwcClient {
  private connection: NwcConnection;
  private ws: WebSocket | null = null;
  private pendingRequests: Map<string, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = new Map();

  constructor(connectionUrl: string) {
    this.connection = this.parseConnectionUrl(connectionUrl);
  }

  private parseConnectionUrl(url: string): NwcConnection {
    const parsed = new URL(url);
    return {
      walletPubkey: parsed.hostname || parsed.pathname.replace('//', ''),
      relayUrl: decodeURIComponent(parsed.searchParams.get('relay') || ''),
      secret: parsed.searchParams.get('secret') || '',
    };
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.connection.relayUrl);

      this.ws.onopen = () => {
        // Subscribe to responses from the wallet
        const clientPubkey = NostrHelper.getPublicKey(this.connection.secret);
        const subId = CryptoHelper.randomHex(16);

        this.ws!.send(JSON.stringify([
          'REQ',
          subId,
          {
            kinds: [23195],  // Response events
            '#p': [clientPubkey],
            since: Math.floor(Date.now() / 1000) - 60,
          }
        ]));

        resolve();
      };

      this.ws.onerror = (error) => reject(error);

      this.ws.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };
    });
  }

  private handleMessage(message: any[]): void {
    if (message[0] === 'EVENT') {
      const event = message[2];
      this.handleResponseEvent(event);
    }
  }

  private async handleResponseEvent(event: any): Promise<void> {
    // Decrypt the response using NIP-44 (preferred) or NIP-04
    const decrypted = await CryptoHelper.nip44Decrypt(
      this.connection.secret,
      this.connection.walletPubkey,
      event.content
    );

    const response = JSON.parse(decrypted);

    // Find the original request by event ID from 'e' tag
    const requestId = event.tags.find((t: string[]) => t[0] === 'e')?.[1];

    if (requestId && this.pendingRequests.has(requestId)) {
      const { resolve, reject } = this.pendingRequests.get(requestId)!;
      this.pendingRequests.delete(requestId);

      if (response.error) {
        reject(new Error(`${response.error.code}: ${response.error.message}`));
      } else {
        resolve(response.result);
      }
    }
  }

  async sendRequest(method: string, params: any = {}): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected');
    }

    const clientPubkey = NostrHelper.getPublicKey(this.connection.secret);

    // Create the request payload
    const payload = JSON.stringify({ method, params });

    // Encrypt with NIP-44
    const encrypted = await CryptoHelper.nip44Encrypt(
      this.connection.secret,
      this.connection.walletPubkey,
      payload
    );

    // Create the request event
    const event = {
      kind: 23194,
      pubkey: clientPubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['p', this.connection.walletPubkey],
        ['encryption', 'nip44_v2'],
      ],
      content: encrypted,
    };

    // Sign the event
    const signedEvent = await NostrHelper.signEvent(event, this.connection.secret);

    // Send to relay
    this.ws.send(JSON.stringify(['EVENT', signedEvent]));

    // Return promise that resolves when we get response
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(signedEvent.id, { resolve, reject });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(signedEvent.id)) {
          this.pendingRequests.delete(signedEvent.id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  // Convenience methods
  async getInfo() {
    return this.sendRequest('get_info');
  }

  async getBalance() {
    return this.sendRequest('get_balance');
  }

  async payInvoice(invoice: string, amount?: number) {
    return this.sendRequest('pay_invoice', { invoice, amount });
  }

  async makeInvoice(amount: number, description?: string, expiry?: number) {
    return this.sendRequest('make_invoice', { amount, description, expiry });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.pendingRequests.clear();
  }
}
```

### Exposing NWC via window.nostr

Extend the existing `window.nostr` interface:

```typescript
// In plebian-signer-extension.ts

interface WindowNostr {
  // Existing NIP-07 methods
  getPublicKey(): Promise<string>;
  signEvent(event: UnsignedEvent): Promise<SignedEvent>;
  getRelays(): Promise<Record<string, RelayPolicy>>;
  nip04: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
  nip44: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };

  // New NWC methods
  nwc?: {
    isEnabled(): Promise<boolean>;
    getInfo(): Promise<NwcInfo>;
    getBalance(): Promise<{ balance: number }>;
    payInvoice(invoice: string, amount?: number): Promise<{ preimage: string }>;
    makeInvoice(params: MakeInvoiceParams): Promise<InvoiceResult>;
    lookupInvoice(params: LookupParams): Promise<InvoiceResult>;
    listTransactions(params?: ListParams): Promise<Transaction[]>;
  };
}
```

### Storage Considerations

Store NWC connection details securely:

```typescript
interface NwcConnectionData {
  id: string;
  name: string;               // User-friendly name
  connectionUrl: string;      // Full nostr+walletconnect:// URL
  walletPubkey: string;       // Extracted for quick access
  relayUrl: string;           // Extracted for quick access
  createdAt: number;
  lastUsed?: number;

  // Optional spending limits (enforced client-side as additional protection)
  maxSinglePayment?: number;  // Max per-payment in sats
  dailyLimit?: number;        // Max daily spending in sats
  dailySpent?: number;        // Track daily spending
  dailyResetAt?: number;      // When to reset daily counter
}

// Store in encrypted vault alongside identities
interface VaultData {
  identities: Identity[];
  nwcConnections: NwcConnectionData[];
}
```

### Permission Flow

When a web app requests NWC operations:

1. **Check if NWC is configured**: Show setup prompt if not
2. **Validate the request**: Check method, params, and spending limits
3. **Prompt for approval**: Show payment details for `pay_invoice`
4. **Execute and respond**: Send to wallet and return result

```typescript
// Permission levels
enum NwcPermission {
  READ_ONLY = 'read_only',      // get_info, get_balance, lookup, list
  RECEIVE = 'receive',          // + make_invoice
  SEND = 'send',                // + pay_invoice, pay_keysend (requires approval)
  AUTO_PAY = 'auto_pay',        // + automatic payments within limits
}

interface NwcSitePermission {
  origin: string;
  permission: NwcPermission;
  autoPayLimit?: number;        // Auto-approve payments under this amount
}
```

## UI Components Needed

### Connection Setup Page

- Input field for NWC connection URL (or QR scanner)
- Parse and display connection details
- Test connection button
- Save connection

### Wallet Dashboard

- Display connected wallet info
- Show current balance
- Transaction history
- Spending statistics

### Payment Approval Prompt

- Invoice amount and description
- Recipient info if available
- Fee estimate
- Approve/Reject buttons
- "Remember for this site" option

## Security Considerations

1. **Store secrets securely**: NWC secrets should be encrypted in the vault like private keys
2. **Validate all inputs**: Sanitize invoice strings, validate amounts
3. **Implement spending limits**: Add client-side limits as defense in depth
4. **Audit trail**: Log all NWC operations for user review
5. **Clear error handling**: Never expose raw errors to web pages
6. **Connection isolation**: Each site should not see other sites' NWC activity

## Testing

### Test Wallets

1. **Alby Hub** - Full NWC support, easy setup: [getalby.com](https://getalby.com)
2. **LNbits** - Self-hosted, great for testing: [lnbits.com](https://lnbits.com)
3. **Coinos** - Custodial, quick signup: [coinos.io](https://coinos.io)

### Test Scenarios

- [ ] Parse valid NWC URLs
- [ ] Reject invalid NWC URLs
- [ ] Connect to relay successfully
- [ ] Get wallet info
- [ ] Get balance
- [ ] Create invoice
- [ ] Pay invoice (testnet/small amount)
- [ ] Handle connection errors gracefully
- [ ] Handle wallet errors gracefully
- [ ] Enforce spending limits
- [ ] Permission prompts work correctly

## Resources

### Official Documentation

- [NIP-47 Specification](https://nips.nostr.com/47)
- [NIP-47 on GitHub](https://github.com/nostr-protocol/nips/blob/master/47.md)
- [NWC Developer Portal](https://nwc.dev)
- [NWC Documentation](https://docs.nwc.dev)

### SDKs and Libraries

- [Alby JS SDK](https://github.com/getAlby/js-sdk) - Recommended for browser extensions
- [Alby SDK on npm](https://www.npmjs.com/package/@getalby/sdk)
- [Alby Developer Guide](https://guides.getalby.com/developer-guide/nostr-wallet-connect-api)

### Example Implementations

- [Alby NWC Examples](https://github.com/getAlby/js-sdk/tree/master/examples/nwc)
- [Alby Browser Extension](https://github.com/getAlby/lightning-browser-extension)
- [Awesome NWC List](https://github.com/getAlby/awesome-nwc)

### Community

- [NWC Discord](https://discord.gg/PRhQPZCmeF)
- [Nostr Protocol GitHub](https://github.com/nostr-protocol)
