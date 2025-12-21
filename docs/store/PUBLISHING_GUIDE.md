# Extension Store Publishing Guide

This guide walks you through publishing Plebeian Signer to the Chrome Web Store and Firefox Add-ons.

---

## Table of Contents

1. [Assets You Need to Create](#assets-you-need-to-create)
2. [Chrome Web Store](#chrome-web-store)
3. [Firefox Add-ons](#firefox-add-ons)
4. [Ongoing Maintenance](#ongoing-maintenance)

---

## Assets You Need to Create

Before submitting to either store, prepare these assets:

### Screenshots (Required for both stores)

Create 3-5 screenshots showing the extension in action:

1. **Main popup view** - Show the identity card with profile info
2. **Permission prompt** - Show a signing request popup
3. **Identity management** - Show the identity list/switching
4. **Permissions page** - Show the permissions management
5. **Settings page** - Show vault settings and options

**Specifications:**
- Chrome: 1280x800 or 640x400 pixels (PNG or JPEG)
- Firefox: 1280x800 recommended (PNG or JPEG)

**Tips:**
- Use a clean browser profile
- Show realistic data (not "test" or placeholder text)
- Capture the full popup or relevant UI area
- Consider adding captions/annotations

### Promotional Images (Chrome only)

Chrome Web Store uses promotional tiles:

| Size | Name | Required |
|------|------|----------|
| 440x280 | Small promo tile | Optional but recommended |
| 920x680 | Large promo tile | Optional |
| 1400x560 | Marquee promo tile | Optional |

**Design tips:**
- Include the extension icon/logo
- Add a tagline like "Secure Nostr Identity Manager"
- Use brand colors
- Keep text minimal and readable

### Icon (Already exists)

You already have icons in the extension:
- `icon-48.png` - 48x48
- `icon-128.png` - 128x128

Chrome also wants a 128x128 icon for the store listing (can use the same one).

### Privacy Policy URL

You need to host the privacy policy at a public URL. Options:

1. **GitHub/Gitea Pages** - Host `PRIVACY_POLICY.md` as a webpage
2. **Simple webpage** - Create a basic HTML page
3. **Gist** - Create a public GitHub gist

Example URL format: `https://github.com/PlebeianApp/plebeian-signer/blob/main/docs/store/PRIVACY_POLICY.md`

---

## Chrome Web Store

### Step 1: Create Developer Account

1. Go to https://chrome.google.com/webstore/devconsole
2. Sign in with a Google account
3. Pay the one-time $5 USD registration fee
4. Accept the developer agreement

### Step 2: Create New Item

1. Click **"New Item"** button
2. Upload `releases/plebeian-signer-chrome-v1.0.5.zip`
3. Wait for the upload to process

### Step 3: Fill Store Listing

**Product Details:**
- **Name:** Plebeian Signer
- **Summary:** Copy from `STORE_DESCRIPTION.md` (short description, 132 chars max)
- **Description:** Copy from `STORE_DESCRIPTION.md` (full description)
- **Category:** Productivity
- **Language:** English

**Graphic Assets:**
- Upload your screenshots (at least 1 required, up to 5)
- Upload promotional tiles if you have them

**Additional Fields:**
- **Official URL:** `https://github.com/PlebeianApp/plebeian-signer`
- **Support URL:** `https://github.com/PlebeianApp/plebeian-signer/issues`

### Step 4: Privacy Tab

- **Single Purpose:** "Manage Nostr identities and sign cryptographic events for web applications"
- **Permission Justifications:**
  - `storage`: "Store encrypted vault containing user's Nostr identities and extension settings"
  - `activeTab`: "Inject NIP-07 interface into the active tab when user visits Nostr applications"
  - `scripting`: "Enable communication between web pages and the extension for signing requests"
- **Data Usage:** Check "I do not sell or transfer user data to third parties"
- **Privacy Policy URL:** Your hosted privacy policy URL

### Step 5: Distribution

- **Visibility:** Public
- **Distribution:** All regions (or select specific ones)

### Step 6: Submit for Review

1. Review all sections show green checkmarks
2. Click **"Submit for Review"**
3. Wait 1-3 business days (can take longer for first submission)

### Chrome Review Notes

Google may ask about:
- Why you need each permission
- How you handle user data
- Your identity/organization

Be prepared to respond to reviewer questions via the dashboard.

---

## Firefox Add-ons

### Step 1: Create Developer Account

1. Go to https://addons.mozilla.org/developers/
2. Sign in with a Firefox account (create one if needed)
3. No fee required

### Step 2: Submit New Add-on

1. Click **"Submit a New Add-on"**
2. Select **"On this site"** for hosting
3. Upload `releases/plebeian-signer-firefox-v1.0.5.zip`
4. Wait for automated validation

### Step 3: Source Code Submission

Firefox may request source code because the extension uses bundled/minified JavaScript.

**If prompted:**
1. Create a source code zip (exclude `node_modules`):
   ```bash
   cd /home/mleku/src/git.mleku.dev/mleku/plebeian-signer
   zip -r plebeian-signer-source.zip . -x "node_modules/*" -x "dist/*" -x ".git/*"
   ```
2. Upload this zip when asked
3. Include build instructions (point to CLAUDE.md or add a note):
   ```
   Build Instructions:
   1. npm ci
   2. npm run build:firefox
   3. Output is in dist/firefox/
   ```

### Step 4: Fill Listing Details

**Basic Information:**
- **Name:** Plebeian Signer
- **Add-on URL:** `plebeian-signer` (creates addons.mozilla.org/addon/plebeian-signer)
- **Summary:** Copy short description from `STORE_DESCRIPTION.md`
- **Description:** Copy full description (supports some HTML/Markdown)
- **Categories:** Privacy & Security

**Additional Details:**
- **Homepage:** `https://github.com/PlebeianApp/plebeian-signer`
- **Support URL:** `https://github.com/PlebeianApp/plebeian-signer/issues`
- **License:** Select appropriate license
- **Privacy Policy:** Paste URL to hosted privacy policy

**Media:**
- **Icon:** Already in the extension manifest
- **Screenshots:** Upload your screenshots

### Step 5: Submit for Review

1. Ensure all required fields are complete
2. Click **"Submit Version"**
3. Wait for review (usually hours to a few days)

### Firefox Review Notes

Firefox reviewers are generally faster but thorough. They may:
- Ask for source code (see Step 3)
- Question specific code patterns
- Request changes for policy compliance

---

## Ongoing Maintenance

### Updating the Extension

**For new releases:**

1. Build new version: `/release patch` (or `minor`/`major`)
2. Upload the new zip to each store
3. Add release notes describing changes
4. Submit for review

**Chrome:**
- Go to Developer Dashboard → Your extension → Package → Upload new package

**Firefox:**
- Go to Developer Hub → Your extension → Upload a New Version

### Responding to Reviews

Both stores may contact you with:
- Policy violation notices
- User reports
- Review questions

Monitor your developer email and respond promptly.

### Version Numbering

Both stores extract the version from `manifest.json`. Your current setup with `v1.0.5` in `package.json` feeds into the manifests correctly.

---

## Checklist

### Before First Submission

- [ ] Create 3-5 screenshots
- [ ] Create promotional images (Chrome, optional but recommended)
- [ ] Host privacy policy at a public URL
- [ ] Test the extension zip by loading it unpacked
- [ ] Prepare source code zip for Firefox

### Chrome Web Store

- [ ] Register developer account ($5)
- [ ] Upload extension zip
- [ ] Fill all required listing fields
- [ ] Add screenshots
- [ ] Add privacy policy URL
- [ ] Justify all permissions
- [ ] Submit for review

### Firefox Add-ons

- [ ] Register developer account (free)
- [ ] Upload extension zip
- [ ] Upload source code if requested
- [ ] Fill all required listing fields
- [ ] Add screenshots
- [ ] Add privacy policy URL
- [ ] Submit for review

---

## Helpful Links

- Chrome Developer Dashboard: https://chrome.google.com/webstore/devconsole
- Chrome Publishing Docs: https://developer.chrome.com/docs/webstore/publish/
- Firefox Developer Hub: https://addons.mozilla.org/developers/
- Firefox Extension Workshop: https://extensionworkshop.com/documentation/publish/

---

## Estimated Timeline

| Task | Time |
|------|------|
| Create screenshots | 30 min - 1 hour |
| Create promotional images | 1-2 hours (optional) |
| Host privacy policy | 15 min |
| Chrome submission | 30 min |
| Chrome review | 1-3 business days |
| Firefox submission | 30 min |
| Firefox review | Hours to 2 days |

**Total:** You can have both submissions done in an afternoon, with approvals coming within a week.
