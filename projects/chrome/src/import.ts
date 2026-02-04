import browser from 'webextension-polyfill';

interface ImportResponse {
  success?: boolean;
  error?: string;
}

const params = new URLSearchParams(location.search);
const action = params.get('action') ?? 'import'; // 'import' or 'snapshot'

const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const pickButton = document.getElementById('pickButton') as HTMLButtonElement;
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

let pickerOpen = false;

pickButton.addEventListener('click', () => {
  pickerOpen = true;
  fileInput.click();
});

fileInput.addEventListener('change', async () => {
  pickerOpen = false;
  const file = fileInput.files?.[0];
  if (!file) {
    window.close();
    return;
  }

  try {
    const text = await file.text();
    const vault = JSON.parse(text);

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
        showSuccess('Vault file added.');
        setTimeout(() => window.close(), 600);
      } else {
        showError(response?.error ?? 'Failed to add vault snapshot.');
      }
    } else {
      const response = await browser.runtime.sendMessage({
        type: 'import-vault-data',
        vault,
        filename: file.name,
      }) as ImportResponse;
      if (response?.success) {
        showSuccess('Vault imported. Extension reloading...');
      } else {
        showError(response?.error ?? 'Failed to import vault.');
      }
    }
  } catch {
    showError('Failed to read file. Make sure it is a valid JSON vault export.');
  }
});

// When window regains focus after the file picker closes, if no file was
// selected the change event won't fire. Close the window in that case.
window.addEventListener('focus', () => {
  if (!pickerOpen) return;
  setTimeout(() => {
    if (!fileInput.files?.length) {
      window.close();
    }
    pickerOpen = false;
  }, 300);
});
