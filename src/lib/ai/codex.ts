const HOST = 'com.textchecker.codex';

type CodexRequest =
  | { type: 'status' | 'models' }
  | { type: 'generate'; model: string; instructions: string; prompt: string };

export interface CodexModel {
  id: string;
  name: string;
  isDefault: boolean;
}

interface CodexResponse {
  success: boolean;
  text?: string;
  models?: CodexModel[];
  error?: string;
}

export async function requestCodex(request: CodexRequest): Promise<CodexResponse> {
  let response: CodexResponse;
  try {
    response = await browser.runtime.sendNativeMessage(HOST, request);
  } catch {
    throw new Error('Install or update the TextChecker Codex bridge for this browser.');
  }

  if (!response?.success) {
    throw new Error(response?.error || 'The Codex bridge could not complete the request.');
  }
  return response;
}
