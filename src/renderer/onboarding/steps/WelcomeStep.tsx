import type { OnboardingData } from '../Onboarding';
import { OnboardingIcon } from '../OnboardingIcon';
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
    <div className="min-h-full px-12 flex flex-col items-center justify-center text-center py-8">
      <div className="mb-10 relative">
        <div className="relative p-1 rounded-[42px] bg-gradient-to-b from-white to-[#7CF0BD]/20 border border-[#67E0A3]/15">
          <img
            src={appIconUrl}
            alt="Ayati Mascot"
            width={160}
            height={160}
            className="h-40 w-40 rounded-[38px] object-cover"
          />
        </div>
      </div>

      <div className="space-y-4 mb-10">
        <p className="brand-display text-[11px] font-bold tracking-[0.25em] text-[#67E0A3] uppercase">
          Quranic Reflection for your Screen
        </p>
        <h1 className="text-[44px] font-semibold tracking-tight text-[#1a2a24] leading-[1.1] text-balance">
          Welcome to Ayati
        </h1>
        <p className="text-[17px] text-[#1a2a24]/60 max-w-[460px] mx-auto leading-relaxed font-medium">
          Create moments of remembrance and keep connected to the Quran during your digital work.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 w-full max-w-[540px]">
        <div className="flex items-start gap-4 p-5 rounded-[32px] bg-white border border-[#1a2a24]/[0.03]">
          <div className="w-12 h-12 rounded-[16px] bg-[#67E0A3]/10 flex items-center justify-center text-[#67E0A3] shrink-0">
            <OnboardingIcon name="eye" size="1.625rem" />
          </div>
          <div className="text-left py-0.5">
            <h3 className="text-[15px] font-bold text-[#1a2a24]">Vision AI</h3>
            <p className="text-[12px] font-medium text-[#1a2a24]/40 leading-snug mt-1">Intelligently matches verses to your current tasks.</p>
          </div>
        </div>

        <div className="flex items-start gap-4 p-5 rounded-[32px] bg-white border border-[#1a2a24]/[0.03]">
          <div className="w-12 h-12 rounded-[16px] bg-[#7CF0BD]/15 flex items-center justify-center text-[#67E0A3] shrink-0">
            <OnboardingIcon name="verified" size="1.625rem" />
          </div>
          <div className="text-left py-0.5">
            <h3 className="text-[15px] font-bold text-[#1a2a24]">Verified</h3>
            <p className="text-[12px] font-medium text-[#1a2a24]/40 leading-snug mt-1">Reliable Quran Foundation verses &amp; tafsir.</p>
          </div>
        </div>

        <div className="flex items-start gap-4 p-5 rounded-[32px] bg-white border border-[#1a2a24]/[0.03]">
          <div className="w-12 h-12 rounded-[16px] bg-[#AFF9C9]/20 flex items-center justify-center text-[#67E0A3] shrink-0">
            <OnboardingIcon name="shield" size="1.625rem" />
          </div>
          <div className="text-left py-0.5">
            <h3 className="text-[15px] font-bold text-[#1a2a24]">Private</h3>
            <p className="text-[12px] font-medium text-[#1a2a24]/40 leading-snug mt-1">Screenshots are analyzed and never stored.</p>
          </div>
        </div>

        <div className="flex items-start gap-4 p-5 rounded-[32px] bg-white border border-[#1a2a24]/[0.03]">
          <div className="w-12 h-12 rounded-[16px] bg-[#67E0A3]/10 flex items-center justify-center text-[#67E0A3] shrink-0">
            <OnboardingIcon name="cloud" size="1.625rem" />
          </div>
          <div className="text-left py-0.5">
            <h3 className="text-[15px] font-bold text-[#1a2a24]">Synced</h3>
            <p className="text-[12px] font-medium text-[#1a2a24]/40 leading-snug mt-1">Bookmarks sync with your Quran account.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
