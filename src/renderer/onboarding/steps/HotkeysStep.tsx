import type { OnboardingData } from '../Onboarding';
import { OnboardingIcon } from '../OnboardingIcon';
import { HotkeyInput } from '../../components/HotkeyInput';

interface Props {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
}

export const HotkeysStep: React.FC<Props> = ({ data, updateData }) => {
  return (
    <div className="min-h-full px-12 pt-12 pb-12">
      <div className="space-y-3 mb-10">
        <p className="brand-display text-[10px] font-bold tracking-[0.2em] text-[#67E0A3] uppercase">Step 03</p>
        <h2 className="text-[32px] font-semibold tracking-tight text-[#1a2a24]">Flow Shortcuts</h2>
        <p className="text-[15px] text-[#1a2a24]/60 max-w-[440px] leading-relaxed font-medium">
          Access reflections and chat instantly without breaking your current workflow.
        </p>
      </div>

      <div className="space-y-4">
        <div className="p-2 rounded-[40px] bg-white border border-[#1a2a24]/[0.03]">
          <HotkeyInput
            label="Open Chat"
            description="Summon the quick chat bar"
            value={data.hotkeyOpenChat}
            onChange={(value) => updateData({ hotkeyOpenChat: value })}
            theme="setupInverted"
          />
          <div className="h-px bg-[#1a2a24]/[0.05] mx-6" />
          <HotkeyInput
            label="Open Assistant"
            description="Open the full assistant panel"
            value={data.hotkeyOpenAssistant}
            onChange={(value) => updateData({ hotkeyOpenAssistant: value })}
            theme="setupInverted"
          />
          <div className="h-px bg-[#1a2a24]/[0.05] mx-6" />
          <HotkeyInput
            label="Reflect on Screen"
            description="Capture your screen for a fitting ayah"
            value={data.hotkeyCaptureScreen}
            onChange={(value) => updateData({ hotkeyCaptureScreen: value })}
            theme="setupInverted"
          />
        </div>
      </div>

      <div className="mt-8 px-5 py-4 bg-[#67E0A3]/[0.05] border border-[#67E0A3]/15 rounded-[24px]">
        <p className="text-xs text-[#1a2a24]/50 flex items-center gap-3 font-medium">
          <OnboardingIcon name="mouse" size="1.25rem" className="text-[#67E0A3]" />
          Click a shortcut and press your desired keys to change it.
        </p>
      </div>
    </div>
  );
};
