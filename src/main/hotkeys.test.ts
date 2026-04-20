import { describe, expect, it } from 'vitest';

import { sanitizeAccelerator } from './hotkeys';

describe('sanitizeAccelerator', () => {
  it('repairs non-ASCII option-layer punctuation before Electron registration', () => {
    expect(sanitizeAccelerator('CommandOrControl+Alt+≥', 'CommandOrControl+Shift+/')).toBe('CommandOrControl+Alt+.');
  });

  it('falls back when the accelerator key cannot be represented safely', () => {
    expect(sanitizeAccelerator('CommandOrControl+Alt+🚀', 'CommandOrControl+Shift+/')).toBe('CommandOrControl+Shift+/');
  });
});
