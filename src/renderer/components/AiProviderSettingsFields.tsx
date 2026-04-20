import {
  AI_PROVIDER_CONFIGS,
  DEFAULT_OPENROUTER_BASE_URL,
  DEFAULT_OPENROUTER_MODEL,
  getAiProviderConfig,
  type ClawBotProvider,
} from '../aiProviderDefaults';

interface AiProviderSettingsFieldsProps {
  idPrefix: string;
  provider: ClawBotProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
  onProviderChange: (provider: ClawBotProvider) => void;
  onBaseUrlChange: (baseUrl: string) => void;
  onModelChange: (model: string) => void;
  onApiKeyChange: (apiKey: string) => void;
}

export function AiProviderSettingsFields({
  idPrefix,
  provider,
  baseUrl,
  model,
  apiKey,
  onProviderChange,
  onBaseUrlChange,
  onModelChange,
  onApiKeyChange,
}: AiProviderSettingsFieldsProps) {
  const providerConfig = getAiProviderConfig(provider);

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${idPrefix}-provider`} className="block text-xs font-medium text-neutral-300 mb-1.5">
          Provider
        </label>
        <select
          id={`${idPrefix}-provider`}
          name="provider"
          value={provider}
          onChange={(event) => onProviderChange(event.target.value as ClawBotProvider)}
          className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none focus:border-[#67E0A3] focus:ring-1 focus:ring-[#67E0A3]/30 transition-all"
        >
          {AI_PROVIDER_CONFIGS.map((providerOption) => (
            <option key={providerOption.id} value={providerOption.id}>
              {providerOption.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-base-url`} className="block text-xs font-medium text-neutral-300 mb-1.5">
          Base URL
        </label>
        <input
          id={`${idPrefix}-base-url`}
          name="baseUrl"
          type="text"
          value={baseUrl}
          onChange={(event) => onBaseUrlChange(event.target.value)}
          placeholder={providerConfig.baseUrl || DEFAULT_OPENROUTER_BASE_URL}
          autoComplete="off"
          spellCheck={false}
          className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none focus:border-[#67E0A3] focus:ring-1 focus:ring-[#67E0A3]/30 transition-all font-mono"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-model`} className="block text-xs font-medium text-neutral-300 mb-1.5">
          Model
        </label>
        <input
          id={`${idPrefix}-model`}
          name="model"
          type="text"
          value={model}
          onChange={(event) => onModelChange(event.target.value)}
          placeholder={providerConfig.defaultModel || DEFAULT_OPENROUTER_MODEL}
          autoComplete="off"
          spellCheck={false}
          className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none focus:border-[#67E0A3] focus:ring-1 focus:ring-[#67E0A3]/30 transition-all font-mono"
        />
        <p className="text-[11px] text-neutral-500 mt-1">
          {providerConfig.protocol === 'anthropic-messages'
            ? 'Ayati - Quran Desktop Companion appends /messages to this Claude API base URL.'
            : 'Ayati - Quran Desktop Companion appends /chat/completions to this base URL.'}
        </p>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-api-key`} className="block text-xs font-medium text-neutral-300 mb-1.5">
          API Key
        </label>
        <input
          id={`${idPrefix}-api-key`}
          name="apiKey"
          type="password"
          value={apiKey}
          onChange={(event) => onApiKeyChange(event.target.value)}
          placeholder={`Enter your ${providerConfig.apiKeyLabel}`}
          autoComplete="off"
          spellCheck={false}
          className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none focus:border-[#67E0A3] focus:ring-1 focus:ring-[#67E0A3]/30 transition-all font-mono"
        />
      </div>
    </div>
  );
}
