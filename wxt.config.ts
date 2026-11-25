import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    ...(browser === 'firefox' ? {
      browser_specific_settings: { gecko: { id: 'textchecker@codextde.github.io' } },
    } : {
      key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxorixDZjYZ5KMeXo9E//ZKWqP9eDvK72LxZAy8qkaqnUpwLmnMsOChwsKljdqBbT6HL12l8Qs2F00+BLK6oGQ/E5unRwxTx19AIMVTBeG7TrcOedDxfCElyblU/2Zhmuqcp674+VJUf4IK5flDOJwUP9hiApZMqnWdRuj7qvuvlXPHIDWbyAOQu6amd04ExXCGHWLtwOVbtfz0/MZe+GqZGRzi0AHLEElFqUeU1OXETs0FnMkLnNFCj7dVsNXajRCuiYnBowECY1joE11Uw1MI1AS9mDfVXH23EEwWgYyu1MxwlR+a+UO3S0Lo9Iu85w6hlxMOJOEKiu4p6zv4odrwIDAQAB',
    }),
    name: 'TextChecker - AI Grammar Assistant',
    description: 'Open-source AI-powered grammar, spelling, and style checker. Supports multiple AI providers.',
    version: '1.0.0',
    permissions: ['storage', 'activeTab', 'nativeMessaging'],
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
  }),
  vite: () => ({
    plugins: [react()],
  }),
});
