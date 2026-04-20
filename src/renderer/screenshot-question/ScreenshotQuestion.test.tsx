import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScreenshotQuestion } from './ScreenshotQuestion';

function installMockAyati(error: Error): void {
  Object.defineProperty(window, 'ayati', {
    configurable: true,
    writable: true,
    value: {
      getScreenCapturePermission: vi.fn().mockResolvedValue('granted'),
      captureAyahReflection: vi.fn().mockRejectedValue(error),
      closeScreenshotQuestion: vi.fn(),
      saveAyahReflection: vi.fn(),
    } satisfies Partial<Window['ayati']>,
  });
}

describe('ScreenshotQuestion', () => {
  beforeEach(() => {
    installMockAyati(new Error(
      "Error invoking remote method 'ayah-capture-reflection': Error: AI provider error 400: This model does not support image input.",
    ));
  });

  it('shows the AI provider error instead of a generic fallback message', async () => {
    render(<ScreenshotQuestion />);

    expect(await screen.findByRole('heading', { name: /reflection unavailable/i })).toBeInTheDocument();
    expect(screen.getByText('AI provider error 400: This model does not support image input.')).toBeInTheDocument();
    expect(screen.queryByText(/Error invoking remote method/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/could not create a reflection right now/i)).not.toBeInTheDocument();
  });
});
