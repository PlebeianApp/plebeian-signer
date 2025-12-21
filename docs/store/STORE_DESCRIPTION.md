# Plebeian Signer - Store Description

Use this content for Chrome Web Store and Firefox Add-ons listings.

---

## Short Description (132 characters max for Chrome)

Secure Nostr identity manager. Sign events without exposing private keys. Multi-identity support with NIP-07 compatibility.

---

## Full Description

**Plebeian Signer** is a secure browser extension for managing your Nostr identities and signing events without exposing your private keys to web applications.

### Key Features

**Multi-Identity Management**
- Create and manage multiple Nostr identities from a single extension
- Easily switch between identities with one click
- Import existing keys or generate new ones

**Bank-Grade Security**
- Private keys never leave the extension
- Vault encrypted with Argon2id + AES-256-GCM (the same algorithms used by password managers)
- Automatic vault locking for protection

**NIP-07 Compatible**
- Works with all Nostr web applications that support NIP-07
- Supports NIP-04 and NIP-44 encryption/decryption
- Relay configuration per identity

**Permission Control**
- Fine-grained permission management per application
- Approve or deny signing requests on a per-site basis
- Optional "Reckless Mode" for trusted applications
- Whitelist trusted hosts for automatic approval

**User-Friendly Interface**
- Clean, intuitive design
- Profile metadata display with avatar and banner
- NIP-05 verification support
- Bookmark your favorite Nostr apps

### How It Works

1. Create a password-protected vault
2. Add your Nostr identities (import existing or generate new)
3. Visit any NIP-07 compatible Nostr application
4. Approve signing requests through the extension popup

### Privacy First

Plebeian Signer is open source and respects your privacy:
- No telemetry or analytics
- No external servers (except for profile metadata from Nostr relays)
- All cryptographic operations happen locally in your browser
- Your private keys are encrypted and never transmitted

### Supported NIPs

- NIP-07: Browser Extension for Nostr
- NIP-04: Encrypted Direct Messages
- NIP-44: Versioned Encryption

### Links

- Source Code: https://github.com/PlebeianApp/plebeian-signer
- Report Issues: https://github.com/PlebeianApp/plebeian-signer/issues

---

## Category Suggestions

**Chrome Web Store:**
- Primary: Productivity
- Secondary: Developer Tools

**Firefox Add-ons:**
- Primary: Privacy & Security
- Secondary: Other

---

## Tags/Keywords

nostr, nip-07, signing, identity, privacy, encryption, decentralized, keys, wallet, security
