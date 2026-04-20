import type { OnboardingData } from '../Onboarding';
import { OnboardingIcon } from '../OnboardingIcon';
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
    <div className="min-h-full px-12 pt-12 pb-12">
      <div className="space-y-3 mb-10">
        <p className="brand-display text-[10px] font-bold tracking-[0.2em] text-[#67E0A3] uppercase">Step 01</p>
        <h2 className="text-[32px] font-semibold tracking-tight text-[#1a2a24]">Vision Provider</h2>
        <p className="text-[15px] text-[#1a2a24]/60 max-w-[440px] leading-relaxed font-medium">
          Ayati is a local-first application. Connect your own AI account to enable infinite screenshot reflections.
        </p>
      </div>

      <div className="rounded-[40px] bg-[#1a2a24] p-8 relative overflow-hidden">
        <h3 className="text-[11px] font-bold text-white/60 uppercase tracking-[0.25em] mb-6 flex items-center gap-2">
          <OnboardingIcon name="key" size="1rem" className="text-[#67E0A3]" />
          Credentials
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

      <div className="mt-8 px-5 py-4 bg-[#67E0A3]/[0.05] border border-[#67E0A3]/15 rounded-[24px]">
        <p className="text-xs text-[#1a2a24]/50 flex items-center gap-3 font-medium">
          <OnboardingIcon name="lock" size="1.25rem" className="text-[#67E0A3]" />
          Your keys are encrypted and stored locally. Ayati never shares them.
        </p>
      </div>
    </div>
  );
};
