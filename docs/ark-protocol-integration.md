# Ark Protocol Integration

## What is Ark Protocol?

Ark is a Bitcoin Layer 2 protocol designed as a complement to the Lightning Network. Instead of payment channels, it uses **Virtual UTXOs (VTXOs)** — off-chain Bitcoin transaction outputs held by users but not broadcast on-chain.

### Key Properties

- **Non-custodial**: An Ark server (operator) coordinates VTXO creation and transfers, but never has custody. Users can always unilaterally exit to on-chain Bitcoin.
- **No channel setup**: Unlike Lightning, users don't need to lock funds in channels or manage liquidity.
- **Batch settlement**: Thousands of off-chain operations compress into single on-chain transactions ("rounds").
- **MuSig2 signing**: Participants jointly sign VTXO tree transactions using MuSig2, eliminating trust requirements between clients and servers.
- **VTXO expiry**: VTXOs have timelocks and must be renewed before expiry to maintain trustlessness.

### How It Works

In Ark, a large number of users trustlessly share on-chain UTXOs using trees of pre-signed, off-chain transactions. Payments are made by exchanging a share in an existing shared UTXO for a share in a new shared UTXO. These shares are called Virtual UTXOs (VTXOs).

VTXO creation and transfers are coordinated via a central party (an Ark server/operator) without ever giving that party custody over the bitcoin. Users can always claim their bitcoin on-chain without depending on the server by broadcasting their VTXO transactions.

Transaction trees are constructed periodically through an interactive process known as "rounds." Each round involves multiple users and the operator, who together construct and sign the transaction tree, then broadcast the root transaction on-chain. Users securely store their branch and leaf transactions off-chain.

### Differences from Lightning

Ark presents almost opposite tradeoffs to Lightning Network:

| Property | Lightning | Ark |
|---|---|---|
| Setup | Requires channel open/close | No channel setup |
| Liquidity | Must be allocated per-channel | Shared across all users |
| On-chain footprint | Channel open + close txs | Batch root txs only |
| Throughput | Near-unlimited per channel | Correlated with blockchain throughput |
| Interactivity | Requires both parties online | Rounds are periodic |

This complementary nature means Lightning and Ark work well together — Arkade supports Lightning swaps via Boltz integration.

### Current State (2025-2026)

Ark Labs launched **Arkade** in public beta (October 2025) with:

- SDKs in TypeScript, Go, and Rust
- Launch partners including Breez, BlueWallet, BTCPayServer, BullBitcoin, and LayerZ Wallet
- Arkade Assets framework for stablecoins/tokens (USDT support planned)
- Lightning Network integration through Boltz submarine swaps

A covenant-related soft fork (OP_CHECKTEMPLATEVERIFY / OP_CHECKSIGFROMSTACK) may arrive as early as 2026, which would significantly improve Ark's scalability and fee efficiency.

## Why Plebeian Signer is a Natural Fit

### Same Cryptographic Foundation

The critical insight: **Nostr keys and Ark keys are both secp256k1**. Nostr's x-only pubkey format (NIP-01 / BIP-340) is identical to Bitcoin's taproot x-only pubkey format. A user's Nostr identity private key can mathematically serve as their Ark identity.

This means Plebeian Signer users already have the key material needed for Ark — it's stored in their encrypted vault.

### Arkade SDK's Pluggable Identity Pattern

The Arkade SDK uses a pluggable identity provider architecture where all wallet logic (balance queries, VTXO management, transaction history, Lightning operations) runs in the dapp/frontend, while the identity provider only handles key material and signing.

Existing implementations:

| Implementation | Where keys live | Purpose |
|---|---|---|
| `SingleKey` | In-memory (app holds privkey) | Default, simple apps |
| `MetaMaskSnapIdentity` | MetaMask Snap | Browser extension signing |
| **`PlebeianSignerIdentity`** | Plebeian Signer vault | **What we would build** |

### MetaMask Snap as Reference

The Arkade MetaMask Snap demonstrates the minimal signing interface a browser extension needs to implement. Its entire API is three methods:

1. `arkade_getPublicKey()` — Returns compressed (33 bytes) and x-only (32 bytes) public keys
2. `arkade_getAddress(network, signerPubkey, exitDelay)` — Computes and returns a Bech32m-encoded Ark address
3. `arkade_signPsbt(psbt, inputIndexes)` — Signs specified inputs of a base64-encoded PSBT

All wallet logic runs in the frontend. The signer only handles key material.

## Implementation Plan

### API Surface

Two approaches for exposing Ark methods to web pages:

**Option A — Extend `window.nostr` (recommended)**

```javascript
window.nostr.ark.getPublicKey()
window.nostr.ark.getAddress({ network, signerPubkey, exitDelay })
window.nostr.ark.signPsbt({ psbt, inputIndexes })
```

This follows the existing pattern where `nip04` and `nip44` hang off `window.nostr`. It reinforces the unified identity model.

**Option B — Separate `window.arkade` provider**

```javascript
window.arkade.getPublicKey()
window.arkade.getAddress(params)
window.arkade.signPsbt(params)
```

More decoupled, closer to the MetaMask pattern. Could be detected independently by dapps.

### Extension Layer Changes

#### 1. Injected Script (`plebian-signer-extension.ts`)

Expose the new methods on `window.nostr.ark` (or `window.arkade`), following the same message-passing pattern already used for NIP-07 methods. Each method sends a message through the content script to the background worker and returns a promise.

#### 2. Content Script (`plebian-signer-content-script.ts`)

Bridge the new Ark message types between page context and the background service worker. No new patterns needed — same relay mechanism used for existing NIP-07 messages.

#### 3. Background Service Worker (`background.ts`)

Handle three new request types:

- **`arkade_getPublicKey`**: Derive compressed and x-only pubkeys from the active identity's secp256k1 key. The key already exists — we just need to return it in both formats (33-byte compressed, 32-byte x-only).

- **`arkade_getAddress`**: Compute the Ark address using the user's x-only pubkey, the server's pubkey, and the unilateral exit delay timelock. Can use `@arkade-os/sdk`'s `DefaultVtxo.Script` or compute directly.

- **`arkade_signPsbt`**: Parse the PSBT, sign the specified input indexes with the identity's private key. This is the most complex operation — requires PSBT parsing and signing support.

#### 4. Permission System

Add Ark-specific permissions to the existing per-identity/per-host/per-method model:

- `ark.getPublicKey` — Low risk, similar to `getPublicKey()`
- `ark.getAddress` — Low risk, derived from public key
- `ark.signPsbt` — **High risk** — signs Bitcoin transactions

PSBT signing is higher stakes than Nostr event signing (it authorizes spending real bitcoin). Users should always be prompted and shown decoded transaction details, unless they've explicitly enabled reckless mode or whitelisted the host.

#### 5. UI Additions

- **Identity details**: Show the Ark address derived from each Nostr identity (given a configurable Ark server).
- **PSBT signing prompt**: Display decoded transaction details (amounts, addresses, change outputs) when a dapp requests PSBT signing. Unlike Nostr events (human-readable JSON), PSBTs are opaque binary and need decoding for the user.
- **Ark server configuration**: Allow users to configure which Ark server(s) they use, per identity or globally.

#### 6. SDK Companion (`PlebeianSignerIdentity`)

Publish a small identity provider class (or contribute upstream to `@arkade-os/sdk`) that wraps `window.nostr.ark.*` calls. This allows Arkade SDK-based dapps to use Plebeian Signer with zero custom code:

```typescript
import { PlebeianSignerIdentity } from '@anthropic/plebeian-signer-ark';
import { Wallet } from '@arkade-os/sdk';

const identity = new PlebeianSignerIdentity();
const wallet = await Wallet.create({ identity, arkServerUrl: '...' });
```

### Technical Considerations

#### Same Key, Different Signing Contexts

Nostr uses Schnorr signatures (BIP-340), while Bitcoin PSBTs may need:
- **ECDSA** for legacy/segwit inputs
- **Schnorr** for taproot inputs (which Ark uses)

The Arkade SDK's `SingleKey.sign()` handles this distinction internally. Our background worker needs the same multi-signature-scheme support. The `@scure/btc-signer` library handles both.

#### PSBT Display

PSBTs are binary and opaque. A good signing UX requires decoding the PSBT and showing:
- Total input/output amounts
- Destination addresses
- Change outputs
- Fee amount
- Which inputs the extension is being asked to sign

#### Dependencies

Adding PSBT parsing/signing increases the extension's bundle size. Candidate libraries:
- `@scure/btc-signer` — ~50KB, audited, minimal dependencies
- `@arkade-os/sdk` — heavier but provides full Ark address computation

A minimal approach would use `@scure/btc-signer` for PSBT operations and compute Ark addresses with lighter utilities.

#### Key Derivation (Future)

The simplest v1 reuses the Nostr private key directly for Ark (same secp256k1 curve). A future enhancement could use BIP-32 HD derivation from a seed, allowing the same vault to produce both a Nostr key and separate Bitcoin-specific keys. This would be relevant if users want their Nostr identity and Bitcoin spending identity to be different keypairs.

## What This Enables

A user with Plebeian Signer could:

1. Visit any Arkade-powered dapp
2. The dapp detects `window.nostr.ark` (or `window.arkade`)
3. The dapp creates a wallet using `PlebeianSignerIdentity`
4. The user's Nostr identity doubles as their Bitcoin/Ark identity
5. They can send/receive VTXOs, do Lightning swaps — all signed by the extension
6. Their Nostr social identity and Bitcoin payment identity are cryptographically the same keypair

**One identity for both social (Nostr) and financial (Ark/Bitcoin) interactions, managed in one place.**

## References

- [Ark Protocol](https://ark-protocol.org/)
- [Ark Protocol Explainer (Ark Labs Docs)](https://docs.arklabs.xyz/ark/)
- [Arkade SDK — TypeScript](https://github.com/arkade-os/ts-sdk)
- [Arkade SDK Documentation](https://arkade-os.github.io/ts-sdk/)
- [Arkade MetaMask Snap](https://github.com/arkade-os/snap)
- [Arkade Launch Announcement](https://bitcoinmagazine.com/news/arkade-launches-as-bitcoin-layer-2)
- [Ark on Bitcoin Optech](https://bitcoinops.org/en/topics/ark/)
- [Spark and Ark Comparison (Bitcoin Magazine)](https://bitcoinmagazine.com/technical/spark-and-ark-a-look-at-our-newest-bitcoin-layer-twos)
