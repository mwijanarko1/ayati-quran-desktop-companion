import { describe, expect, it } from 'vitest';

import {
  TUTORIAL_FOLLOW_FIRST_CHECK_MS,
  TUTORIAL_FOLLOW_INTERVAL_MS,
  TUTORIAL_FOLLOW_MOVE_DURATION_MS,
  TUTORIAL_MOVE_DURATION_MS,
  TUTORIAL_STEPS,
} from './tutorial';

describe('tutorial timing', () => {
  it('keeps tutorial pacing quick with no per-step wait', () => {
    expect(TUTORIAL_MOVE_DURATION_MS).toBeLessThanOrEqual(250);
    expect(TUTORIAL_FOLLOW_MOVE_DURATION_MS).toBeLessThanOrEqual(400);
    expect(TUTORIAL_FOLLOW_FIRST_CHECK_MS).toBeLessThanOrEqual(200);
    expect(TUTORIAL_FOLLOW_INTERVAL_MS).toBeLessThanOrEqual(1200);

    for (const step of TUTORIAL_STEPS) {
      expect(step.delayBefore ?? 0).toBe(0);
      expect(step.fallbackDelay).toBeLessThanOrEqual(1800);

      if (step.autoAdvance) {
        expect(step.autoAdvanceDelay ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(1200);
      }
    }
  });
});
