import browser from 'webextension-polyfill';

export interface UnlockRequestMessage {
  type: 'unlock-request';
  id: string;
  password: string;
}

export interface UnlockResponseMessage {
  type: 'unlock-response';
  id: string;
  success: boolean;
  error?: string;
}

const params = new URLSearchParams(location.search);
const id = params.get('id') as string;
const host = params.get('host');

// Elements
const passwordInput = document.getElementById('passwordInput') as HTMLInputElement;
const togglePasswordBtn = document.getElementById('togglePassword');
const unlockBtn = document.getElementById('unlockBtn') as HTMLButtonElement;
const derivingOverlay = document.getElementById('derivingOverlay');
const errorAlert = document.getElementById('errorAlert');
const errorMessage = document.getElementById('errorMessage');
const hostInfo = document.getElementById('hostInfo');
const hostSpan = document.getElementById('hostSpan');

// Show host info if available
if (host && hostInfo && hostSpan) {
  hostSpan.innerText = host;
  hostInfo.classList.remove('hidden');
}

// Toggle password visibility
togglePasswordBtn?.addEventListener('click', () => {
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    togglePasswordBtn.innerHTML = '<i class="bi bi-eye-slash"></i>';
  } else {
    passwordInput.type = 'password';
    togglePasswordBtn.innerHTML = '<i class="bi bi-eye"></i>';
  }
});

// Enable/disable unlock button based on password input
passwordInput?.addEventListener('input', () => {
  unlockBtn.disabled = !passwordInput.value;
});

// Handle enter key
passwordInput?.addEventListener('keyup', (e) => {
  if (e.key === 'Enter' && passwordInput.value) {
    attemptUnlock();
  }
});

// Handle unlock button click
unlockBtn?.addEventListener('click', attemptUnlock);

async function attemptUnlock() {
  if (!passwordInput?.value) return;

  // Show deriving overlay
  derivingOverlay?.classList.remove('hidden');
  errorAlert?.classList.add('hidden');

  const message: UnlockRequestMessage = {
    type: 'unlock-request',
    id,
    password: passwordInput.value,
  };

  try {
    const response = await browser.runtime.sendMessage(message) as UnlockResponseMessage;

    if (response.success) {
      // Success - close the window
      window.close();
    } else {
      // Failed - show error
      derivingOverlay?.classList.add('hidden');
      showError(response.error || 'Invalid password');
    }
  } catch (error) {
    console.error('Failed to send unlock message:', error);
    derivingOverlay?.classList.add('hidden');
    showError('Failed to unlock vault');
  }
}

function showError(message: string) {
  if (errorAlert && errorMessage) {
    errorMessage.innerText = message;
    errorAlert.classList.remove('hidden');
    setTimeout(() => {
      errorAlert.classList.add('hidden');
    }, 3000);
  }
}

// Focus password input on load
document.addEventListener('DOMContentLoaded', () => {
  passwordInput?.focus();
});
