interface GatewaySetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckConnection: () => void;
}

export function GatewaySetupModal({ isOpen, onClose, onCheckConnection }: GatewaySetupModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-[#07120f] border border-[#67E0A3]/20 rounded-lg w-full max-w-md mx-4 p-5 shadow-2xl animate-fade-in">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-400 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-white">AI provider required</h2>
          <p className="text-sm text-[#b9c9c1] mt-1">
            Ayati - Quran Desktop Companion needs a connected vision provider before it can understand screenshots for ayah reflections.
          </p>
        </div>

        {/* Divider */}
        <div className="border-t border-white/10 my-4" />

        <div className="mb-5 space-y-3">
          <div>
            <h3 className="text-sm font-medium text-neutral-300 mb-1">Check connection settings</h3>
            <p className="text-xs text-neutral-500">
              Confirm the base URL includes /v1 and the model name matches the bundled free provider.
            </p>
          </div>
          <div className="rounded-lg border border-[#67E0A3]/15 bg-[#0a1914]/70 p-3">
            <p className="text-xs text-[#b9c9c1]">
              Open Settings, update the AI provider fields, then use Check Connection to refresh the status.
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white/10 my-4" />

        <div className="mb-5">
          <h3 className="text-sm font-medium text-neutral-300 mb-1">Still disconnected?</h3>
          <p className="text-xs text-neutral-500">
            Try the default free model again, then verify the provider account has vision access.
          </p>
        </div>

        {/* Divider */}
        <div className="border-t border-white/10 my-4" />

        {/* Footer */}
        <div className="flex justify-end">
          <button
            onClick={onCheckConnection}
            className="px-4 py-2 text-sm bg-[#67E0A3] hover:bg-[#7CF0BD] text-[#07120f] rounded-lg transition-colors flex items-center gap-2 font-semibold"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Check Connection
          </button>
        </div>
      </div>
    </div>
  );
}
