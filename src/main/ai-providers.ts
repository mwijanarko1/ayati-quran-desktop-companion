export type ClawBotProvider =
  | 'openrouter'
  | 'openai'
  | 'gemini'
  | 'deepseek'
  | 'anthropic'
  | 'xai'
  | 'moonshot'
  | 'zai'
  | 'openai-compatible';

export type AiProviderProtocol = 'openai-chat-completions' | 'anthropic-messages';

export interface AiProviderConfig {
  id: ClawBotProvider;
  label: string;
  baseUrl: string;
  defaultModel: string;
  protocol: AiProviderProtocol;
  apiKeyLabel: string;
}

export const AI_PROVIDER_CONFIGS: AiProviderConfig[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemma-4-31b-it:free',
    protocol: 'openai-chat-completions',
    apiKeyLabel: 'OpenRouter API Key',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.2',
    protocol: 'openai-chat-completions',
    apiKeyLabel: 'OpenAI API Key',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3-flash-preview',
    protocol: 'openai-chat-completions',
    apiKeyLabel: 'Gemini API Key',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    protocol: 'openai-chat-completions',
    apiKeyLabel: 'DeepSeek API Key',
  },
  {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    protocol: 'anthropic-messages',
    apiKeyLabel: 'Anthropic API Key',
  },
  {
    id: 'xai',
    label: 'Grok (xAI)',
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4.20-reasoning',
    protocol: 'openai-chat-completions',
    apiKeyLabel: 'xAI API Key',
  },
  {
    id: 'moonshot',
    label: 'Kimi (Moonshot AI)',
    baseUrl: 'https://api.moonshot.ai/v1',
    defaultModel: 'kimi-k2.5',
    protocol: 'openai-chat-completions',
    apiKeyLabel: 'Moonshot API Key',
  },
  {
    id: 'zai',
    label: 'GLM (Z.AI)',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    defaultModel: 'glm-5.1',
    protocol: 'openai-chat-completions',
    apiKeyLabel: 'Z.AI API Key',
  },
  {
    id: 'openai-compatible',
    label: 'Custom OpenAI-Compatible',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: '',
    protocol: 'openai-chat-completions',
    apiKeyLabel: 'API Key',
  },
];

const AI_PROVIDER_CONFIG_BY_ID = new Map(
  AI_PROVIDER_CONFIGS.map((provider) => [provider.id, provider]),
);

export const DEFAULT_AI_PROVIDER: ClawBotProvider = 'openrouter';

export function normalizeClawBotProvider(provider: unknown): ClawBotProvider {
  if (typeof provider !== 'string') {
    return DEFAULT_AI_PROVIDER;
  }

  if (provider === 'openclaw') {
    return DEFAULT_AI_PROVIDER;
  }

  if (AI_PROVIDER_CONFIG_BY_ID.has(provider as ClawBotProvider)) {
    return provider as ClawBotProvider;
  }

  return DEFAULT_AI_PROVIDER;
}

export function getAiProviderConfig(provider: unknown): AiProviderConfig {
  const normalizedProvider = normalizeClawBotProvider(provider);
  return AI_PROVIDER_CONFIG_BY_ID.get(normalizedProvider) ?? AI_PROVIDER_CONFIGS[0];
}

export function getDefaultAiProviderBaseUrl(provider: unknown): string {
  return getAiProviderConfig(provider).baseUrl;
}

export function getDefaultAiProviderModel(provider: unknown): string {
  return getAiProviderConfig(provider).defaultModel;
}
