import type { Configuration } from 'webpack';

module.exports = {
  entry: {
    background: {
      import: 'src/background.ts',
      runtime: false,
    },
    'plebian-signer-extension': {
      import: 'src/plebian-signer-extension.ts',
      runtime: false,
    },
    'plebian-signer-content-script': {
      import: 'src/plebian-signer-content-script.ts',
      runtime: false,
    },
    prompt: {
      import: 'src/prompt.ts',
      runtime: false,
    },
    options: {
      import: 'src/options.ts',
      runtime: false,
    },
    unlock: {
      import: 'src/unlock.ts',
      runtime: false,
    },
  },
} as Configuration;
