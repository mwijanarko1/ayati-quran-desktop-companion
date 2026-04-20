import type { OnboardingData } from '../Onboarding';
import { getAiProviderConfig, type ClawBotProvider } from '../../aiProviderDefaults';
import { AiProviderSettingsFields } from '../../components/AiProviderSettingsFields';

interface Props {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
}

export const ApiKeysStep: React.FC<Props> = ({ data, updateData }) => {
  const handleProviderChange = (provider: ClawBotProvider) => {
    const providerConfig = getAiProviderConfig(provider);
    updateData({
      aiProvider: provider,
      gatewayUrl: providerConfig.baseUrl,
      gatewayModel: providerConfig.defaultModel,
      gatewayToken: '',
    });
  };

  return (
    <div className="h-full px-8 pt-8">
      <h2 className="text-2xl font-semibold tracking-tight text-[#07120f] mb-2">AI Provider</h2>
      <p className="text-sm text-[#2b4b40] mb-5">
        Bring your own API key for screenshot reflections. Ayati - Quran Desktop Companion does not ship with a shared OpenRouter key.
      </p>

      <div className="rounded-lg border border-[#07120f]/15 bg-[#07120f] p-4 shadow-[0_18px_42px_rgba(7,18,15,0.16)]">
        <h3 className="text-[10px] font-medium text-neutral-500 uppercase tracking-widest mb-3">
          AI Provider
        </h3>
        <AiProviderSettingsFields
          idPrefix="onboarding-ai-provider"
          provider={data.aiProvider}
          baseUrl={data.gatewayUrl}
          model={data.gatewayModel}
          apiKey={data.gatewayToken}
          onProviderChange={handleProviderChange}
          onBaseUrlChange={(gatewayUrl) => updateData({ gatewayUrl })}
          onModelChange={(gatewayModel) => updateData({ gatewayModel })}
          onApiKeyChange={(gatewayToken) => updateData({ gatewayToken })}
        />
      </div>

      <div className="mt-4 px-3 py-2 bg-[#7CF0BD]/70 border border-[#07120f]/15 rounded-lg">
        <p className="text-xs text-[#4f7064]">
          <iconify-icon icon="solar:shield-check-linear" width="0.875rem" className="inline mr-1.5 align-text-bottom"></iconify-icon>
          Your key is stored on this device and can be changed later in Settings.
        </p>
      </div>
    </div>
  );
};
