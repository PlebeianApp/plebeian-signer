# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Plebeian Signer is a browser extension for managing multiple Nostr identities and signing events without exposing private keys to web applications. It implements NIP-07 (window.nostr interface) with support for NIP-04 and NIP-44 encryption.

## Package Manager

This project uses **bun** (not npm). All commands below use `bun`.

## Build Commands

```bash
bun install                # Install dependencies
bun run build:chrome       # Build Chrome extension (outputs to dist/chrome)
bun run build:firefox      # Build Firefox extension (outputs to dist/firefox)
bun run watch:chrome       # Development build with watch mode for Chrome
bun run watch:firefox      # Development build with watch mode for Firefox
bun test                   # Run unit tests with Karma
bun run lint               # Run ESLint
```

**Important:** After making any code changes, rebuild both extensions before testing:
```bash
bun run build:chrome && bun run build:firefox
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

## Store Submission (Automated Release)

The `/release` command can optionally submit builds to Chrome Web Store and Firefox Add-ons after pushing the git tag. This requires environment variables to be set.

### Chrome Web Store Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or use an existing one)
3. Enable the **Chrome Web Store API**
4. Go to **Credentials** > **Create Credentials** > **OAuth client ID**
   - Application type: **Desktop app**
   - Note the **Client ID** and **Client Secret**
5. Generate a refresh token:
   - Visit: `https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&client_id=YOUR_CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob`
   - Authorize and copy the code
   - Exchange the code:
     ```bash
     curl "https://oauth2.googleapis.com/token" \
       -d "client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&code=YOUR_CODE&grant_type=authorization_code&redirect_uri=urn:ietf:wg:oauth:2.0:oob"
     ```
   - Note the `refresh_token` from the response
6. Find your extension ID from the Chrome Web Store developer dashboard URL

**Environment variables:**
```bash
export CWS_CLIENT_ID="your-client-id"
export CWS_CLIENT_SECRET="your-client-secret"
export CWS_REFRESH_TOKEN="your-refresh-token"
export CWS_EXTENSION_ID="your-extension-id"
```

### Firefox AMO Setup

1. Go to [AMO Developer Hub](https://addons.mozilla.org/en-US/developers/)
2. Navigate to **Manage API Keys** (under your account)
3. Generate a new set of credentials
   - Note the **JWT issuer** (API key) and **JWT secret**
4. The extension ID is already defined in the Firefox manifest as `plebian-signer@mleku.dev`

**Environment variables:**
```bash
export AMO_JWT_ISSUER="your-jwt-issuer"
export AMO_JWT_SECRET="your-jwt-secret"
export AMO_EXTENSION_ID="plebian-signer@mleku.dev"
```

### Release Workflow

The `/release` command performs:
1. Bump version in `package.json` (all three version fields)
2. Run lint + build both extensions
3. Create release zip files in `releases/`
4. Commit, tag, and push to origin
5. (Optional) Submit to Chrome Web Store if `CWS_*` env vars are set
6. (Optional) Submit to Firefox AMO if `AMO_*` env vars are set

Store submission is optional -- if credentials are not configured, the release proceeds normally without submitting to stores.
