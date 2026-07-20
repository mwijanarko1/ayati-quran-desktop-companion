import '@testing-library/jest-dom/vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { Assistant } from './Assistant';

type MockAyati = Partial<Window['ayati']> & {
  updateAyahLensSetting: Mock;
  listMasjidlyMosques: Mock;
  getPrayerSettings: Mock;
  updatePrayerSettings: Mock;
  getPrayerTimes: Mock;
  refreshPrayerTimes: Mock;
  createTodo: Mock;
  startPomodoro: Mock;
  getSettings: Mock;
  updateSettings: Mock;
};

function asAyati(mock: MockAyati): Window['ayati'] {
  return mock as unknown as Window['ayati'];
}

vi.mock('@iconify/react', () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

function createMockAyati() {
  return {
    getSettings: vi.fn().mockResolvedValue({}),
    getAyahLensSettings: vi.fn().mockResolvedValue({
      translationId: 131,
      tafsirResourceId: 169,
      tafsirResourceName: 'Tafsir Ibn Kathir',
      mushafId: 4,
      captureMode: 'fullScreen',
      saveScreenshots: false,
      defaultSave: false,
      contextualNudges: true,
      nudgeCooldownMinutes: 15,
      timedReminders: false,
      timedReminderMinutes: 15,
      recitationId: null,
      reciterName: null,
    }),
    getAyahRecitationResources: vi.fn().mockResolvedValue([
      { id: 7, name: 'Mishari Rashid al-`Afasy' },
      { id: 4, name: 'Abu Bakr Shatri' },
      { id: 1, name: 'Abdul Baset' },
    ]),
    getAyahTafsirResources: vi.fn().mockResolvedValue([
      { id: 169, name: 'Tafsir Ibn Kathir', languageName: 'english' },
      { id: 171, name: 'Tafhim-ul-Quran', languageName: 'english' },
    ]),
    getAyahTranslationResources: vi.fn().mockResolvedValue([
      { id: 131, name: 'Saheeh International', languageName: 'english' },
      { id: 20, name: 'Dr. Mustafa Khattab', languageName: 'english' },
    ]),
    getQuranAuthStatus: vi.fn().mockResolvedValue({ isConnected: false, scopes: [] }),
    getKeychainConsentStatus: vi.fn().mockResolvedValue({
      required: false,
      acknowledged: true,
      hasStoredSecrets: false,
    }),
    acknowledgeKeychainConsent: vi.fn().mockResolvedValue(true),
    ensureKeychainConsent: vi.fn().mockResolvedValue({ granted: true }),
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
    forcePrayerReminderComment: vi.fn().mockResolvedValue(true),
    forceTodoReminderComment: vi.fn().mockResolvedValue(true),
    executePetAction: vi.fn().mockResolvedValue({ ok: true }),
    getPrayerSettings: vi.fn().mockResolvedValue({
      enabled: false,
      source: 'calculation',
      mosqueSlug: '',
      showIqamah: false,
      calculationCity: '',
      calculationCountry: '',
      city: '',
      country: '',
      method: 15,
      school: 0,
      reminderLeadMinutes: 10,
      quietMinutesAfterPrayer: 15,
      hasSavedSettings: false,
      use24h: true,
    }),
    updatePrayerSettings: vi.fn().mockResolvedValue({
      enabled: true,
      source: 'calculation',
      mosqueSlug: '',
      showIqamah: false,
      calculationCity: 'London',
      calculationCountry: 'United Kingdom',
      city: 'London',
      country: 'United Kingdom',
      method: 15,
      school: 0,
      reminderLeadMinutes: 10,
      quietMinutesAfterPrayer: 15,
      hasSavedSettings: true,
      use24h: true,
    }),
    listMasjidlyMosques: vi.fn().mockResolvedValue([]),
    updateAyahLensSetting: vi.fn().mockResolvedValue({
      translationId: 131,
      mushafId: 4,
      captureMode: 'fullScreen',
      saveScreenshots: false,
      defaultSave: false,
      contextualNudges: true,
      nudgeCooldownMinutes: 15,
      timedReminders: false,
      timedReminderMinutes: 15,
      recitationId: null,
      reciterName: null,
    }),
    getPrayerTimes: vi.fn().mockResolvedValue({
      today: {
        date: '2026-05-02',
        city: 'London',
        country: 'United Kingdom',
        method: 15,
        school: 0,
        timezone: 'Europe/London',
        source: 'aladhan',
        fetchedAt: Date.now(),
        prayers: [
          { name: 'fajr', label: 'Fajr', time: '04:11', at: Date.now() + 1000, isReminderEnabled: true },
          { name: 'sunrise', label: 'Sunrise', time: '05:44', at: Date.now() + 2000, isReminderEnabled: false },
          { name: 'dhuhr', label: 'Dhuhr', time: '13:02', at: Date.now() + 3000, isReminderEnabled: true },
          { name: 'asr', label: 'Asr', time: '17:07', at: Date.now() + 4000, isReminderEnabled: true },
          { name: 'maghrib', label: 'Maghrib', time: '20:17', at: Date.now() + 5000, isReminderEnabled: true },
          { name: 'isha', label: 'Isha', time: '21:43', at: Date.now() + 6000, isReminderEnabled: true },
        ],
      },
      tomorrow: null,
    }),
    refreshPrayerTimes: vi.fn().mockResolvedValue({
      today: {
        date: '2026-05-02',
        city: 'London',
        country: 'United Kingdom',
        method: 15,
        school: 0,
        timezone: 'Europe/London',
        source: 'aladhan',
        fetchedAt: Date.now(),
        prayers: [],
      },
      tomorrow: null,
    }),
    getTodos: vi.fn().mockResolvedValue([]),
    updateTodoSettings: vi.fn(),
    createTodo: vi.fn().mockResolvedValue([]),
    updateTodo: vi.fn(),
    completeTodo: vi.fn().mockResolvedValue([]),
    deleteTodo: vi.fn().mockResolvedValue([]),
    getPomodoroState: vi.fn().mockResolvedValue({
      settings: {
        focusMinutes: 25,
        breakMinutes: 10,
        petRemindersEnabled: true,
      },
      activeSession: null,
      completedFocusCount: 0,
      history: [],
      sentCompletionIds: [],
    }),
    updatePomodoroSettings: vi.fn(),
    startPomodoro: vi.fn().mockResolvedValue({
      settings: {
        focusMinutes: 25,
        breakMinutes: 10,
        petRemindersEnabled: true,
      },
      activeSession: {
        id: 'session-1',
        kind: 'focus',
        status: 'running',
        startedAt: Date.now(),
        pausedAt: null,
        accumulatedPausedMs: 0,
        durationMinutes: 25,
        todoId: null,
        completedAt: null,
      },
      completedFocusCount: 0,
      history: [],
      sentCompletionIds: [],
    }),
    pausePomodoro: vi.fn(),
    resumePomodoro: vi.fn(),
    cancelPomodoro: vi.fn(),
    completePomodoro: vi.fn(),
    onUpdateState: vi.fn(),
    onConnectionStatusChange: vi.fn(),
    onAyahOAuthCallback: vi.fn(),
    onClawbotSuggestion: vi.fn(),
    onCronResult: vi.fn(),
    onCronError: vi.fn(),
    onClawbotStreamChunk: vi.fn(),
    onClawbotStreamEnd: vi.fn(),
    onClawbotStreamError: vi.fn(),
    onChatSync: vi.fn(),
    onSwitchToChat: vi.fn(),
    onSwitchToSettings: vi.fn(),
    onSwitchToPrayers: vi.fn(),
    onSwitchToTodos: vi.fn(),
    onSwitchToFocus: vi.fn(),
    saveChatHistory: vi.fn(),
    removeAllListeners: vi.fn(),
    closeAssistant: vi.fn(),
    beginHotkeyCapture: vi.fn().mockResolvedValue(undefined),
    endHotkeyCapture: vi.fn().mockResolvedValue(undefined),
    updateSettings: vi.fn().mockResolvedValue({}),
    qulIsAvailable: vi.fn().mockResolvedValue(false),
    getQulFontPacks: vi.fn().mockResolvedValue({
      madani1421: true,
      indoPakNastaleeq: true,
    }),
    getQulRenderedVerse: vi.fn().mockResolvedValue(null),
  } as MockAyati;
}

describe('Assistant updates in settings', () => {
  it('saves the reminders listen reciter from settings', async () => {
    const ayati = createMockAyati();
    ayati.updateAyahLensSetting = vi.fn()
      .mockResolvedValueOnce({
        translationId: 20,
        mushafId: 4,
        captureMode: 'fullScreen',
        saveScreenshots: false,
        defaultSave: false,
        contextualNudges: true,
        nudgeCooldownMinutes: 15,
        timedReminders: false,
        timedReminderMinutes: 15,
        recitationId: 4,
        reciterName: null,
      })
      .mockResolvedValueOnce({
        translationId: 20,
        mushafId: 4,
        captureMode: 'fullScreen',
        saveScreenshots: false,
        defaultSave: false,
        contextualNudges: true,
        nudgeCooldownMinutes: 15,
        timedReminders: false,
        timedReminderMinutes: 15,
        recitationId: 4,
        reciterName: 'Abu Bakr Shatri',
      });
    Object.defineProperty(window, 'ayati', {
      configurable: true,
      value: asAyati(ayati),
    });

    await act(async () => {
      render(<Assistant />);
    });

    await userEvent.click(await screen.findByRole('tab', { name: 'Settings' }));
    await userEvent.click(await screen.findByText('Reminders'));
    expect(screen.queryByRole('option', { name: "Mishari Rashid al-`Afasy" })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('combobox', { name: /reminder listen reciter/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Abu Bakr Shatri' }));

    expect(ayati.updateAyahLensSetting).toHaveBeenNthCalledWith(1, 'recitationId', 4);
    expect(ayati.updateAyahLensSetting).toHaveBeenNthCalledWith(2, 'reciterName', 'Abu Bakr Shatri');
  });

  it('saves companion appearance with the pet.appearanceId settings key', async () => {
    const ayati = createMockAyati();
    ayati.getSettings = vi.fn().mockResolvedValue({
      pet: { appearanceId: 'ayah', transparentWhenSleeping: false },
    });
    ayati.updateSettings = vi.fn().mockResolvedValue({
      pet: { appearanceId: 'cosmo', transparentWhenSleeping: false },
    });
    Object.defineProperty(window, 'ayati', {
      configurable: true,
      value: asAyati(ayati),
    });

    await act(async () => {
      render(<Assistant />);
    });

    await userEvent.click(await screen.findByRole('tab', { name: 'Settings' }));
    await userEvent.click(await screen.findByText('Companion'));
    await userEvent.click(await screen.findByRole('combobox', { name: /companion appearance/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Cosmo' }));

    expect(ayati.updateSettings).toHaveBeenCalledWith('pet.appearanceId', 'cosmo');
  });

  it('shows title bar update action when an update is available and downloads on click', async () => {
    let notifyUpdateState: ((state: {
      enabled: boolean;
      status: string;
      currentVersion: string;
      hostArch: string;
      appArch: string;
      runningUnderArm64Translation: boolean;
      availableVersion: string | null;
      downloadedVersion: string | null;
      downloadPercent: number | null;
      checkedAt: string | null;
      message: string | null;
      errorContext: string | null;
      canRetry: boolean;
    }) => void) | undefined;

    const ayati = createMockAyati();
    ayati.onUpdateState = vi.fn((cb) => {
      notifyUpdateState = cb as NonNullable<typeof notifyUpdateState>;
    });
    ayati.downloadUpdate = vi.fn().mockResolvedValue({
      accepted: true,
      completed: true,
      state: {
        enabled: true,
        status: 'downloaded',
        currentVersion: '0.0.1',
        hostArch: 'arm64',
        appArch: 'arm64',
        runningUnderArm64Translation: false,
        availableVersion: '0.1.0',
        downloadedVersion: '0.1.0',
        downloadPercent: null,
        checkedAt: '2026-04-20T10:00:00.000Z',
        message: null,
        errorContext: null,
        canRetry: false,
      },
    });
    Object.defineProperty(window, 'ayati', {
      configurable: true,
      value: asAyati(ayati),
    });

    await act(async () => {
      render(<Assistant />);
    });

    await waitFor(() => {
      expect(ayati.getUpdateState).toHaveBeenCalled();
      expect(ayati.onUpdateState).toHaveBeenCalled();
    });

    await act(async () => {
      notifyUpdateState?.({
        enabled: true,
        status: 'available',
        currentVersion: '0.0.1',
        hostArch: 'arm64',
        appArch: 'arm64',
        runningUnderArm64Translation: false,
        availableVersion: '0.1.0',
        downloadedVersion: null,
        downloadPercent: null,
        checkedAt: '2026-04-20T10:00:00.000Z',
        message: null,
        errorContext: null,
        canRetry: false,
      });
    });

    const updateButton = await screen.findByRole('button', { name: 'Download Update' });
    await userEvent.click(updateButton);

    await waitFor(() => {
      expect(ayati.downloadUpdate).toHaveBeenCalled();
    });

    await userEvent.click(await screen.findByRole('tab', { name: 'Settings' }));
    expect(screen.queryByText('Check for new releases and install updates')).not.toBeInTheDocument();
  });
});

describe('Assistant productivity tabs', () => {
  it('shows Prayers, To Do, and Focus tabs and calls their bridge APIs', async () => {
    const ayati = createMockAyati();
    Object.defineProperty(window, 'ayati', {
      configurable: true,
      value: asAyati(ayati),
    });

    await act(async () => {
      render(<Assistant />);
    });

    expect(await screen.findByRole('tab', { name: 'Prayers' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'To Do' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Focus' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chat' })).not.toBeInTheDocument();
    expect(await screen.findByLabelText('Prayer city')).toBeInTheDocument();
    expect(screen.getByLabelText('Prayer time source')).toHaveTextContent('Calculated times');
    expect(screen.getByLabelText('Prayer country')).toHaveRole('combobox');
    expect(screen.getByLabelText('Prayer city')).toHaveRole('combobox');
    expect(screen.getByLabelText('Prayer calculation method')).toHaveTextContent('Moonsighting Committee Worldwide');
    expect(screen.getByLabelText('Prayer juristic school')).toHaveTextContent('Shafi, Maliki, Hanbali');

    expect((await screen.findAllByText('Fajr')).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByLabelText('Prayer country'));
    await userEvent.click(await screen.findByRole('option', { name: 'United States' }));
    await userEvent.click(screen.getByLabelText('Prayer city'));
    expect(await screen.findByRole('option', { name: 'Oklahoma City' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: 'New York' }));
    await userEvent.click(screen.getByLabelText('Prayer calculation method'));
    await userEvent.click(await screen.findByRole('option', { name: 'Islamic Society of North America (ISNA)' }));
    await userEvent.click(screen.getByLabelText('Prayer juristic school'));
    await userEvent.click(await screen.findByRole('option', { name: 'Hanafi' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(ayati.updatePrayerSettings).toHaveBeenCalledWith(expect.objectContaining({
      source: 'calculation',
      city: 'New York',
      country: 'United States',
      method: 2,
      school: 1,
      hasSavedSettings: true,
      use24h: true,
    }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('tab', { name: 'To Do' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add Task' }));
    await userEvent.type(await screen.findByLabelText('Task title'), 'Read tafsir');
    const addTaskButtons = screen.getAllByRole('button', { name: 'Add Task' });
    await userEvent.click(addTaskButtons[addTaskButtons.length - 1]);
    expect(ayati.createTodo).toHaveBeenCalledWith(expect.objectContaining({ title: 'Read tafsir' }));

    await userEvent.click(screen.getByRole('tab', { name: 'Focus' }));
    expect(await screen.findByText('25:00')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Start Focus' }));
    expect(ayati.startPomodoro).toHaveBeenCalledWith(expect.objectContaining({ kind: 'focus' }));
  });

  it('filters Masjidly mosques by country and city via IPC directory', async () => {
    const ayati = createMockAyati();
    ayati.listMasjidlyMosques.mockResolvedValue([
      { slug: 'mwhs', name: 'Muslim Welfare House', cityName: 'Sheffield', countryName: 'United Kingdom', timezone: 'Europe/London' },
      { slug: 'london-masjid', name: 'London Masjid', cityName: 'London', countryName: 'United Kingdom', timezone: 'Europe/London' },
    ]);
    Object.defineProperty(window, 'ayati', { configurable: true, value: asAyati(ayati) });

    await act(async () => { render(<Assistant />); });
    await userEvent.click(await screen.findByLabelText('Prayer time source'));
    await userEvent.click(await screen.findByRole('option', { name: 'Masjidly mosque timetable' }));
    await waitFor(() => expect(ayati.listMasjidlyMosques).toHaveBeenCalled());
    await userEvent.click(await screen.findByLabelText('Masjidly country'));
    await userEvent.click(await screen.findByRole('option', { name: 'United Kingdom' }));
    await userEvent.click(screen.getByLabelText('Masjidly city'));
    await userEvent.click(await screen.findByRole('option', { name: 'Sheffield' }));
    await userEvent.click(screen.getByLabelText('Masjidly mosque'));
    expect(await screen.findByRole('option', { name: 'Muslim Welfare House' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'London Masjid' })).not.toBeInTheDocument();
  });

  it('surfaces Masjidly directory load errors with retry', async () => {
    const ayati = createMockAyati();
    ayati.listMasjidlyMosques.mockRejectedValue(new Error('offline'));
    Object.defineProperty(window, 'ayati', { configurable: true, value: asAyati(ayati) });

    await act(async () => { render(<Assistant />); });
    await userEvent.click(await screen.findByLabelText('Prayer time source'));
    await userEvent.click(await screen.findByRole('option', { name: 'Masjidly mosque timetable' }));
    expect(await screen.findByText('Could not load Masjidly mosques.')).toBeInTheDocument();

    ayati.listMasjidlyMosques.mockResolvedValue([
      { slug: 'mwhs', name: 'Muslim Welfare House', cityName: 'Sheffield', countryName: 'United Kingdom', timezone: 'Europe/London' },
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByText('Could not load Masjidly mosques.')).not.toBeInTheDocument());
    await userEvent.click(await screen.findByLabelText('Masjidly country'));
    expect(await screen.findByRole('option', { name: 'United Kingdom' })).toBeInTheDocument();
  });

  it('shows iqamah times in a separate column', async () => {
    const ayati = createMockAyati();
    ayati.getPrayerSettings.mockResolvedValue({
      enabled: true,
      source: 'masjidly',
      mosqueSlug: 'mwhs',
      showIqamah: true,
      calculationCity: 'London',
      calculationCountry: 'United Kingdom',
      city: 'Sheffield',
      country: 'United Kingdom',
      method: 15,
      school: 0,
      reminderLeadMinutes: 10,
      quietMinutesAfterPrayer: 15,
      hasSavedSettings: true,
      use24h: true,
    });
    ayati.getPrayerTimes.mockResolvedValue({
      today: {
        date: '2026-05-02',
        city: 'Sheffield',
        country: 'United Kingdom',
        method: 0,
        school: 0,
        timezone: 'Europe/London',
        source: 'masjidly',
        fetchedAt: Date.now(),
        prayers: [
          { name: 'fajr', label: 'Fajr', time: '04:11', iqamahTime: '04:30', at: Date.now() + 1000, isReminderEnabled: true },
        ],
      },
      tomorrow: null,
    });
    Object.defineProperty(window, 'ayati', { configurable: true, value: asAyati(ayati) });

    await act(async () => { render(<Assistant />); });

    expect(await screen.findByRole('columnheader', { name: 'Adhan' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Iqamah' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '04:11' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '04:30' })).toBeInTheDocument();
  });

  it('uses list semantics when iqamah is hidden', async () => {
    const ayati = createMockAyati();
    ayati.getPrayerSettings.mockResolvedValue({
      enabled: true,
      source: 'calculation',
      mosqueSlug: '',
      showIqamah: false,
      calculationCity: 'London',
      calculationCountry: 'United Kingdom',
      city: 'London',
      country: 'United Kingdom',
      method: 15,
      school: 0,
      reminderLeadMinutes: 10,
      quietMinutesAfterPrayer: 15,
      hasSavedSettings: true,
      use24h: true,
    });
    Object.defineProperty(window, 'ayati', { configurable: true, value: asAyati(ayati) });

    await act(async () => { render(<Assistant />); });

    expect(await screen.findByRole('list', { name: 'Prayer times' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Adhan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('keeps prayer setup off the Prayers tab after the first saved setup', async () => {
    const ayati = createMockAyati();
    ayati.getPrayerSettings.mockResolvedValue({
      enabled: true,
      source: 'calculation',
      mosqueSlug: '',
      showIqamah: false,
      calculationCity: 'London',
      calculationCountry: 'United Kingdom',
      city: 'London',
      country: 'United Kingdom',
      method: 15,
      school: 0,
      reminderLeadMinutes: 10,
      quietMinutesAfterPrayer: 15,
      hasSavedSettings: true,
      use24h: true,
    });
    Object.defineProperty(window, 'ayati', {
      configurable: true,
      value: asAyati(ayati),
    });

    await act(async () => {
      render(<Assistant />);
    });

    expect(await screen.findByRole('tab', { name: 'Prayers' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Prayer calculation method')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(await screen.findByText('Prayer Times')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Prayer Times'));
    expect(await screen.findByRole('combobox', { name: /prayer country/i })).toHaveTextContent('United Kingdom');
  });
});

describe('Assistant settings shortcuts', () => {
  it('does not show AI provider setup in the settings tab', async () => {
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
      value: asAyati(ayati),
    });

    await act(async () => {
      render(<Assistant />);
    });

    await userEvent.click(await screen.findByRole('tab', { name: 'Settings' }));

    expect(await screen.findByText('Reminders')).toBeInTheDocument();
    expect(screen.queryByLabelText(/provider/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
  });

  it('shows shortcut controls without chat or screen reflection shortcuts', async () => {
    const ayati = createMockAyati();
    Object.defineProperty(window, 'ayati', {
      configurable: true,
      value: asAyati(ayati),
    });

    await act(async () => {
      render(<Assistant />);
    });

    await userEvent.click(await screen.findByRole('tab', { name: 'Settings' }));
    await userEvent.click(await screen.findByText('Shortcuts'));

    const openAssistant = await screen.findByText('Open Assistant');
    const hideApp = screen.getByText('Hide App');
    expect(openAssistant.compareDocumentPosition(hideApp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText('Open Chat')).not.toBeInTheDocument();
    expect(screen.queryByText('Reflect on Screen')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change open assistant shortcut, currently ⌘ \+ ⌥ \+ \./i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change hide app shortcut, currently ⌘ \+ ⌥ \+ ,/i })).toBeInTheDocument();
  });
});

describe('Assistant developer settings', () => {
  it('lists every available selected companion state in developer settings', async () => {
    const ayati = createMockAyati();
    ayati.getSettings = vi.fn().mockResolvedValue({
      pet: { appearanceId: 'ayah', transparentWhenSleeping: false },
      dev: { showPetModeOverlay: false },
    });
    Object.defineProperty(window, 'ayati', {
      configurable: true,
      value: asAyati(ayati),
    });

    await act(async () => {
      render(<Assistant />);
    });

    await userEvent.click(await screen.findByRole('tab', { name: 'Settings' }));
    await userEvent.click(await screen.findByText('Developer'));

    expect(await screen.findByRole('button', { name: 'running-right' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'review' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'curious' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'surprised' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'review' }));

    expect(ayati.executePetAction).toHaveBeenCalledWith({ type: 'set_mood', value: 'review' });
  });

  it('can trigger a test reminder comment from developer settings', async () => {
    const ayati = createMockAyati();
    Object.defineProperty(window, 'ayati', {
      configurable: true,
      value: asAyati(ayati),
    });

    await act(async () => {
      render(<Assistant />);
    });

    await userEvent.click(await screen.findByRole('tab', { name: 'Settings' }));
    await userEvent.click(await screen.findByText('Developer'));
    await userEvent.click(await screen.findByRole('button', { name: /test reminder comment/i }));

    expect(ayati.forceTimedReminderComment).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(ayati.closeAssistant).toHaveBeenCalledTimes(1);
    });
  });

  it('can trigger a test Maghrib prayer reminder from developer settings', async () => {
    const ayati = createMockAyati();
    Object.defineProperty(window, 'ayati', {
      configurable: true,
      value: asAyati(ayati),
    });

    await act(async () => {
      render(<Assistant />);
    });

    await userEvent.click(await screen.findByRole('tab', { name: 'Settings' }));
    await userEvent.click(await screen.findByText('Developer'));
    await userEvent.click(await screen.findByRole('button', { name: /test prayer reminder \(maghrib\)/i }));

    expect(ayati.forcePrayerReminderComment).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(ayati.closeAssistant).toHaveBeenCalledTimes(1);
    });
  });

  it('can trigger a test to do reminder from developer settings', async () => {
    const ayati = createMockAyati();
    Object.defineProperty(window, 'ayati', {
      configurable: true,
      value: asAyati(ayati),
    });

    await act(async () => {
      render(<Assistant />);
    });

    await userEvent.click(await screen.findByRole('tab', { name: 'Settings' }));
    await userEvent.click(await screen.findByText('Developer'));
    await userEvent.click(await screen.findByRole('button', { name: /test to do reminder/i }));

    expect(ayati.forceTodoReminderComment).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(ayati.closeAssistant).toHaveBeenCalledTimes(1);
    });
  });
});
