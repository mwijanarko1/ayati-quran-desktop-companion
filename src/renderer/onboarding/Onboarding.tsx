import { useState, useCallback, useEffect } from 'react';
import { WelcomeStep } from './steps/WelcomeStep';
import { ApiKeysStep } from './steps/ApiKeysStep';
import { WatchStep } from './steps/WatchStep';
import { HotkeysStep } from './steps/HotkeysStep';
import { CompleteStep } from './steps/CompleteStep';
import { DEFAULT_AI_PROVIDER, DEFAULT_OPENROUTER_BASE_URL, DEFAULT_OPENROUTER_MODEL, type ClawBotProvider } from '../aiProviderDefaults';

export type WorkspaceType = 'clawster';

export interface OnboardingData {
  workspaceType: WorkspaceType;
  launchOnStartup: boolean;
  aiProvider: ClawBotProvider;
  gatewayUrl: string;
  gatewayToken: string;
  gatewayModel: string;
  watchFolders: string[];
  watchActiveApp: boolean;
  watchWindowTitles: boolean;
  hotkeyOpenChat: string;
  hotkeyCaptureScreen: string;
  hotkeyOpenAssistant: string;
}

const INITIAL_DATA: OnboardingData = {
  workspaceType: 'clawster',
  launchOnStartup: true,
  aiProvider: DEFAULT_AI_PROVIDER,
  gatewayUrl: DEFAULT_OPENROUTER_BASE_URL,
  gatewayToken: '',
  gatewayModel: DEFAULT_OPENROUTER_MODEL,
  watchFolders: [],
  watchActiveApp: false,
  watchWindowTitles: false,
  hotkeyOpenChat: 'CommandOrControl+Shift+Space',
  hotkeyCaptureScreen: 'CommandOrControl+Shift+/',
  hotkeyOpenAssistant: 'CommandOrControl+Shift+A',
};

type Step = 'welcome' | 'apiKeys' | 'watch' | 'hotkeys' | 'complete';

const STEP_ORDER: Step[] = ['welcome', 'apiKeys', 'watch', 'hotkeys', 'complete'];

export function Onboarding() {
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [data, setData] = useState<OnboardingData>(INITIAL_DATA);
  const [isCompleting, setIsCompleting] = useState(false);
  const [stepKey, setStepKey] = useState(0);

  const updateData = useCallback((updates: Partial<OnboardingData>) => {
    setData(prev => ({ ...prev, ...updates }));
  }, []);

  // Load defaults on mount
  useEffect(() => {
    const loadDefaults = async () => {
      try {
        const settings = await window.clawster.getSettings() as {
          clawbot?: {
            provider?: ClawBotProvider;
            url?: string;
            token?: string;
            model?: string;
          };
        };
        updateData({
          aiProvider: settings.clawbot?.provider || DEFAULT_AI_PROVIDER,
          gatewayUrl: settings.clawbot?.url || DEFAULT_OPENROUTER_BASE_URL,
          gatewayToken: '',
          gatewayModel: settings.clawbot?.model || DEFAULT_OPENROUTER_MODEL,
        });
      } catch (error) {
        console.error('Failed to load defaults:', error);
      }
    };

    loadDefaults();
  }, [updateData]);

  const currentStepIndex = STEP_ORDER.indexOf(currentStep);

  const goToStep = useCallback((step: Step) => {
    setStepKey(prev => prev + 1);
    setCurrentStep(step);
  }, []);

  const goToNextStep = useCallback(() => {
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    if (currentIndex < STEP_ORDER.length - 1) {
      goToStep(STEP_ORDER[currentIndex + 1]);
    }
  }, [currentStep, goToStep]);

  const goToPreviousStep = useCallback(() => {
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    if (currentIndex > 0) {
      goToStep(STEP_ORDER[currentIndex - 1]);
    }
  }, [currentStep, goToStep]);

  const handleSkip = useCallback(async () => {
    try {
      await window.clawster.onboardingSkip();
    } catch (error) {
      console.error('Failed to skip onboarding:', error);
    }
  }, []);

  const handleComplete = useCallback(async () => {
    setIsCompleting(true);

    try {
      await window.clawster.onboardingComplete({
        ...data,
      });
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      setIsCompleting(false);
    }
  }, [data]);

  // Determine if next button should be disabled
  const isNextDisabled = () => {
    return false;
  };

  // Get next button text
  const getNextButtonText = () => {
    if (currentStep === 'welcome') return 'Get Started';
    if (currentStep === 'complete') {
      if (isCompleting) return 'Waking up...';
      return 'Open Ayati - Quran Desktop Companion';
    }
    return 'Continue';
  };

  const handleNextClick = () => {
    if (currentStep === 'complete') {
      handleComplete();
    } else {
      goToNextStep();
    }
  };

  const renderStep = () => {
    const props = {
      data,
      updateData,
      onNext: goToNextStep,
      onPrevious: goToPreviousStep,
      onSkip: handleSkip,
    };

    switch (currentStep) {
      case 'welcome':
        return <WelcomeStep {...props} />;
      case 'apiKeys':
        return <ApiKeysStep {...props} />;
      case 'watch':
        return <WatchStep {...props} />;
      case 'hotkeys':
        return <HotkeysStep {...props} />;
      case 'complete':
        return <CompleteStep {...props} onComplete={handleComplete} />;
      default:
        return null;
    }
  };

  return (
    <div className="w-full h-full bg-[#AFF9C9] rounded-xl shadow-2xl relative flex flex-col overflow-hidden"
         style={{ boxShadow: '0 25px 50px -12px rgba(7, 18, 15, 0.28), 0 0 0 1px rgba(7, 18, 15, 0.14)' }}>

      {/* Top Bar (Draggable) - macOS window chrome */}
      <div className="drag-region h-11 flex items-center px-4 w-full z-50 select-none bg-[#ececec] border-b border-[#cfcfcf] shrink-0 relative">
        <div className="absolute left-4 flex items-center gap-2">
          <button
            className="no-drag w-3 h-3 rounded-full bg-[#ff5f57] hover:bg-[#ff453a] transition-colors cursor-pointer shrink-0 border border-black/10"
            onClick={handleSkip}
            title="Close"
            aria-label="Close setup"
          />
          <div className="w-3 h-3 rounded-full bg-[#febc2e] border border-black/10" aria-hidden="true" />
          <div className="w-3 h-3 rounded-full bg-[#28c840] border border-black/10" aria-hidden="true" />
        </div>

        <div className="flex-1 flex items-center justify-center">
          <span className="brand-display text-xs text-[#242424] font-semibold">Ayati - Quran Desktop Companion Setup</span>
        </div>

        <div className="absolute right-4 flex items-center gap-1.5">
          {STEP_ORDER.map((step, index) => (
            <div
              key={step}
              className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
                index === currentStepIndex
                  ? 'bg-[#666666]'
                  : index < currentStepIndex
                  ? 'bg-[#9a9a9a]'
                  : 'bg-[#c8c8c8]'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Center Stage Content */}
      <div className="no-drag flex-1 pb-20 overflow-y-auto scrollbar-hide relative w-full">
        <div key={stepKey} className="step-enter h-full">
          {renderStep()}
        </div>
      </div>

      {/* Action Footer */}
      <div className="no-drag h-[72px] absolute bottom-0 w-full flex items-center justify-end gap-3 px-6 bg-[#AFF9C9]/92 backdrop-blur-md border-t border-[#07120f]/15 z-50 select-none">
        <button
          onClick={handleSkip}
          className="px-4 py-2.5 rounded-lg text-sm font-medium text-[#35584b] hover:text-[#07120f] hover:bg-[#7CF0BD]/55 transition-colors"
        >
          Skip setup
        </button>

        <button
          onClick={handleNextClick}
          disabled={isNextDisabled() || isCompleting}
          className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            isNextDisabled() || isCompleting
              ? 'bg-[#07120f]/35 text-[#AFF9C9]/80 cursor-not-allowed'
              : 'bg-[#07120f] text-[#AFF9C9] hover:bg-[#10231c] shadow-[0_10px_28px_rgba(7,18,15,0.18)]'
          }`}
        >
          {isCompleting && (
            <iconify-icon icon="solar:spinner-linear" width="1rem" className="animate-spin"></iconify-icon>
          )}
          {getNextButtonText()}
        </button>
      </div>
    </div>
  );
}
