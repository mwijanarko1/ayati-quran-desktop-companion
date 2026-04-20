import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Onboarding } from './Onboarding';

function createMockClawster() {
  return {
    getSettings: vi.fn().mockResolvedValue({
      clawbot: {
        url: 'https://openrouter.ai/api/v1',
        token: 'local-openrouter-key',
        model: 'google/gemma-4-31b-it:free',
      },
    }),
    copyToClipboard: vi.fn().mockResolvedValue(true),
    validateGateway: vi.fn().mockResolvedValue({ success: true }),
    onboardingSkip: vi.fn().mockResolvedValue(true),
    onboardingComplete: vi.fn().mockResolvedValue(true),
    getScreenCapturePermission: vi.fn().mockResolvedValue('granted'),
    checkAccessibilityPermission: vi.fn().mockResolvedValue(true),
  } satisfies Partial<Window['clawster']>;
}

describe('Onboarding', () => {
  let mockClawster: ReturnType<typeof createMockClawster>;

  beforeEach(() => {
    mockClawster = createMockClawster();
    Object.defineProperty(window, 'clawster', {
      configurable: true,
      writable: true,
      value: mockClawster as Window['clawster'],
    });
  });

  it('uses the inverted Ayati brand palette with neutral macOS title bar chrome', async () => {
    const { container } = render(<Onboarding />);
    const title = screen.getByText('Ayati - Quran Desktop Companion Setup');

    expect(container.firstElementChild).toHaveClass('bg-[#AFF9C9]');
    expect(title.closest('.drag-region')).toHaveClass('bg-[#ececec]');
    expect(title).toHaveClass('text-[#242424]');
    expect(screen.getByRole('button', { name: /close setup/i })).toHaveClass('bg-[#ff5f57]');

    await waitFor(() => expect(mockClawster.getSettings).toHaveBeenCalledTimes(1));
  });

  it('shows a settings-style BYOK API key slide after welcome', async () => {
    const user = userEvent.setup();

    render(<Onboarding />);

    await waitFor(() => expect(mockClawster.getSettings).toHaveBeenCalledTimes(1));

    expect(screen.queryByText(/openclaw/i)).not.toBeInTheDocument();

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /get started/i }));
    });

    expect(await screen.findByRole('heading', { name: /ai provider/i, level: 2 })).toBeInTheDocument();
    expect(screen.getByLabelText(/provider/i)).toHaveValue('openrouter');
    expect(screen.getByLabelText(/base url/i)).toHaveValue('https://openrouter.ai/api/v1');
    expect(screen.getByLabelText(/model/i)).toHaveValue('google/gemma-4-31b-it:free');
    expect(screen.getByLabelText(/api key/i)).toHaveValue('');
    expect(screen.getByText(/bring your own api key/i)).toBeInTheDocument();
    expect(screen.queryByText(/openclaw/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/client id/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/client secret/i)).not.toBeInTheDocument();
    expect(mockClawster.validateGateway).not.toHaveBeenCalled();
  });

  it('persists the user-entered API key when setup is completed', async () => {
    const user = userEvent.setup();

    render(<Onboarding />);

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /get started/i }));
    });

    await act(async () => {
      await user.type(await screen.findByLabelText(/api key/i), 'user-openrouter-key');
    });

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /continue/i }));
    });
    await act(async () => {
      await user.click(await screen.findByRole('button', { name: /continue/i }));
    });
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /continue/i }));
    });
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /open ayati - quran desktop companion/i }));
    });

    await waitFor(() => expect(mockClawster.onboardingComplete).toHaveBeenCalledTimes(1));
    expect(mockClawster.onboardingComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        gatewayUrl: 'https://openrouter.ai/api/v1',
        gatewayToken: 'user-openrouter-key',
        gatewayModel: 'google/gemma-4-31b-it:free',
      }),
    );
    expect(mockClawster.validateGateway).not.toHaveBeenCalled();
  });
});
