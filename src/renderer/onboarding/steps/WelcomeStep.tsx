import type { OnboardingData } from '../Onboarding';
import appIconUrl from '../../../../assets/icon.png';

interface Props {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
}

export const WelcomeStep: React.FC<Props> = () => {
  return (
    <div className="h-full px-10 flex flex-col items-center justify-center text-center">
      <div className="mb-9 animate-happy-bounce relative">
        <img
          src={appIconUrl}
          alt="Ayati - Quran Desktop Companion"
          width={148}
          height={148}
          className="h-[148px] w-[148px] rounded-[32px] object-cover shadow-[0_18px_48px_rgba(103,224,163,0.18)]"
        />
      </div>

      <p className="brand-display text-xs font-semibold text-[#0f3328] mb-3">Quran reflection for your screen</p>
      <h1 className="text-4xl font-semibold tracking-tight text-[#07120f] mb-4 text-balance">
        Welcome to Ayati - Quran Desktop Companion
      </h1>
      <p className="text-base text-[#2b4b40] mb-8 max-w-md mx-auto leading-relaxed">
        Reflect on your screen with the ready-to-use free vision model and verified Quran Foundation content.
      </p>

      <div className="grid grid-cols-2 gap-x-5 gap-y-4 text-left max-w-md w-full">
        <div className="flex items-center gap-3 text-sm text-[#12362b]">
          <div className="w-9 h-9 rounded-lg bg-[#7CF0BD] flex items-center justify-center text-[#07120f] border border-[#07120f]/15">
            <iconify-icon icon="solar:camera-minimalistic-linear" width="1.125rem"></iconify-icon>
          </div>
          Reflect on screen
        </div>
        <div className="flex items-center gap-3 text-sm text-[#12362b]">
          <div className="w-9 h-9 rounded-lg bg-[#7CF0BD] flex items-center justify-center text-[#07120f] border border-[#07120f]/15">
            <iconify-icon icon="solar:book-bookmark-linear" width="1.125rem"></iconify-icon>
          </div>
          Quran Foundation verses
        </div>
        <div className="flex items-center gap-3 text-sm text-[#12362b]">
          <div className="w-9 h-9 rounded-lg bg-[#7CF0BD] flex items-center justify-center text-[#07120f] border border-[#07120f]/15">
            <iconify-icon icon="solar:shield-check-linear" width="1.125rem"></iconify-icon>
          </div>
          Temporary screenshots
        </div>
        <div className="flex items-center gap-3 text-sm text-[#12362b]">
          <div className="w-9 h-9 rounded-lg bg-[#7CF0BD] flex items-center justify-center text-[#07120f] border border-[#07120f]/15">
            <iconify-icon icon="solar:bookmark-square-minimalistic-linear" width="1.125rem"></iconify-icon>
          </div>
          Synced bookmarks
        </div>
      </div>
    </div>
  );
};
