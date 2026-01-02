# Privacy Policy

**Plebeian Signer** is a browser extension for managing Nostr identities and signing events. This privacy policy explains how the extension handles your data.

## Data Collection

**Plebeian Signer does not collect, store, or transmit any user data to external servers.**

All data remains on your device under your control.

## Data Storage

The extension stores the following data locally in your browser:

- **Encrypted vault**: Your Nostr private keys, encrypted with your password using Argon2id + AES-256-GCM
- **Identity metadata**: Display names, profile information you configure
- **Permissions**: Your allow/deny decisions for websites
- **Cashu wallet data**: Mint connections and ecash tokens you store
- **Preferences**: Extension settings (sync mode, reckless mode, etc.)

This data is stored using your browser's built-in storage APIs and never leaves your device unless you enable browser sync (in which case it syncs through your browser's own sync service, not ours).

## External Connections

The extension only makes external network requests in the following cases:

1. **Cashu mints**: When you explicitly add a Cashu mint and perform wallet operations (deposit, send, receive), the extension connects to that mint's URL. You choose which mints to connect to.

2. **No other external connections**: The extension does not connect to any analytics services, tracking pixels, telemetry endpoints, or any servers operated by the developers.

## Third-Party Services

Plebeian Signer does not integrate with any third-party services. The only external services involved are:

- **Cashu mints**: User-configured ecash mints for wallet functionality
- **Browser sync** (optional): Your browser's native sync service if you enable vault syncing

## Data Sharing

We do not share any data because we do not have access to any data. Your private keys and all extension data remain encrypted on your device.

## Security

- Private keys are encrypted at rest using Argon2id key derivation and AES-256-GCM encryption
- Keys are never exposed to websites — only signatures are provided
- The vault locks automatically and requires your password to unlock

## Your Rights

Since all data is stored locally on your device:

- **Access**: View your data anytime in the extension
- **Delete**: Uninstall the extension or clear browser data to remove all stored data
- **Export**: Use the extension's export features to backup your data

## Changes to This Policy

Any changes to this privacy policy will be reflected in the extension's repository and release notes.

## Contact

For questions about this privacy policy, please open an issue at the project repository.

---

**Last updated**: January 2026

**Extension**: Plebeian Signer v1.1.5
