import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { APIKeys } from '@/types';

export function createAIProvider(provider: keyof APIKeys, apiKey: string) {
  switch (provider) {
    case 'google':
      return createGoogleGenerativeAI({ apiKey });
    case 'openai':
      return createOpenAI({ apiKey });
    case 'anthropic':
      return createAnthropic({ apiKey });
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export function getModel(provider: keyof APIKeys, modelId: string, apiKey: string) {
  const aiProvider = createAIProvider(provider, apiKey);

  switch (provider) {
    case 'google':
      return aiProvider(modelId);
    case 'openai':
      return aiProvider(modelId);
    case 'anthropic':
      return aiProvider(modelId);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
