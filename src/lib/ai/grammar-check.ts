import { generateText } from 'ai';
import { getModel } from './providers';
import { GRAMMAR_CHECK_SYSTEM_PROMPT, createGrammarCheckPrompt, REWRITE_SYSTEM_PROMPT, createRewritePrompt } from './prompts';
import type { AIProvider, GrammarSuggestion, GrammarCheckResult } from '@/types';

interface GrammarCheckOptions {
  provider: AIProvider;
  model: string;
  apiKey: string;
  language: string;
}

interface AIGrammarResponse {
  suggestions: Array<{
    original: string;
    replacement: string;
    explanation: string;
    type: 'spelling' | 'grammar' | 'punctuation' | 'style';
    startIndex: number;
    endIndex: number;
  }>;
  detectedLanguage: string;
}

export async function checkGrammar(
  text: string,
  options: GrammarCheckOptions
): Promise<GrammarCheckResult> {
  const { provider, model: modelId, apiKey, language } = options;

  if (!text.trim()) {
    return {
      suggestions: [],
      text,
      language: language === 'auto' ? 'en' : language,
      timestamp: Date.now(),
    };
  }

  try {
    const model = getModel(provider, modelId, apiKey);

    const { text: responseText } = await generateText({
      model,
      system: GRAMMAR_CHECK_SYSTEM_PROMPT,
      prompt: createGrammarCheckPrompt(text, language),
      temperature: 0.1, // Low temperature for consistent results
    });

    // Parse the JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to parse AI response:', responseText);
      return {
        suggestions: [],
        text,
        language: language === 'auto' ? 'en' : language,
        timestamp: Date.now(),
      };
    }

    const parsed: AIGrammarResponse = JSON.parse(jsonMatch[0]);

    // Validate and filter suggestions
    const validSuggestions: GrammarSuggestion[] = parsed.suggestions
      .filter((s) => {
        // Verify the original text matches the actual text at the specified position
        const actualText = text.substring(s.startIndex, s.endIndex);
        return actualText === s.original;
      })
      .map((s, index) => ({
        id: `suggestion-${Date.now()}-${index}`,
        original: s.original,
        replacement: s.replacement,
        explanation: s.explanation,
        type: s.type,
        startIndex: s.startIndex,
        endIndex: s.endIndex,
      }));

    return {
      suggestions: validSuggestions,
      text,
      language: parsed.detectedLanguage || (language === 'auto' ? 'en' : language),
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('Grammar check error:', error);
    throw error;
  }
}

export async function rewriteText(
  text: string,
  style: 'formal' | 'casual' | 'concise' | 'elaborate',
  options: Omit<GrammarCheckOptions, 'language'>
): Promise<string> {
  const { provider, model: modelId, apiKey } = options;

  if (!text.trim()) {
    return text;
  }

  try {
    const model = getModel(provider, modelId, apiKey);

    const { text: rewrittenText } = await generateText({
      model,
      system: REWRITE_SYSTEM_PROMPT,
      prompt: createRewritePrompt(text, style),
      temperature: 0.7, // Higher temperature for creative rewriting
    });

    return rewrittenText.trim();
  } catch (error) {
    console.error('Rewrite error:', error);
    throw error;
  }
}
