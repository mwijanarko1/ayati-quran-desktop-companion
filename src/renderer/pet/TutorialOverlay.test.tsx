import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('TutorialOverlay styles', () => {
  it('keeps tutorial overlay feedback snappy and paint-light', () => {
    const styles = readFileSync(path.join(process.cwd(), 'src/renderer/pet/TutorialOverlay.css'), 'utf8');

    expect(styles).not.toMatch(/transition:\s*all/);
    expect(styles).not.toMatch(/animation:\s*[^;]*(infinite|popup-in|arrow-bounce|pulse-expand)/);
    expect(styles).not.toMatch(/box-shadow:\s*[^;]*rgba/);
    expect(styles).not.toMatch(/@keyframes\s+(popup-in|arrow-bounce|pulse-expand)/);
    expect(styles).toContain('contain: layout paint');
  });
});
