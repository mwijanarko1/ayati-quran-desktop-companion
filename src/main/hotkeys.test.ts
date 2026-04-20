import { describe, expect, it } from 'vitest';

import { DEFAULT_HOTKEYS, sanitizeAccelerator } from './hotkeys';

describe('DEFAULT_HOTKEYS', () => {
  it('uses Command/Option punctuation shortcuts by default', () => {
    expect(DEFAULT_HOTKEYS).toEqual({
      openChat: 'CommandOrControl+Alt+,',
      openAssistant: 'CommandOrControl+Alt+.',
      captureScreen: 'CommandOrControl+Alt+/',
    });
  });
});

describe('sanitizeAccelerator', () => {
  it('repairs non-ASCII option-layer punctuation before Electron registration', () => {
    expect(sanitizeAccelerator('CommandOrControl+Alt+≥', DEFAULT_HOTKEYS.openAssistant)).toBe('CommandOrControl+Alt+.');
  });

  it('falls back when the accelerator key cannot be represented safely', () => {
    expect(sanitizeAccelerator('CommandOrControl+Alt+🚀', DEFAULT_HOTKEYS.captureScreen)).toBe(DEFAULT_HOTKEYS.captureScreen);
  });
});
