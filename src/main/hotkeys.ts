export const DEFAULT_HOTKEYS = {
  openChat: 'CommandOrControl+Alt+,',
  captureScreen: 'CommandOrControl+Alt+/',
  openAssistant: 'CommandOrControl+Alt+.',
} as const;

const MODIFIER_ALIASES = new Map<string, string>([
  ['commandorcontrol', 'CommandOrControl'],
  ['cmdorctrl', 'CommandOrControl'],
  ['command', 'Command'],
  ['cmd', 'Command'],
  ['control', 'Control'],
  ['ctrl', 'Control'],
  ['alt', 'Alt'],
  ['option', 'Alt'],
  ['shift', 'Shift'],
  ['super', 'Super'],
  ['meta', 'Super'],
]);

const NAMED_KEY_ALIASES = new Map<string, string>([
  ['space', 'Space'],
  ['tab', 'Tab'],
  ['enter', 'Enter'],
  ['return', 'Enter'],
  ['escape', 'Escape'],
  ['esc', 'Escape'],
  ['backspace', 'Backspace'],
  ['delete', 'Delete'],
  ['del', 'Delete'],
  ['insert', 'Insert'],
  ['ins', 'Insert'],
  ['home', 'Home'],
  ['end', 'End'],
  ['pageup', 'PageUp'],
  ['pagedown', 'PageDown'],
  ['up', 'Up'],
  ['down', 'Down'],
  ['left', 'Left'],
  ['right', 'Right'],
]);

const OPTION_LAYER_KEY_REPLACEMENTS = new Map<string, string>([
  ['≥', '.'],
  ['≤', ','],
  ['÷', '/'],
  ['–', '-'],
  ['≠', '='],
  ['¡', '1'],
  ['™', '2'],
  ['£', '3'],
  ['¢', '4'],
  ['∞', '5'],
  ['§', '6'],
  ['¶', '7'],
  ['•', '8'],
  ['ª', '9'],
  ['º', '0'],
]);

const ASCII_PRINTABLE_EXCEPT_PLUS = /^[\x21-\x2A\x2C-\x7E]$/;

export function sanitizeAccelerator(accelerator: unknown, fallback: string): string {
  const parsedAccelerator = parseAccelerator(typeof accelerator === 'string' ? accelerator : '');
  if (parsedAccelerator) {
    return parsedAccelerator;
  }

  return parseAccelerator(fallback) ?? DEFAULT_HOTKEYS.openAssistant;
}

function parseAccelerator(accelerator: string): string | null {
  const tokens = accelerator
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return null;
  }

  const modifiers: string[] = [];
  let acceleratorKey: string | null = null;

  for (const token of tokens) {
    const modifier = normalizeModifier(token);
    if (modifier) {
      if (!modifiers.includes(modifier)) {
        modifiers.push(modifier);
      }
      continue;
    }

    if (acceleratorKey) {
      return null;
    }

    acceleratorKey = normalizeAcceleratorKey(token);
    if (!acceleratorKey) {
      return null;
    }
  }

  if (!acceleratorKey) {
    return null;
  }

  return [...modifiers, acceleratorKey].join('+');
}

function normalizeModifier(token: string): string | null {
  return MODIFIER_ALIASES.get(token.toLowerCase()) ?? null;
}

function normalizeAcceleratorKey(token: string): string | null {
  const replacement = OPTION_LAYER_KEY_REPLACEMENTS.get(token) ?? token;
  const namedKey = NAMED_KEY_ALIASES.get(replacement.toLowerCase());
  if (namedKey) {
    return namedKey;
  }

  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(replacement)) {
    return replacement.toUpperCase();
  }

  if (/^[a-z]$/i.test(replacement)) {
    return replacement.toUpperCase();
  }

  if (/^[0-9]$/.test(replacement) || ASCII_PRINTABLE_EXCEPT_PLUS.test(replacement)) {
    return replacement;
  }

  return null;
}
