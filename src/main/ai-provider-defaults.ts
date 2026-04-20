import {
  DEFAULT_AI_PROVIDER,
  getDefaultAiProviderBaseUrl,
  getDefaultAiProviderModel,
  type ClawBotProvider,
} from './ai-providers';

export { DEFAULT_AI_PROVIDER };

export const DEFAULT_OPENROUTER_BASE_URL = getDefaultAiProviderBaseUrl(DEFAULT_AI_PROVIDER);
export const DEFAULT_OPENROUTER_MODEL = getDefaultAiProviderModel(DEFAULT_AI_PROVIDER);

export function getDefaultClawBotModel(_provider?: ClawBotProvider): string {
  return getDefaultAiProviderModel(_provider ?? DEFAULT_AI_PROVIDER);
}

export function getDefaultOpenRouterToken(): string {
  return '';
}
