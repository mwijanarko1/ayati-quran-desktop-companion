import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Assistant } from './Assistant';

vi.mock('@iconify/react', () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

function createMockAyati() {
  return {
    getSettings: vi.fn().mockResolvedValue({}),
    getAyahLensSettings: vi.fn().mockResolvedValue({
      translationId: 20,
      mushafId: 4,
      captureMode: 'fullScreen',
      saveScreenshots: false,
      defaultSave: false,
      contextualNudges: true,
      nudgeCooldownMinutes: 15,
      maxNudgesPerDay: 8,
      timedReminders: false,
      timedReminderMinutes: 15,
    }),
    getQuranAuthStatus: vi.fn().mockResolvedValue({ isConnected: false, scopes: [] }),
    getAyahReflectionHistory: vi.fn().mockResolvedValue([]),
    getChatHistory: vi.fn().mockResolvedValue([]),
    getClawbotStatus: vi.fn().mockResolvedValue({ connected: true, error: null, gatewayUrl: '' }),
    getUpdateState: vi.fn().mockResolvedValue({
      enabled: true,
      status: 'idle',
      currentVersion: '0.0.1',
      hostArch: 'arm64',
      appArch: 'arm64',
      runningUnderArm64Translation: false,
      availableVersion: null,
      downloadedVersion: null,
      downloadPercent: null,
      checkedAt: null,
      message: null,
      errorContext: null,
      canRetry: false,
    }),
    checkForUpdate: vi.fn().mockResolvedValue({
      checked: true,
      state: {
        enabled: true,
        status: 'up-to-date',
        currentVersion: '0.0.1',
        hostArch: 'arm64',
        appArch: 'arm64',
        runningUnderArm64Translation: false,
        availableVersion: null,
        downloadedVersion: null,
        downloadPercent: null,
        checkedAt: '2026-04-20T10:00:00.000Z',
        message: null,
        errorContext: null,
        canRetry: false,
      },
    }),
    downloadUpdate: vi.fn(),
    installUpdate: vi.fn(),
    forceTimedReminderComment: vi.fn().mockResolvedValue(true),
    onUpdateState: vi.fn(),
    onConnectionStatusChange: vi.fn(),
    onAyahOAuthCallback: vi.fn(),
    onActivityEvent: vi.fn(),
    onClawbotSuggestion: vi.fn(),
    onCronResult: vi.fn(),
    onCronError: vi.fn(),
    onClawbotStreamChunk: vi.fn(),
    onClawbotStreamEnd: vi.fn(),
    onClawbotStreamError: vi.fn(),
    onChatSync: vi.fn(),
    onSwitchToChat: vi.fn(),
    onSwitchToSettings: vi.fn(),
    saveChatHistory: vi.fn(),
    removeAllListeners: vi.fn(),
    closeAssistant: vi.fn(),
  } satisfies Partial<Window['ayati']>;
}

describe('Assistant updates menu', () => {
  it('shows update controls and checks for updates through the desktop listener bridge', async () => {
    const ayati = createMockAyati();
    Object.defineProperty(window, 'ayati', {
      configurable: true,
      value: ayati as Window['ayati'],
    });

    await act(async () => {
      render(<Assistant />);
    });

    await waitFor(() => {
      expect(ayati.getUpdateState).toHaveBeenCalled();
      expect(ayati.onUpdateState).toHaveBeenCalled();
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Updates' }));
    expect(await screen.findByText('Ready to check')).toBeInTheDocument();

    await userEvent.click(await screen.findByRole('button', { name: 'Check for Updates' }));
    expect((await screen.findAllByText('Up to date')).length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(ayati.checkForUpdate).toHaveBeenCalled();
    });
  });
});

describe('Assistant chat quick actions', () => {
  it('uses Quran-focused prompts for chat shortcuts', async () => {
    const ayati = createMockAyati();
    Object.defineProperty(window, 'ayati', {
      configurable: true,
      value: ayati as Window['ayati'],
    });

    await act(async () => {
      render(<Assistant />);
    });

    const input = screen.getByPlaceholderText('Ask Ayati - Quran Desktop Companion anything...');

    expect(await screen.findByRole('button', { name: 'Find Relevant Ayah' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Quran Guidance' }));
    expect(input).toHaveValue('What Quranic guidance should I keep in mind for what I do next?');

    await userEvent.click(screen.getByRole('button', { name: 'Day Reflection' }));
    expect(input).toHaveValue('Summarize my day through Quranic reminders and practical next steps.');
  });
});

describe('Assistant settings shortcuts', () => {
  it('shows persisted onboarding AI setup in the settings tab', async () => {
    const ayati = createMockAyati();
    ayati.getSettings.mockResolvedValue({
      clawbot: {
        provider: 'gemini',
        url: 'https://generativelanguage.googleapis.com/v1beta/openai',
        token: 'onboarding-gemini-key',
        model: 'gemini-3-flash-preview',
      },
    });
    Object.defineProperty(window, 'ayati', {
      configurable: true,
      value: ayati as Window['ayati'],
    });

    await act(async () => {
      render(<Assistant />);
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Settings' }));

    expect(await screen.findByLabelText(/provider/i)).toHaveValue('gemini');
    expect(screen.getByLabelText(/base url/i)).toHaveValue('https://generativelanguage.googleapis.com/v1beta/openai');
    expect(screen.getByLabelText(/model/i)).toHaveValue('gemini-3-flash-preview');
    expect(screen.getByLabelText(/api key/i)).toHaveValue('onboarding-gemini-key');
  });

  it('shows shortcut controls in chat, assistant, reflect order with new defaults', async () => {
    const ayati = createMockAyati();
    Object.defineProperty(window, 'ayati', {
      configurable: true,
      value: ayati as Window['ayati'],
    });

    await act(async () => {
      render(<Assistant />);
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Settings' }));

    const openChat = await screen.findByText('Open Chat');
    const openAssistant = screen.getByText('Open Assistant');
    const reflectOnScreen = screen.getByText('Reflect on Screen');

    expect(openChat.compareDocumentPosition(openAssistant) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(openAssistant.compareDocumentPosition(reflectOnScreen) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: /change open chat shortcut, currently ⌘ \+ ⌥ \+ ,/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change open assistant shortcut, currently ⌘ \+ ⌥ \+ \./i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change reflect on screen shortcut, currently ⌘ \+ ⌥ \+ \//i })).toBeInTheDocument();
  });
});

describe('Assistant developer settings', () => {
  it('can trigger a test reminder comment from developer settings', async () => {
    const ayati = createMockAyati();
    Object.defineProperty(window, 'ayati', {
      configurable: true,
      value: ayati as Window['ayati'],
    });

    await act(async () => {
      render(<Assistant />);
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    await userEvent.click(await screen.findByRole('button', { name: /test reminder comment/i }));

    expect(ayati.forceTimedReminderComment).toHaveBeenCalledTimes(1);
  });
});
