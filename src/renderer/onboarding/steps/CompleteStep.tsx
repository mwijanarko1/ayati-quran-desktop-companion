import type { OnboardingData } from '../Onboarding';
import { OnboardingIcon } from '../OnboardingIcon';
import { formatAcceleratorForDisplay } from '../../components/HotkeyInput';
import appIconUrl from '../../../../assets/icon.png';

interface Props {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
  onComplete: () => void;
}

export const CompleteStep: React.FC<Props> = ({ data, updateData }) => {
  const primaryShortcut = formatAcceleratorForDisplay(data.hotkeyCaptureScreen);

  return (
    <div className="min-h-full px-12 flex flex-col items-center justify-center text-center py-10">
      <div className="mb-10 relative">
        <div className="relative p-1.5 rounded-[46px] bg-white border border-[#67E0A3]/15">
          <img
            src={appIconUrl}
            alt="Ayati Mascot"
            width={150}
            height={150}
            className="h-[150px] w-[150px] rounded-[42px] object-cover"
          />
        </div>
      </div>

      <div className="space-y-4 mb-10">
        <p className="brand-display text-[11px] font-bold tracking-[0.25em] text-[#67E0A3] uppercase">Welcome Home</p>
        <h2 className="text-[40px] font-semibold tracking-tight text-[#1a2a24]">You&apos;re ready to reflect</h2>
        <p className="text-[17px] text-[#1a2a24]/60 max-w-[460px] mx-auto leading-relaxed font-medium">
          Ayati is now active in your menu bar. Capture your screen whenever you feel the need for a spiritual pause.
        </p>
      </div>

      <div className="w-full max-w-[480px] bg-white border border-[#1a2a24]/[0.03] rounded-[40px] p-8 text-left mb-10 relative overflow-hidden">
        <h3 className="text-[10px] font-bold text-[#1a2a24]/30 uppercase tracking-[0.25em] mb-5">Digital Companion Active</h3>
        <ul className="grid grid-cols-2 gap-4">
          <li className="flex items-center gap-3 text-[13px] font-bold text-[#1a2a24]/80">
            <div className="w-8 h-8 rounded-xl bg-[#67E0A3]/10 flex items-center justify-center text-[#67E0A3]">
              <OnboardingIcon name="globe" size="1.125rem" />
            </div>
            <span>Vision Enabled</span>
          </li>
          <li className="flex items-center gap-3 text-[13px] font-bold text-[#1a2a24]/80">
            <div className="w-8 h-8 rounded-xl bg-[#7CF0BD]/15 flex items-center justify-center text-[#67E0A3]">
              <OnboardingIcon name="verified" size="1.125rem" />
            </div>
            <span>Quran Secured</span>
          </li>
          <li className="flex items-center gap-3 text-[13px] font-bold text-[#1a2a24]/80">
            <div className="w-8 h-8 rounded-xl bg-[#AFF9C9]/20 flex items-center justify-center text-[#67E0A3]">
              <OnboardingIcon name="history" size="1.125rem" />
            </div>
            <span>History Sync</span>
          </li>
          <li className="flex items-center gap-3 text-[13px] font-bold text-[#1a2a24]/80">
            <div className="w-8 h-8 rounded-xl bg-[#67E0A3]/10 flex items-center justify-center text-[#67E0A3]">
              <OnboardingIcon name="command" size="1.125rem" />
            </div>
            <span>Shortcuts Live</span>
          </li>
        </ul>
      </div>

      <label className="w-full max-w-[480px] mb-10 flex items-center justify-between gap-4 rounded-[32px] bg-white border border-[#1a2a24]/[0.03] px-6 py-5 cursor-pointer transition-colors">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#67E0A3]/10 flex items-center justify-center text-[#67E0A3]">
            <OnboardingIcon name="power" size="1.5rem" />
          </div>
          <div className="flex flex-col text-left py-1">
            <span className="text-[15px] font-bold text-[#1a2a24]">Launch on startup</span>
            <span className="text-[12px] text-[#1a2a24]/40 font-semibold tracking-tight">Stay connected from the moment you log in</span>
          </div>
        </div>
        <div className="relative scale-110">
          <input
            type="checkbox"
            checked={data.launchOnStartup}
            onChange={(e) => updateData({ launchOnStartup: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-12 h-7 bg-[#1a2a24]/[0.05] rounded-full peer peer-checked:bg-[#1a2a24] transition-colors" />
          <div className="absolute left-1 top-1 bg-white w-5 h-5 rounded-full transition-transform peer-checked:translate-x-5" />
        </div>
      </label>

      <div className="text-[11px] font-bold text-[#1a2a24]/30 uppercase tracking-[0.3em]">
        Primary Shortcut: <span className="text-[#1a2a24] bg-white px-3 py-1.5 rounded-xl ml-2 shadow-sm border border-[#1a2a24]/[0.05] tracking-normal font-mono text-[13px]">{primaryShortcut}</span>
      </div>
    </div>
  );
};
