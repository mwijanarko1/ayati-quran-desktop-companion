import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Onboarding } from './Onboarding';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function createMockAyati() {
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
  } satisfies Partial<Window['ayati']>;
}

function getMatchingClassNames(container: HTMLElement, pattern: RegExp) {
  return Array.from(container.querySelectorAll<HTMLElement>('[class]'))
    .flatMap((element) => Array.from(element.classList))
    .filter((className, index, classNames) => pattern.test(className) && classNames.indexOf(className) === index)
    .sort();
}

describe('Onboarding', () => {
  let mockAyati: ReturnType<typeof createMockAyati>;

  beforeEach(() => {
    mockAyati = createMockAyati();
    Object.defineProperty(window, 'ayati', {
      configurable: true,
      writable: true,
      value: mockAyati as Window['ayati'],
    });
  });

  it('uses the inverted Ayati brand palette with neutral macOS title bar chrome', async () => {
    const { container } = render(<Onboarding />);
    const title = screen.getByText('Ayati');
    const subtitle = screen.getByText('Setup Companion');

    expect(container.firstElementChild).toHaveClass('bg-[#FAF9F6]');
    expect(title.closest('.drag-region')).toHaveClass('bg-white');
    expect(title).toHaveClass('text-[#1a2a24]');
    expect(subtitle).toHaveClass('text-[#67E0A3]');
    expect(screen.getByRole('button', { name: /close setup/i })).toHaveClass('bg-[#ff5f57]');

    await waitFor(() => expect(mockAyati.getSettings).toHaveBeenCalledTimes(1));
  });

  it('keeps the onboarding scroll path free of paint-heavy effects', async () => {
    const { container } = render(<Onboarding />);

    expect(getMatchingClassNames(
      container,
      /^(soft-glow|step-enter|animate-happy-bounce|transition-all|backdrop-blur.*|blur-.*|group-hover:.*|hover:shadow.*|hover:-translate.*|duration-700)$/,
    )).toEqual([]);

    await waitFor(() => expect(mockAyati.getSettings).toHaveBeenCalledTimes(1));
  });

  it('shows a settings-style BYOK API key slide after welcome', async () => {
    const user = userEvent.setup();

    render(<Onboarding />);

    await waitFor(() => expect(mockAyati.getSettings).toHaveBeenCalledTimes(1));

    expect(screen.queryByText(/openclaw/i)).not.toBeInTheDocument();

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /get started/i }));
    });

    expect(await screen.findByRole('heading', { name: /vision provider/i, level: 2 })).toBeInTheDocument();
    expect(screen.getByLabelText(/provider/i)).toHaveValue('openrouter');
    expect(screen.getByLabelText(/base url/i)).toHaveValue('https://openrouter.ai/api/v1');
    expect(screen.getByLabelText(/model/i)).toHaveValue('google/gemma-4-31b-it:free');
    expect(screen.getByLabelText(/api key/i)).toHaveValue('');
    expect(screen.getByText(/your keys are encrypted and stored locally/i)).toBeInTheDocument();
    expect(screen.queryByText(/openclaw/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/client id/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/client secret/i)).not.toBeInTheDocument();
    expect(mockAyati.validateGateway).not.toHaveBeenCalled();
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

    await waitFor(() => expect(mockAyati.onboardingComplete).toHaveBeenCalledTimes(1));
    expect(mockAyati.onboardingComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        gatewayUrl: 'https://openrouter.ai/api/v1',
        gatewayToken: 'user-openrouter-key',
        gatewayModel: 'google/gemma-4-31b-it:free',
      }),
    );
    expect(mockAyati.validateGateway).not.toHaveBeenCalled();
  });

  it('does not let late settings defaults overwrite API setup entered during onboarding', async () => {
    const user = userEvent.setup();
    const settingsDefaults = createDeferred<unknown>();
    mockAyati.getSettings.mockReturnValue(settingsDefaults.promise);

    render(<Onboarding />);

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /get started/i }));
    });

    const apiKeyInput = await screen.findByLabelText(/api key/i);
    await act(async () => {
      await user.clear(apiKeyInput);
      await user.type(apiKeyInput, 'typed-before-defaults');
    });

    settingsDefaults.resolve({
      clawbot: {
        provider: 'openai',
        url: 'https://api.openai.com/v1',
        token: 'saved-key',
        model: 'gpt-5.2',
      },
    });

    await waitFor(() => expect(mockAyati.getSettings).toHaveBeenCalledTimes(1));

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

    await waitFor(() => expect(mockAyati.onboardingComplete).toHaveBeenCalledTimes(1));
    expect(mockAyati.onboardingComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        gatewayUrl: 'https://openrouter.ai/api/v1',
        gatewayToken: 'typed-before-defaults',
        gatewayModel: 'google/gemma-4-31b-it:free',
      }),
    );
  });

  it('updates context toggles immediately while the accessibility prompt is pending', async () => {
    const user = userEvent.setup();
    const accessibilityPrompt = createDeferred<boolean>();
    mockAyati.checkAccessibilityPermission.mockReturnValue(accessibilityPrompt.promise);

    render(<Onboarding />);

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /get started/i }));
    });
    await act(async () => {
      await user.click(await screen.findByRole('button', { name: /continue/i }));
    });

    const activeAppToggle = await screen.findByRole('checkbox', { name: /active application/i });

    await act(async () => {
      await user.click(activeAppToggle);
    });

    expect(activeAppToggle).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /window titles/i })).not.toBeChecked();
    expect(screen.getByText(/permission requested/i)).toBeInTheDocument();
    expect(mockAyati.checkAccessibilityPermission).toHaveBeenCalledWith(true);

    accessibilityPrompt.resolve(true);
  });

  it('enables active app context immediately when window titles are enabled first', async () => {
    const user = userEvent.setup();
    const accessibilityPrompt = createDeferred<boolean>();
    mockAyati.checkAccessibilityPermission.mockReturnValue(accessibilityPrompt.promise);

    render(<Onboarding />);

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /get started/i }));
    });
    await act(async () => {
      await user.click(await screen.findByRole('button', { name: /continue/i }));
    });

    const activeAppToggle = await screen.findByRole('checkbox', { name: /active application/i });
    const windowTitlesToggle = screen.getByRole('checkbox', { name: /window titles/i });

    await act(async () => {
      await user.click(windowTitlesToggle);
    });

    expect(activeAppToggle).toBeChecked();
    expect(windowTitlesToggle).toBeChecked();
    expect(mockAyati.checkAccessibilityPermission).toHaveBeenCalledWith(true);

    await act(async () => {
      await user.click(activeAppToggle);
    });

    expect(activeAppToggle).not.toBeChecked();
    expect(windowTitlesToggle).not.toBeChecked();

    accessibilityPrompt.resolve(true);
  });

  it('summarizes the selected screen reflection shortcut on the final step', async () => {
    const user = userEvent.setup();

    render(<Onboarding />);

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /get started/i }));
    });
    await act(async () => {
      await user.click(await screen.findByRole('button', { name: /continue/i }));
    });
    await act(async () => {
      await user.click(await screen.findByRole('button', { name: /continue/i }));
    });

    const reflectShortcut = await screen.findByRole('button', { name: /change reflect on screen shortcut/i });
    await act(async () => {
      await user.click(reflectShortcut);
    });
    await act(async () => {
      await user.keyboard('{Control>}{Alt>}R{/Alt}{/Control}');
    });

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /continue/i }));
    });

    expect(await screen.findByText(/primary shortcut/i)).toBeInTheDocument();
    expect(screen.getByText('⌘ + ⌥ + R')).toBeInTheDocument();
  });
});
