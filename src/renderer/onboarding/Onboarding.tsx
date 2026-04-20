import { useState, useCallback, useEffect } from 'react';
import { WelcomeStep } from './steps/WelcomeStep';
import { ApiKeysStep } from './steps/ApiKeysStep';
import { WatchStep } from './steps/WatchStep';
import { HotkeysStep } from './steps/HotkeysStep';
import { CompleteStep } from './steps/CompleteStep';
import { OnboardingIcon } from './OnboardingIcon';
import { DEFAULT_AI_PROVIDER, DEFAULT_OPENROUTER_BASE_URL, DEFAULT_OPENROUTER_MODEL, type ClawBotProvider } from '../aiProviderDefaults';

export type WorkspaceType = 'ayati';

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
  workspaceType: 'ayati',
  launchOnStartup: true,
  aiProvider: DEFAULT_AI_PROVIDER,
  gatewayUrl: DEFAULT_OPENROUTER_BASE_URL,
  gatewayToken: '',
  gatewayModel: DEFAULT_OPENROUTER_MODEL,
  watchFolders: [],
  watchActiveApp: false,
  watchWindowTitles: false,
  hotkeyOpenChat: 'CommandOrControl+Alt+,',
  hotkeyCaptureScreen: 'CommandOrControl+Alt+/',
  hotkeyOpenAssistant: 'CommandOrControl+Alt+.',
};

type Step = 'welcome' | 'apiKeys' | 'watch' | 'hotkeys' | 'complete';

const STEP_ORDER: Step[] = ['welcome', 'apiKeys', 'watch', 'hotkeys', 'complete'];

function hasEditedAiSetup(data: OnboardingData): boolean {
  return data.aiProvider !== INITIAL_DATA.aiProvider
    || data.gatewayUrl !== INITIAL_DATA.gatewayUrl
    || data.gatewayToken !== INITIAL_DATA.gatewayToken
    || data.gatewayModel !== INITIAL_DATA.gatewayModel;
}

export function Onboarding() {
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [data, setData] = useState<OnboardingData>(INITIAL_DATA);
  const [isCompleting, setIsCompleting] = useState(false);

  const updateData = useCallback((updates: Partial<OnboardingData>) => {
    setData(prev => ({ ...prev, ...updates }));
  }, []);

  // Load defaults on mount
  useEffect(() => {
    const loadDefaults = async () => {
      try {
        const settings = await window.ayati.getSettings() as {
          clawbot?: {
            provider?: ClawBotProvider;
            url?: string;
            token?: string;
            model?: string;
          };
        };
        setData((currentData) => {
          if (hasEditedAiSetup(currentData)) return currentData;

          return {
            ...currentData,
            aiProvider: settings.clawbot?.provider || DEFAULT_AI_PROVIDER,
            gatewayUrl: settings.clawbot?.url || DEFAULT_OPENROUTER_BASE_URL,
            gatewayToken: '',
            gatewayModel: settings.clawbot?.model || DEFAULT_OPENROUTER_MODEL,
          };
        });
      } catch (error) {
        console.error('Failed to load defaults:', error);
      }
    };

    loadDefaults();
  }, []);

  const currentStepIndex = STEP_ORDER.indexOf(currentStep);

  const goToStep = useCallback((step: Step) => {
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
      await window.ayati.onboardingSkip();
    } catch (error) {
      console.error('Failed to skip onboarding:', error);
    }
  }, []);

  const handleMinimize = useCallback(() => {
    window.ayati.onboardingMinimize();
  }, []);

  const handleMaximize = useCallback(() => {
    window.ayati.onboardingMaximize();
  }, []);

  const handleComplete = useCallback(async () => {
    setIsCompleting(true);

    try {
      await window.ayati.onboardingComplete({
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
      if (isCompleting) return 'Waking up…';
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
    <div className="w-full h-full bg-[#FAF9F6] rounded-3xl shadow-2xl relative flex flex-col overflow-hidden"
         style={{ boxShadow: '0 32px 64px -12px rgba(26, 42, 36, 0.12), 0 0 0 1px rgba(26, 42, 36, 0.05)' }}>

      {/* Top Bar (Draggable) - macOS window chrome — redesigned for premium feel */}
      <div className="drag-region h-14 flex items-center px-6 w-full z-50 select-none bg-white border-b border-[#1a2a24]/[0.05] shrink-0 relative">
        {/* Window Controls */}
        <div className="absolute left-6 flex items-center gap-2">
          <button
            className="no-drag w-3 h-3 rounded-full bg-[#ff5f57] hover:bg-[#ff453a] transition-colors cursor-pointer shrink-0 border border-black/05"
            onClick={handleSkip}
            title="Close"
            aria-label="Close setup"
          />
          <button
            className="no-drag w-3 h-3 rounded-full bg-[#febc2e] hover:bg-[#e0a926] transition-colors cursor-pointer shrink-0 border border-black/05"
            onClick={handleMinimize}
            title="Minimize"
            aria-label="Minimize"
          />
          <button
            className="no-drag w-3 h-3 rounded-full bg-[#28c840] hover:bg-[#20a134] transition-colors cursor-pointer shrink-0 border border-black/05"
            onClick={handleMaximize}
            title="Zoom"
            aria-label="Zoom"
          />
        </div>

        {/* Brand/Title */}
        <div className="flex-1 flex items-center justify-center">
          <span className="brand-display flex items-baseline gap-1.5 text-[13px] font-bold tracking-tight">
            <span className="text-[#1a2a24]">Ayati</span>
            <span className="text-[#67E0A3]">Setup Companion</span>
          </span>
        </div>

        {/* Step Progress Indicators */}
        <div className="absolute right-6 flex items-center gap-2">
          {STEP_ORDER.map((step, index) => {
            const isActive = index === currentStepIndex;
            const isCompleted = index < currentStepIndex;

            return (
              <div
                key={step}
                className={`h-1.5 rounded-full transition-[background-color,width] duration-150 ease-out ${
                  isActive
                    ? 'bg-[#67E0A3] w-6'
                    : isCompleted
                    ? 'bg-[#AFF9C9] w-1.5'
                    : 'bg-[#1a2a24]/10 w-1.5'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* Center Stage Content */}
      <div className="no-drag onboarding-scroll flex-1 overflow-y-auto scrollbar-hide relative w-full pb-20">
        <div className="min-h-full">
          {renderStep()}
        </div>
      </div>

      {/* Action Footer — solid bg, no backdrop-blur to avoid compositing cost */}
      <div className="no-drag h-[88px] absolute bottom-0 w-full flex items-center justify-between px-10 bg-[#FAF9F6] border-t border-[#1a2a24]/[0.05] z-50 select-none">
        <button
          onClick={handleSkip}
          className="px-4 py-2.5 rounded-xl text-sm font-medium text-[#1a2a24]/40 hover:text-[#1a2a24] hover:bg-[#1a2a24]/05 transition-colors"
        >
          Skip setup
        </button>

        <button
          onClick={handleNextClick}
          disabled={isNextDisabled() || isCompleting}
          className={`px-8 py-3.5 rounded-2xl text-sm font-semibold transition-[background-color,transform] duration-150 flex items-center gap-2.5 ${
            isNextDisabled() || isCompleting
              ? 'bg-[#1a2a24]/10 text-[#1a2a24]/30 cursor-not-allowed'
              : 'bg-[#1a2a24] text-[#FAF9F6] hover:bg-[#2a3a34] active:scale-[0.98]'
          }`}
        >
          {isCompleting && (
            <OnboardingIcon name="spinner" size="1.125rem" className="animate-spin" />
          )}
          {getNextButtonText()}
        </button>
      </div>
    </div>
  );
}
