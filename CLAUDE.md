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

## Architecture

### Monorepo Structure

This is an Angular CLI monorepo with three projects:

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
- **SignerMetaHandler**: Extension metadata (sync flow preference)

Each browser (Chrome/Firefox) has its own handler implementations in `projects/{browser}/src/app/common/data/`.

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
- `CryptoHelper`, `NostrHelper`: Cryptographic utilities
- Shared Angular components and pipes

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
