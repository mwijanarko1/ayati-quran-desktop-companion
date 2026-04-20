import { describe, expect, it } from 'vitest';

import { AI_PROVIDER_CONFIGS, getAiProviderConfig } from './ai-providers';

describe('AI provider configs', () => {
  it('includes direct API account presets for requested providers', () => {
    expect(AI_PROVIDER_CONFIGS.map((provider) => provider.id)).toEqual([
      'openrouter',
      'openai',
      'gemini',
      'deepseek',
      'anthropic',
      'xai',
      'moonshot',
      'zai',
      'openai-compatible',
    ]);
  });

  it('uses official provider endpoints as defaults', () => {
    expect(getAiProviderConfig('openai').baseUrl).toBe('https://api.openai.com/v1');
    expect(getAiProviderConfig('gemini').baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta/openai');
    expect(getAiProviderConfig('deepseek').baseUrl).toBe('https://api.deepseek.com');
    expect(getAiProviderConfig('anthropic').baseUrl).toBe('https://api.anthropic.com/v1');
    expect(getAiProviderConfig('xai').baseUrl).toBe('https://api.x.ai/v1');
    expect(getAiProviderConfig('moonshot').baseUrl).toBe('https://api.moonshot.ai/v1');
    expect(getAiProviderConfig('zai').baseUrl).toBe('https://api.z.ai/api/paas/v4');
  });

  it('uses Gemma as the bundled free OpenRouter model', () => {
    expect(getAiProviderConfig('openrouter').defaultModel).toBe('google/gemma-4-31b-it:free');
  });
});
