import type { OnboardingData } from '../Onboarding';
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
  return (
    <div className="h-full px-10 flex flex-col items-center justify-center text-center">
      <div className="mb-7 animate-happy-bounce relative">
        <img
          src={appIconUrl}
          alt="Ayati - Quran Desktop Companion"
          width={128}
          height={128}
          className="h-32 w-32 rounded-[28px] object-cover shadow-[0_18px_48px_rgba(103,224,163,0.18)]"
        />
      </div>

      <p className="brand-display text-xs font-semibold text-[#0f3328] mb-3">Ready for reflection</p>
      <h2 className="text-3xl font-semibold tracking-tight text-[#07120f] mb-3">Ayati - Quran Desktop Companion is ready</h2>
      <p className="text-sm text-[#2b4b40] mb-7 max-w-md">
        Capture your screen, receive a Quran-centered reminder, and save reflections locally or with Quran Foundation.
      </p>

      <div className="w-full bg-[#7CF0BD]/70 border border-[#07120f]/15 rounded-lg p-4 text-left mb-7">
        <ul className="space-y-2 text-xs text-[#12362b]">
          <li className="flex items-center gap-2">
            <iconify-icon icon="solar:check-circle-linear" className="text-[#07120f]"></iconify-icon>
            Vision provider: {data.gatewayUrl.replace('http://', '').replace('https://', '')}
            {data.gatewayModel.trim().length > 0 ? ` with ${data.gatewayModel}` : ''}
          </li>
          <li className="flex items-center gap-2">
            <iconify-icon icon="solar:check-circle-linear" className="text-[#07120f]"></iconify-icon>
            Quran Foundation: pre-production OAuth configured
          </li>
          {data.watchActiveApp && (
            <li className="flex items-center gap-2">
              <iconify-icon icon="solar:check-circle-linear" className="text-[#07120f]"></iconify-icon>
              Watching active app
            </li>
          )}
          {data.watchFolders.length > 0 && (
            <li className="flex items-center gap-2">
              <iconify-icon icon="solar:check-circle-linear" className="text-[#07120f]"></iconify-icon>
              Watching {data.watchFolders.length} folder{data.watchFolders.length > 1 ? 's' : ''}
            </li>
          )}
        </ul>
      </div>

      <label className="w-full max-w-sm mb-6 flex items-center justify-between gap-3 rounded-lg border border-[#07120f]/15 bg-[#7CF0BD]/70 px-3 py-2.5 cursor-pointer">
        <span className="text-sm text-[#12362b]">Launch on startup</span>
        <input
          type="checkbox"
          checked={data.launchOnStartup}
          onChange={(e) => updateData({ launchOnStartup: e.target.checked })}
          className="h-4 w-4 rounded border-[#07120f]/20 bg-[#AFF9C9] accent-[#07120f]"
        />
      </label>

      <div className="text-xs text-[#4f7064]">
        Press <span className="bg-[#7CF0BD]/80 px-1.5 py-0.5 rounded text-[#07120f]">Cmd+Shift+/</span> to reflect on your screen.
      </div>
    </div>
  );
};
