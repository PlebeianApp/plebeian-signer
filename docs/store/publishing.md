# Publishing Checklist

Developer accounts are set up. This document covers the remaining steps.

## Privacy Policy URL

```
https://github.com/PlebeianApp/plebeian-signer/blob/main/docs/store/PRIVACY_POLICY.md
```

## Screenshots Needed

Take 3-5 screenshots (1280x800 or 640x400 PNG/JPEG):

1. **Identity view** - Main popup showing profile card with avatar/banner
2. **Permission prompt** - A signing request popup from a Nostr app
3. **Identity list** - Multiple identities with switching UI
4. **Permissions page** - Managing site permissions
5. **Settings** - Vault/reckless mode settings

**Tips:**
- Load the extension in a clean browser profile
- Use real-looking test data, not "test123"
- Crop to show just the popup/relevant UI

---

## Chrome Web Store Submission

1. Go to https://chrome.google.com/webstore/devconsole
2. Click **"New Item"**
3. Upload: `releases/plebeian-signer-chrome-v1.0.5.zip`

### Store Listing Tab

| Field | Value |
|-------|-------|
| Name | Plebeian Signer |
| Summary | Secure Nostr identity manager. Sign events without exposing private keys. Multi-identity support with NIP-07 compatibility. |
| Description | Copy from `docs/store/STORE_DESCRIPTION.md` (full description section) |
| Category | Productivity |
| Language | English |

Upload your screenshots.

### Privacy Tab

| Field | Value |
|-------|-------|
| Single Purpose | Manage Nostr identities and sign cryptographic events for web applications |
| Privacy Policy URL | `https://github.com/PlebeianApp/plebeian-signer/blob/main/docs/store/PRIVACY_POLICY.md` |

**Permission Justifications:**

| Permission | Justification |
|------------|---------------|
| storage | Store encrypted vault containing user's Nostr identities and extension settings |
| activeTab | Inject NIP-07 interface into the active tab when user visits Nostr applications |
| scripting | Enable communication between web pages and the extension for signing requests |

Check: "I do not sell or transfer user data to third parties"

### Distribution Tab

- Visibility: Public
- Regions: All

Click **"Submit for Review"**

---

## Firefox Add-ons Submission

1. Go to https://addons.mozilla.org/developers/
2. Click **"Submit a New Add-on"**
3. Select **"On this site"**
4. Upload: `releases/plebeian-signer-firefox-v1.0.5.zip`

### If Asked for Source Code

Run this to create source zip:
```bash
cd /home/mleku/src/git.mleku.dev/mleku/plebeian-signer
zip -r plebeian-signer-source.zip . -x "node_modules/*" -x "dist/*" -x ".git/*" -x "releases/*"
```

Build instructions to provide:
```
1. npm ci
2. npm run build:firefox
3. Output is in dist/firefox/
```

### Listing Details

| Field | Value |
|-------|-------|
| Name | Plebeian Signer |
| Add-on URL | plebeian-signer |
| Summary | Secure Nostr identity manager. Sign events without exposing private keys. Multi-identity support with NIP-07 compatibility. |
| Description | Copy from `docs/store/STORE_DESCRIPTION.md` |
| Categories | Privacy & Security |
| Homepage | `https://github.com/PlebeianApp/plebeian-signer` |
| Support URL | `https://github.com/PlebeianApp/plebeian-signer/issues` |
| Privacy Policy | `https://github.com/PlebeianApp/plebeian-signer/blob/main/docs/store/PRIVACY_POLICY.md` |

Upload your screenshots.

Click **"Submit Version"**

---

## After Submission

- **Chrome:** 1-3 business days review
- **Firefox:** Hours to 2 days review

Check your email for reviewer questions. Both dashboards show review status.

---

## Updating Later

When you release a new version:

1. Run `/release patch` (or minor/major)
2. Chrome: Dashboard → Your extension → Package → Upload new package
3. Firefox: Developer Hub → Your extension → Upload a New Version
4. Add release notes, submit for review
