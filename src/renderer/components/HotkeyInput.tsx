import { useState } from 'react';

export interface HotkeyInputProps {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  theme?: 'dark' | 'setupInverted';
}

const NON_TRIGGER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta']);

const CODE_TO_ACCELERATOR_KEY: Record<string, string> = {
  Backquote: '`',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Equal: '=',
  Minus: '-',
  Period: '.',
  Quote: "'",
  Semicolon: ';',
  Slash: '/',
  Space: 'Space',
};

const KEY_TO_ACCELERATOR_KEY: Record<string, string> = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Esc: 'Escape',
};

export const HotkeyInput: React.FC<HotkeyInputProps> = ({
  label,
  description,
  value,
  onChange,
  theme = 'dark',
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const isSetupInverted = theme === 'setupInverted';
  const labelClassName = isSetupInverted ? 'text-[#12362b]' : 'text-neutral-200';
  const descriptionClassName = isSetupInverted ? 'text-[#4f7064]' : 'text-neutral-500';
  const buttonClassName = isRecording
    ? getRecordingClassName(isSetupInverted)
    : getIdleClassName(isSetupInverted);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isRecording) return;

    e.preventDefault();
    e.stopPropagation();

    const parts: string[] = [];

    // Build modifier string
    if (e.metaKey || e.ctrlKey) parts.push('CommandOrControl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');

    const acceleratorKey = getAcceleratorKey(e);
    if (!acceleratorKey) return;

    parts.push(acceleratorKey);

    onChange(parts.join('+'));
    setIsRecording(false);
  };

  const formatHotkey = (hotkey: string) => {
    return hotkey
      .replace('CommandOrControl', '⌘')
      .replace('Shift', '⇧')
      .replace('Alt', '⌥')
      .replace('Space', 'Space')
      .replace(/\+/g, ' + ');
  };

  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <div className={`text-sm font-medium ${labelClassName}`}>{label}</div>
        <div className={`text-xs mt-0.5 ${descriptionClassName}`}>{description}</div>
      </div>
      <button
        onKeyDown={handleKeyDown}
        onClick={() => setIsRecording(true)}
        onBlur={() => setIsRecording(false)}
        className={`px-3 py-2 rounded-lg text-sm font-mono transition-all min-w-[140px] text-center ${buttonClassName}`}
      >
        {isRecording ? 'Press keys…' : formatHotkey(value)}
      </button>
    </div>
  );
};

function getAcceleratorKey(e: React.KeyboardEvent): string | null {
  if (NON_TRIGGER_KEYS.has(e.key)) {
    return null;
  }

  if (/^Key[A-Z]$/.test(e.code)) {
    return e.code.slice(3);
  }

  if (/^Digit[0-9]$/.test(e.code)) {
    return e.code.slice(5);
  }

  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.code)) {
    return e.code;
  }

  const keyFromCode = CODE_TO_ACCELERATOR_KEY[e.code];
  if (keyFromCode) {
    return keyFromCode;
  }

  const namedKey = KEY_TO_ACCELERATOR_KEY[e.key];
  if (namedKey) {
    return namedKey;
  }

  if (/^[a-z]$/i.test(e.key)) {
    return e.key.toUpperCase();
  }

  if (/^[0-9]$/.test(e.key) || /^[\x21-\x2A\x2C-\x7E]$/.test(e.key)) {
    return e.key;
  }

  return null;
}

function getRecordingClassName(isSetupInverted: boolean) {
  if (isSetupInverted) {
    return 'bg-[#07120f] border border-[#07120f] text-[#AFF9C9] animate-pulse';
  }

  return 'bg-[#67E0A3]/15 border border-[#67E0A3] text-[#AFF9C9] animate-pulse';
}

function getIdleClassName(isSetupInverted: boolean) {
  if (isSetupInverted) {
    return 'bg-[#7CF0BD]/75 border border-[#07120f]/15 text-[#07120f] hover:border-[#07120f]/35';
  }

  return 'bg-neutral-900 border border-white/10 text-neutral-300 hover:border-white/20';
}
