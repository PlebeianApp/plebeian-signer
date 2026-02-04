import browser from 'webextension-polyfill';

interface ImportResponse {
  success?: boolean;
  error?: string;
}

const params = new URLSearchParams(location.search);
const action = params.get('action') ?? 'import'; // 'import' or 'snapshot'

const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const pickButton = document.getElementById('pickButton') as HTMLButtonElement;
const cancelButton = document.getElementById('cancelButton') as HTMLButtonElement;
const errorSpan = document.getElementById('error') as HTMLSpanElement;
const successSpan = document.getElementById('success') as HTMLSpanElement;

function showError(msg: string) {
  errorSpan.textContent = msg;
  errorSpan.style.display = 'block';
  successSpan.style.display = 'none';
}

function showSuccess(msg: string) {
  successSpan.textContent = msg;
  successSpan.style.display = 'block';
  errorSpan.style.display = 'none';
}

pickButton.addEventListener('click', () => {
  fileInput.click();
});

cancelButton.addEventListener('click', () => {
  window.close();
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const vault = JSON.parse(text);

    // Basic validation: must have identities array and version
    if (!vault.identities || !Array.isArray(vault.identities)) {
      showError('Invalid vault file: missing identities.');
      return;
    }

    if (action === 'snapshot') {
      const response = await browser.runtime.sendMessage({
        type: 'add-vault-snapshot',
        vault,
        filename: file.name,
      }) as ImportResponse;
      if (response?.success) {
        showSuccess('Vault file added. You can close this window.');
        setTimeout(() => window.close(), 800);
      } else {
        showError(response?.error ?? 'Failed to add vault snapshot.');
      }
    } else {
      // Direct import - replace current vault
      const response = await browser.runtime.sendMessage({
        type: 'import-vault-data',
        vault,
        filename: file.name,
      }) as ImportResponse;
      if (response?.success) {
        showSuccess('Vault imported. Extension reloading...');
        // Background will reload the extension
      } else {
        showError(response?.error ?? 'Failed to import vault.');
      }
    }
  } catch {
    showError('Failed to read file. Make sure it is a valid JSON vault export.');
  }

  // Reset input so same file can be selected again
  fileInput.value = '';
});
