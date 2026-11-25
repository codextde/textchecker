import { generateText } from 'ai';
import { getModel } from './providers';
import { requestCodex } from './codex';
import { GRAMMAR_CHECK_SYSTEM_PROMPT, createGrammarCheckPrompt, REWRITE_SYSTEM_PROMPT, createRewritePrompt } from './prompts';
import type { AIProvider, GrammarSuggestion, GrammarCheckResult } from '@/types';

interface GrammarCheckOptions {
  provider: AIProvider;
  model: string;
  apiKey: string;
  language: string;
}

type AIGrammarSuggestion = Omit<GrammarSuggestion, 'id' | 'startIndex' | 'endIndex'> & { line: number };

interface AIGrammarResponse {
  suggestions: AIGrammarSuggestion[];
  detectedLanguage: string;
}

function findUniqueFragment(text: string, original: string): number {
  const index = text.indexOf(original);
  return index >= 0 && text.indexOf(original, index + 1) === -1 ? index : -1;
}

function locateSuggestion(
  suggestion: AIGrammarSuggestion,
  text: string,
  lines: string[],
  lineStarts: number[],
): Omit<GrammarSuggestion, 'id'> | null {
  const { original, replacement, explanation, type, line } = suggestion;
  if (typeof original !== 'string' || !original.trim() || original === replacement) return null;

  const lineIndex = Number.isInteger(line) ? line - 1 : -1;
  const lineText = lines[lineIndex];
  const offset = lineText === undefined ? -1 : findUniqueFragment(lineText, original);
  const startIndex = offset === -1 ? findUniqueFragment(text, original) : lineStarts[lineIndex] + offset;
  const located = { original, replacement, explanation, type, startIndex, endIndex: startIndex + original.length };
  return isValidSuggestion(located, text) ? located : null;
}

export function isValidSuggestion(
  { original, replacement, startIndex, endIndex }: Pick<GrammarSuggestion, 'original' | 'replacement' | 'startIndex' | 'endIndex'>,
  text: string,
): boolean {
  return Number.isInteger(startIndex) && Number.isInteger(endIndex)
    && startIndex >= 0 && startIndex <= endIndex && endIndex <= text.length
    && typeof original === 'string' && typeof replacement === 'string'
    && !/[\r\n]/.test(original) && !/[\r\n]/.test(replacement)
    && text.slice(startIndex, endIndex) === original;
}

export async function checkGrammar(
  text: string,
  options: GrammarCheckOptions
): Promise<GrammarCheckResult> {
  const { language } = options;

  if (!text.trim()) {
    return {
      suggestions: [],
      text,
      language: language === 'auto' ? 'en' : language,
      timestamp: Date.now(),
    };
  }

  try {
    const lines = text.split(/\r\n|\r|\n/);
    let nextStart = 0;
    const lineStarts = lines.map((line) => {
      const start = nextStart;
      const end = start + line.length;
      nextStart = end + (text.startsWith('\r\n', end) ? 2 : 1);
      return start;
    });
    const responseText = await generateWritingText(
      options, GRAMMAR_CHECK_SYSTEM_PROMPT, createGrammarCheckPrompt(lines, language), 0.1,
    );

    // Parse the JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('The model did not return grammar suggestions in the expected format.');
    }

    const parsed: AIGrammarResponse = JSON.parse(jsonMatch[0]);

    const timestamp = Date.now();
    const validSuggestions = parsed.suggestions.flatMap((suggestion, index) => {
      const located = locateSuggestion(suggestion, text, lines, lineStarts);
      return located ? [{ ...located, id: `suggestion-${timestamp}-${index}` }] : [];
    });

    return {
      suggestions: validSuggestions,
      incomplete: validSuggestions.length < parsed.suggestions.length,
      text,
      language: parsed.detectedLanguage || (language === 'auto' ? 'en' : language),
      timestamp,
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
  if (!text.trim()) {
    return text;
  }

  try {
    const rewrittenText = await generateWritingText(
      options, REWRITE_SYSTEM_PROMPT, createRewritePrompt(text, style), 0.7,
    );

    return rewrittenText.trim();
  } catch (error) {
    console.error('Rewrite error:', error);
    throw error;
  }
}

async function generateWritingText(
  { provider, model, apiKey }: Omit<GrammarCheckOptions, 'language'>,
  system: string,
  prompt: string,
  temperature: number,
): Promise<string> {
  if (provider === 'codex') {
    const response = await requestCodex({ type: 'generate', model, instructions: system, prompt });
    if (typeof response.text !== 'string') {
      throw new Error('The Codex bridge returned an invalid response.');
    }
    return response.text;
  }

  const result = await generateText({ model: getModel(provider, model, apiKey), system, prompt, temperature });
  return result.text;
}
