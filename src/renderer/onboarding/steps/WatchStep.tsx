import { useState } from 'react';
import type { OnboardingData } from '../Onboarding';

interface Props {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
}

export const WatchStep: React.FC<Props> = ({ data, updateData }) => {
  const [showPermissionHint, setShowPermissionHint] = useState(false);

  const handleWatchActiveAppChange = async (enabled: boolean) => {
    if (enabled) {
      // Open System Settings for accessibility and enable the toggle
      // Note: Permission detection is unreliable in Electron, so we just
      // enable the toggle and let the watcher check permission at runtime
      await window.clawster.checkAccessibilityPermission(true);
      setShowPermissionHint(true);
      updateData({ watchActiveApp: true });
    } else {
      updateData({ watchActiveApp: false });
      setShowPermissionHint(false);
    }
  };

  const handleWatchWindowTitlesChange = async (enabled: boolean) => {
    if (enabled && !data.watchActiveApp) {
      // Also enable active app watching
      await window.clawster.checkAccessibilityPermission(true);
      setShowPermissionHint(true);
      updateData({ watchActiveApp: true, watchWindowTitles: true });
    } else {
      updateData({ watchWindowTitles: enabled });
    }
  };

  return (
    <div className="h-full px-8 pt-8">
      <h2 className="text-2xl font-semibold tracking-tight text-[#07120f] mb-2">Screen context</h2>
      <p className="text-sm text-[#2b4b40] mb-6">
        Choose what Ayati - Quran Desktop Companion can use for local context while you work.
      </p>

      {/* Permission notice */}
      <div className="bg-[#7CF0BD]/70 border border-[#07120f]/15 rounded-lg p-3 mb-6">
        <div className="flex items-start gap-2">
          <iconify-icon icon="solar:shield-warning-linear" width="1rem" className="text-[#07120f] mt-0.5 flex-shrink-0"></iconify-icon>
          <div className="text-xs text-[#35584b]">
            These features require <span className="text-[#07120f]">Accessibility permission</span>.
            System Settings will open when you enable a feature.
          </div>
        </div>
      </div>

      {showPermissionHint && (
        <div className="bg-[#67E0A3]/75 border border-[#07120f]/15 rounded-lg p-3 mb-6">
          <div className="flex items-start gap-2">
            <iconify-icon icon="solar:check-circle-linear" width="1rem" className="text-[#07120f] mt-0.5 flex-shrink-0"></iconify-icon>
            <div className="text-xs text-[#12362b]">
              Feature enabled. Make sure Ayati - Quran Desktop Companion is turned on in the Accessibility settings that just opened.
            </div>
          </div>
        </div>
      )}


      <div className="space-y-6">
        {/* Toggle 1: Watch Active Application */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-[#12362b]">Watch active application</div>
            <div className="text-xs text-[#4f7064] mt-0.5">Know which app you're currently using</div>
          </div>
          <label className="flex items-center cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={data.watchActiveApp}
                onChange={(e) => handleWatchActiveAppChange(e.target.checked)}
              />
              <div className="w-9 h-5 bg-[#7bb89e] rounded-full peer peer-checked:bg-[#07120f] transition-colors border border-[#07120f]/10" />
              <div className="absolute left-0.5 top-0.5 bg-[#f4fff8] w-4 h-4 rounded-full transition-transform peer-checked:translate-x-4 shadow-sm" />
            </div>
          </label>
        </div>

        {/* Toggle 2: Send Window Titles */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-[#12362b]">Send window titles</div>
            <div className="text-xs text-[#4f7064] mt-0.5">Share window titles for context</div>
          </div>
          <label className="flex items-center cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={data.watchWindowTitles}
                onChange={(e) => handleWatchWindowTitlesChange(e.target.checked)}
              />
              <div className="w-9 h-5 bg-[#7bb89e] rounded-full peer peer-checked:bg-[#07120f] transition-colors border border-[#07120f]/10" />
              <div className="absolute left-0.5 top-0.5 bg-[#f4fff8] w-4 h-4 rounded-full transition-transform peer-checked:translate-x-4 shadow-sm" />
            </div>
          </label>
        </div>

      </div>
    </div>
  );
};
