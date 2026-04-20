import type { OnboardingData } from '../Onboarding';
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
    <div className="h-full px-8 pt-8">
      <h2 className="text-2xl font-semibold tracking-tight text-[#07120f] mb-2">Keyboard shortcuts</h2>
      <p className="text-sm text-[#2b4b40] mb-6">
        Customize hotkeys to open Ayati - Quran Desktop Companion quickly.
      </p>

      <div className="space-y-1 divide-y divide-[#07120f]/10">
        <HotkeyInput
          label="Open Chat"
          description="Summon the quick chat bar"
          value={data.hotkeyOpenChat}
          onChange={(value) => updateData({ hotkeyOpenChat: value })}
          theme="setupInverted"
        />
        <HotkeyInput
          label="Reflect on Screen"
          description="Capture your screen and receive a fitting ayah"
          value={data.hotkeyCaptureScreen}
          onChange={(value) => updateData({ hotkeyCaptureScreen: value })}
          theme="setupInverted"
        />
        <HotkeyInput
          label="Open Assistant"
          description="Open the full assistant panel"
          value={data.hotkeyOpenAssistant}
          onChange={(value) => updateData({ hotkeyOpenAssistant: value })}
          theme="setupInverted"
        />
      </div>

      <div className="mt-6 px-3 py-2 bg-[#7CF0BD]/70 border border-[#07120f]/15 rounded-lg">
        <p className="text-xs text-[#4f7064]">
          <iconify-icon icon="solar:info-circle-linear" width="0.875rem" className="inline mr-1.5 align-text-bottom"></iconify-icon>
          Click on a shortcut and press your desired key combination to change it.
        </p>
      </div>
    </div>
  );
};
