import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'TextChecker - AI Grammar Assistant',
    description: 'Open-source AI-powered grammar, spelling, and style checker. Supports multiple AI providers.',
    version: '1.0.0',
    permissions: ['storage', 'activeTab'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'TextChecker',
    },
    commands: {
      'check-grammar': {
        suggested_key: {
          default: 'Ctrl+Shift+G',
          mac: 'Command+Shift+G',
        },
        description: 'Check grammar in current text field',
      },
    },
  },
  vite: () => ({
    plugins: [react()],
  }),
});
