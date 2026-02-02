import { checkGrammar, rewriteText } from '@/lib/ai/grammar-check';
import { settingsStorage, apiKeysStorage, getCachedResult, setCachedResult, incrementStats, dictionaryStorage } from '@/lib/storage';
import type { GrammarSuggestion } from '@/types';

export default defineBackground(() => {
  console.log('TextChecker background script loaded');

  // Handle messages from content scripts and popup
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message, sendResponse);
    return true; // Keep the message channel open for async response
  });

  // Handle keyboard shortcut
  browser.commands.onCommand.addListener(async (command) => {
    if (command === 'check-grammar') {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        browser.tabs.sendMessage(tab.id, { type: 'TRIGGER_CHECK' });
      }
    }
  });

  async function handleMessage(
    message: { type: string; payload?: unknown },
    sendResponse: (response: unknown) => void
  ) {
    try {
      switch (message.type) {
        case 'CHECK_GRAMMAR': {
          const { text, forceCheck } = message.payload as { text: string; forceCheck?: boolean };

          // Check cache first (unless force check is requested)
          if (!forceCheck) {
            const cached = await getCachedResult(text);
            if (cached) {
              sendResponse({ success: true, result: cached.result });
              return;
            }
          }

          // Get settings and API keys
          const settings = await settingsStorage.getValue();
          const apiKeys = await apiKeysStorage.getValue();
          const apiKey = apiKeys[settings.provider];

          if (!apiKey) {
            sendResponse({
              success: false,
              error: `No API key configured for ${settings.provider}. Please add your API key in the extension settings.`,
            });
            return;
          }

           // Perform grammar check - use customModel if model is 'custom'
           const modelId = settings.model === 'custom' ? settings.customModel : settings.model;
           const result = await checkGrammar(text, {
             provider: settings.provider,
             model: modelId || settings.model,
             apiKey,
             language: settings.language,
           });

          // Filter out words in personal dictionary
          const dictionary = await dictionaryStorage.getValue();
          result.suggestions = result.suggestions.filter((s: GrammarSuggestion) => {
            if (s.type === 'spelling') {
              return !dictionary.includes(s.original.toLowerCase());
            }
            return true;
          });

          // Cache the result
          await setCachedResult(text, {
            text,
            result,
            timestamp: Date.now(),
          });

          // Update stats
          await incrementStats('checksPerformed');
          await incrementStats('errorsFound', result.suggestions.length);

          sendResponse({ success: true, result });
          break;
        }

        case 'REWRITE_TEXT': {
          const { text, style } = message.payload as {
            text: string;
            style: 'formal' | 'casual' | 'concise' | 'elaborate';
          };

          const settings = await settingsStorage.getValue();
          const apiKeys = await apiKeysStorage.getValue();
          const apiKey = apiKeys[settings.provider];

          if (!apiKey) {
            sendResponse({
              success: false,
              error: `No API key configured for ${settings.provider}.`,
            });
            return;
          }

           const modelId = settings.model === 'custom' ? settings.customModel : settings.model;
           const rewritten = await rewriteText(text, style, {
             provider: settings.provider,
             model: modelId || settings.model,
             apiKey,
           });

          sendResponse({ success: true, result: rewritten });
          break;
        }

        case 'GET_SETTINGS': {
          const settings = await settingsStorage.getValue();
          const apiKeys = await apiKeysStorage.getValue();
          sendResponse({
            success: true,
            settings,
            hasApiKey: {
              google: !!apiKeys.google,
              openai: !!apiKeys.openai,
              anthropic: !!apiKeys.anthropic,
            },
          });
          break;
        }

        case 'ADD_TO_DICTIONARY': {
          const { word } = message.payload as { word: string };
          const dictionary = await dictionaryStorage.getValue();
          if (!dictionary.includes(word.toLowerCase())) {
            await dictionaryStorage.setValue([...dictionary, word.toLowerCase()]);
          }
          sendResponse({ success: true });
          break;
        }

        case 'CORRECTION_APPLIED': {
          await incrementStats('correctionsApplied');
          sendResponse({ success: true });
          break;
        }

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Background script error:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  }
});
