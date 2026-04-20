import { describe, expect, it } from 'vitest';

import { getWindowPositionNearAnchor } from './window-positioning';

describe('getWindowPositionNearAnchor', () => {
  it('centers a floating window above the character', () => {
    const position = getWindowPositionNearAnchor({
      anchor: { x: 900, y: 650, width: 164, height: 164 },
      windowSize: { width: 520, height: 280 },
      workArea: { x: 0, y: 0, width: 1440, height: 900 },
      verticalGap: -3,
    });

    expect(position).toEqual({ x: 722, y: 367 });
  });

  it('keeps the positioned window inside the display work area', () => {
    const position = getWindowPositionNearAnchor({
      anchor: { x: 1710, y: 120, width: 164, height: 164 },
      windowSize: { width: 520, height: 280 },
      workArea: { x: 1440, y: 0, width: 1440, height: 900 },
      verticalGap: -3,
    });

    expect(position).toEqual({ x: 1532, y: 0 });
  });
});
