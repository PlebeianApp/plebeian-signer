# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Plebeian Signer is a browser extension for managing multiple Nostr identities and signing events without exposing private keys to web applications. It implements NIP-07 (window.nostr interface) with support for NIP-04 and NIP-44 encryption.

## Build Commands

```bash
npm ci                    # Install dependencies
npm run build:chrome      # Build Chrome extension (outputs to dist/chrome)
npm run build:firefox     # Build Firefox extension (outputs to dist/firefox)
npm run watch:chrome      # Development build with watch mode for Chrome
npm run watch:firefox     # Development build with watch mode for Firefox
npm test                  # Run unit tests with Karma
npm run lint              # Run ESLint
```

**Important:** After making any code changes, rebuild both extensions before testing:
```bash
npm run build:chrome && npm run build:firefox
```

## Architecture

### Monorepo Structure

This is an Angular 19 CLI monorepo with three projects:

- **projects/chrome**: Chrome extension (MV3)
- **projects/firefox**: Firefox extension
- **projects/common**: Shared Angular library used by both extensions

### Extension Architecture

The extension follows a three-layer communication model:

1. **Content Script** (`plebian-signer-content-script.ts`): Injected into web pages, bridges messages between page scripts and the background service worker

2. **Injected Script** (`plebian-signer-extension.ts`): Injected into page context, exposes `window.nostr` API to web applications

3. **Background Service Worker** (`background.ts`): Handles NIP-07 requests, manages permissions, performs cryptographic operations

Message flow: Web App → `window.nostr` → Content Script → Background → Content Script → Web App

### Storage Layers

- **BrowserSyncHandler**: Encrypted vault data synced across browser instances (or local-only based on user preference)
- **BrowserSessionHandler**: Session-scoped decrypted data (unlocked vault state)
- **SignerMetaHandler**: Extension metadata (sync flow preference, reckless mode, whitelisted hosts)

Each browser (Chrome/Firefox) has its own handler implementations in `projects/{browser}/src/app/common/data/`.

### Vault Encryption (v2)

The vault uses Argon2id + AES-256-GCM for password-based encryption:
- **Key derivation**: Argon2id with 256MB memory, 4 threads, 8 iterations (~3 second derivation)
- **Encryption**: AES-256-GCM with random 12-byte IV per encryption
- **Salt**: Random 32-byte salt per vault (stored in `BrowserSyncData.salt`)
- The derived key is cached in session storage (`BrowserSessionData.vaultKey`) to avoid re-derivation on each operation

Note: Argon2id runs on main thread via WebAssembly (hash-wasm) because Web Workers cannot load external scripts in browser extensions due to CSP restrictions. A deriving modal provides user feedback during the ~3 second operation.

### Custom Webpack Build

Both extensions use `@angular-builders/custom-webpack` to bundle additional entry points beyond the main Angular app:
- `background.ts` - Service worker
- `plebian-signer-extension.ts` - Page-injected script
- `plebian-signer-content-script.ts` - Content script
- `prompt.ts` - Permission prompt popup
- `options.ts` - Extension options page

### Common Library

The `@common` import alias resolves to `projects/common/src/public-api.ts`. Key exports:
- `StorageService`: Central data management with encryption/decryption
- `CryptoHelper`, `NostrHelper`: Cryptographic utilities (nostr-tools based)
- `Argon2Crypto`: Vault encryption with Argon2id key derivation
- Shared Angular components and pipes

### Permission System

Permissions are stored per identity+host+method combination. The background script checks permissions before executing NIP-07 methods:
- `allow`/`deny` policies can be stored for each method
- Kind-specific permissions supported for `signEvent`
- **Reckless mode**: Auto-approves all actions without prompting (global setting)
- **Whitelisted hosts**: Auto-approves all actions from specific hosts

## Testing Extensions Locally

**Chrome:**
1. Navigate to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `dist/chrome`

**Firefox:**
1. Navigate to `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on..."
4. Select a file in `dist/firefox`

## NIP-07 Methods Implemented

- `getPublicKey()` - Return public key
- `signEvent(event)` - Sign Nostr event
- `getRelays()` - Get configured relays
- `nip04.encrypt/decrypt` - NIP-04 encryption
- `nip44.encrypt/decrypt` - NIP-44 encryption
