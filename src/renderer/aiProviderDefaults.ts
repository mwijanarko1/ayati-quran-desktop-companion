export {
  AI_PROVIDER_CONFIGS,
  DEFAULT_AI_PROVIDER,
  getAiProviderConfig,
  getDefaultAiProviderBaseUrl,
  getDefaultAiProviderModel,
  type ClawBotProvider,
} from '../main/ai-providers';
import {
  DEFAULT_AI_PROVIDER,
  getDefaultAiProviderBaseUrl,
  getDefaultAiProviderModel,
} from '../main/ai-providers';

export const DEFAULT_OPENROUTER_BASE_URL = getDefaultAiProviderBaseUrl(DEFAULT_AI_PROVIDER);
export const DEFAULT_OPENROUTER_MODEL = getDefaultAiProviderModel(DEFAULT_AI_PROVIDER);
