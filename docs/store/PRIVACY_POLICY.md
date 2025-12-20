# Plebeian Signer Privacy Policy

**Last Updated:** December 20, 2025

## Overview

Plebeian Signer is a browser extension for managing Nostr identities and signing cryptographic events. This privacy policy explains how we handle your data.

## Data Collection

**We do not collect any personal data.**

Plebeian Signer operates entirely locally within your browser. We do not:
- Collect analytics or telemetry
- Track your usage or behavior
- Send your data to any external servers
- Use cookies or tracking technologies
- Share any information with third parties

## Data Storage

All data is stored locally in your browser using the browser's built-in storage APIs:

### What We Store Locally

1. **Encrypted Vault Data**
   - Your Nostr private keys (encrypted with Argon2id + AES-256-GCM)
   - Identity nicknames and metadata
   - Relay configurations
   - Site permissions

2. **Session Data**
   - Temporary decryption keys (cleared when browser closes or vault locks)
   - Cached profile metadata

3. **Extension Settings**
   - Sync preferences
   - Reckless mode settings
   - Whitelisted hosts

### Encryption

Your private keys are never stored in plaintext. The vault uses:
- **Argon2id** for password-based key derivation (256MB memory, 4 threads, 8 iterations)
- **AES-256-GCM** for authenticated encryption
- **Random salt and IV** generated for each vault

## Network Communications

Plebeian Signer makes the following network requests:

1. **Nostr Relay Connections**
   - To fetch your profile metadata (kind 0 events)
   - To fetch relay lists (kind 10002 events)
   - Only connects to relays you have configured

2. **NIP-05 Verification**
   - Fetches `.well-known/nostr.json` from domains in NIP-05 identifiers
   - Used only to verify identity claims

**We do not operate any servers.** All relay connections are made directly to the Nostr network.

## Permissions Explained

The extension requests these browser permissions:

- **`storage`**: To save your encrypted vault and settings
- **`activeTab`**: To inject the NIP-07 interface into web pages
- **`scripting`**: To enable communication between pages and the extension

## Data Sharing

We do not share any data with third parties. The extension:
- Has no backend servers
- Does not use analytics services
- Does not include advertising
- Does not sell or monetize your data in any way

## Your Control

You have full control over your data:
- **Export**: You can export your encrypted vault at any time
- **Delete**: Use the "Reset Extension" feature to delete all local data
- **Lock**: Lock your vault to clear session data immediately

## Open Source

Plebeian Signer is open source software. You can audit the code yourself:
- Repository: https://git.mleku.dev/mleku/plebeian-signer

## Children's Privacy

This extension is not intended for children under 13 years of age. We do not knowingly collect any information from children.

## Changes to This Policy

If we make changes to this privacy policy, we will update the "Last Updated" date at the top of this document. Significant changes will be noted in the extension's release notes.

## Contact

For privacy-related questions or concerns, please open an issue on our repository:
https://git.mleku.dev/mleku/plebeian-signer/issues

---

## Summary

- All data stays in your browser
- Private keys are encrypted with strong cryptography
- No analytics, tracking, or data collection
- No external servers (except Nostr relays you configure)
- Fully open source and auditable
