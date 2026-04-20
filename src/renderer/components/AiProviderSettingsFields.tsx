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

  const inputClasses = "w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#67E0A3] focus:ring-1 focus:ring-[#67E0A3]/30 transition-all font-mono placeholder:text-white/40";
  const labelClasses = "block text-xs font-bold text-white/70 uppercase tracking-wider mb-1.5";

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${idPrefix}-provider`} className={labelClasses}>
          Provider
        </label>
        <select
          id={`${idPrefix}-provider`}
          name="provider"
          value={provider}
          onChange={(event) => onProviderChange(event.target.value as ClawBotProvider)}
          className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#67E0A3] focus:ring-1 focus:ring-[#67E0A3]/30 transition-all cursor-pointer backdrop-blur-md"
        >
          {AI_PROVIDER_CONFIGS.map((providerOption) => (
            <option key={providerOption.id} value={providerOption.id} className="bg-[#1a2a24] text-white">
              {providerOption.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-base-url`} className={labelClasses}>
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
          className={inputClasses}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-model`} className={labelClasses}>
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
          className={inputClasses}
        />
        <p className="text-[11px] text-[#67E0A3]/60 mt-1.5 font-medium leading-relaxed">
          {providerConfig.protocol === 'anthropic-messages'
            ? 'Ayati - Quran Desktop Companion appends /messages to this Claude API base URL.'
            : 'Ayati - Quran Desktop Companion appends /chat/completions to this base URL.'}
        </p>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-api-key`} className={labelClasses}>
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
          className={inputClasses}
        />
      </div>
    </div>
  );
}
