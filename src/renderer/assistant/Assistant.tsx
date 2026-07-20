import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { SmartDatePicker } from '@/components/ui/smart-date-picker';
import { cn } from '@/lib/utils';
import { Icon } from '@iconify/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import AnimatedTabs from '@/components/smoothui/animated-tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

import { getTafsirParagraphs, TranslationWithFootnotes } from '../screenshot-question/AyahVerseCard';
import { QulArabicText } from '../components/QulArabicText';
import { HotkeyInput } from '../components/HotkeyInput';
import { SettingsSection } from '../components/SettingsSection';
import {
  PET_APPEARANCE_IDS,
  PET_APPEARANCE_LABELS,
  normalizePetAppearanceId,
  type PetAppearanceId,
} from '../../shared/pet-appearance';
import { APP_DISPLAY_NAME, APP_FULL_NAME } from '../../shared/app-branding';
import { getClientPomodoroRemainingMs } from '../../shared/pomodoro-client';
import { getNextPrayer } from '../../shared/prayer-schedule';
import { filterAvailableRecitationResources } from '../../shared/quran-reciter-preferences';
import { getAtlasForAppearance, type PetClipId } from '../pet/pet-sprite-atlas';

import { KeychainConsentModal } from '../components/KeychainConsentModal';
import { KEYCHAIN_CONSENT_LEDE } from '../../shared/keychain-consent';

type Tab = 'prayers' | 'todos' | 'focus' | 'reflections' | 'settings';
type UpdateAction = 'check' | 'download' | 'install';
type MasjidlyMosque = MasjidlyMosqueSummary;
type MasjidlyDirectoryStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Legacy timed-reminder copy; hidden in the reflections list. */
const LEGACY_TIMED_REMINDER_WHY = 'This reminder was shown on the interval you set.';

const isDevEnvironment = import.meta.env.DEV;

const QURAN_FONT_OPTIONS = [
  { value: 'madani1421', label: 'Madani' },
  { value: 'indoPakNastaleeq', label: 'Indo-Pak' },
] as const;

function resolveSettingsQulMushafKey(mushafKey: string | undefined): (typeof QURAN_FONT_OPTIONS)[number]['value'] {
  if (mushafKey === 'indoPakNastaleeq' || mushafKey === 'qpcNastaleeq') return 'indoPakNastaleeq';
  return 'madani1421';
}

function isQulFontPackMissing(
  packs: Record<string, boolean> | null | undefined,
  mushafValue: string,
): boolean {
  if (!packs) return false;
  return packs[mushafValue] === false;
}

function isPrayerTimesBundle(payload: PrayerTimesBundle | PrayerDay | null): payload is PrayerTimesBundle {
  return payload !== null && typeof payload === 'object' && 'today' in payload;
}

function applyPrayerTimesPayload(
  payload: PrayerTimesBundle | PrayerDay | null,
  setToday: (day: PrayerDay | null) => void,
  setTomorrow: (day: PrayerDay | null) => void,
): void {
  if (!payload) {
    setToday(null);
    setTomorrow(null);
    return;
  }
  if (isPrayerTimesBundle(payload)) {
    setToday(payload.today);
    setTomorrow(payload.tomorrow ?? null);
    return;
  }
  setToday(payload);
  setTomorrow(null);
}

/** Formats milliseconds until next prayer as -H:MM:SS or -M:SS (leading minus marks countdown). */
function formatNextPrayerCountdown(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '-0:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `-${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `-${m}:${String(s).padStart(2, '0')}`;
}

function normalizeTodoItems(value: unknown): TodoItem[] {
  return Array.isArray(value) ? (value as TodoItem[]) : [];
}

function formatTodoDate(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;

  try {
    return format(value, 'MMM d');
  } catch {
    return null;
  }
}

const DEFAULT_PRAYER_DRAFT: PrayerSettings = {
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
};

function formatPrayerTime(time: string, use24h: boolean): string {
  if (!/^\d{2}:\d{2}$/.test(time) || use24h) return time;
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

const PRAYER_LOCATION_PRESETS = [
  { country: 'United Kingdom', cities: ['London', 'Birmingham', 'Manchester', 'Glasgow', 'Leeds', 'Liverpool', 'Newcastle upon Tyne', 'Sheffield', 'Bristol', 'Belfast', 'Leicester', 'Edinburgh', 'Brighton', 'Bournemouth', 'Cardiff', 'Nottingham', 'Southampton', 'Portsmouth', 'Coventry', 'Bradford'] },
  { country: 'United States', cities: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'Jacksonville', 'Austin', 'Fort Worth', 'San Jose', 'Columbus', 'Charlotte', 'Indianapolis', 'San Francisco', 'Seattle', 'Denver', 'Oklahoma City'] },
  { country: 'Canada', cities: ['Toronto', 'Montreal', 'Calgary', 'Ottawa', 'Edmonton', 'Winnipeg', 'Mississauga', 'Vancouver', 'Brampton', 'Hamilton', 'Surrey', 'Quebec City', 'Halifax', 'Laval', 'London', 'Markham', 'Vaughan', 'Gatineau', 'Saskatoon', 'Longueuil'] },
  { country: 'United Arab Emirates', cities: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Al Ain', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain', 'Khor Fakkan', 'Dibba Al-Fujairah', 'Kalba', 'Jebel Ali', 'Ruwais', 'Madinat Zayed', 'Ghayathi', 'Liwa Oasis', 'Al Dhaid', 'Hatta', 'Ar-Rams', 'Diba Al-Hisn'] },
  { country: 'Saudi Arabia', cities: ['Riyadh', 'Jeddah', 'Makkah', 'Madinah', 'Dammam', 'Taif', 'Tabuk', 'Buraidah', 'Khamis Mushait', 'Al Khobar', 'Hail', 'Najran', 'Al Jubail', 'Abha', 'Yanbu', 'Al Qatif', 'Al Hofuf', 'Al Mubarraz', 'Sakaka', 'Arar'] },
  { country: 'Turkey', cities: ['Istanbul', 'Ankara', 'Izmir', 'Bursa', 'Antalya', 'Adana', 'Konya', 'Gaziantep', 'Sanliurfa', 'Kocaeli', 'Mersin', 'Diyarbakir', 'Hatay', 'Manisa', 'Kayseri', 'Samsun', 'Balikesir', 'Kahramanmaras', 'Van', 'Aydin'] },
  { country: 'Malaysia', cities: ['Kuala Lumpur', 'Seberang Perai', 'Kajang', 'Klang', 'Subang Jaya', 'George Town', 'Ipoh', 'Shah Alam', 'Petaling Jaya', 'Iskandar Puteri', 'Johor Bahru', 'Seremban', 'Kuala Terengganu', 'Kota Kinabalu', 'Kuantan', 'Alor Setar', 'Malacca City', 'Kota Bharu', 'Miri', 'Sandakan'] },
  { country: 'Indonesia', cities: ['Jakarta', 'Surabaya', 'Bekasi', 'Bandung', 'Medan', 'Depok', 'Tangerang', 'Palembang', 'Semarang', 'Makassar', 'South Tangerang', 'Batam', 'Pekanbaru', 'Bogor', 'Bandar Lampung', 'Padang', 'Malang', 'Denpasar', 'Samarinda', 'Tasikmalaya'] },
  { country: 'Pakistan', cities: ['Karachi', 'Lahore', 'Faisalabad', 'Rawalpindi', 'Gujranwala', 'Peshawar', 'Multan', 'Hyderabad', 'Islamabad', 'Quetta', 'Bahawalpur', 'Sargodha', 'Sialkot', 'Sukkur', 'Larkana', 'Sheikhupura', 'Rahim Yar Khan', 'Jhang', 'Dera Ghazi Khan', 'Gujrat'] },
  { country: 'India', cities: ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Ahmedabad', 'Chennai', 'Kolkata', 'Surat', 'Pune', 'Jaipur', 'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Thane', 'Bhopal', 'Visakhapatnam', 'Pimpri-Chinchwad', 'Patna', 'Vadodara'] },
] as const;

/** AlAdhan method IDs from api.aladhan.com/v1/methods — excludes 0 (Shia/Jafari) and 99 (custom angles; not supported here). */
const PRAYER_CALCULATION_METHODS = [
  { id: 19, label: 'Algeria' },
  { id: 22, label: 'Comunidade Islamica de Lisboa (Portugal)' },
  { id: 13, label: 'Diyanet İşleri Başkanlığı, Turkey (experimental)' },
  { id: 16, label: 'Dubai (experimental)' },
  { id: 5, label: 'Egyptian General Authority of Survey' },
  { id: 8, label: 'Gulf Region' },
  { id: 7, label: 'Institute of Geophysics, University of Tehran' },
  { id: 2, label: 'Islamic Society of North America (ISNA)' },
  { id: 17, label: 'Jabatan Kemajuan Islam Malaysia (JAKIM)' },
  { id: 20, label: 'Kementerian Agama Republik Indonesia' },
  { id: 9, label: 'Kuwait' },
  { id: 11, label: 'Majlis Ugama Islam Singapura, Singapore' },
  { id: 23, label: 'Ministry of Awqaf, Islamic Affairs and Holy Places, Jordan' },
  { id: 15, label: 'Moonsighting Committee Worldwide (Moonsighting.com)' },
  { id: 21, label: 'Morocco' },
  { id: 3, label: 'Muslim World League' },
  { id: 10, label: 'Qatar' },
  { id: 14, label: 'Spiritual Administration of Muslims of Russia' },
  { id: 18, label: 'Tunisia' },
  { id: 4, label: 'Umm Al-Qura University, Makkah' },
  { id: 12, label: 'Union Organization Islamic de France' },
  { id: 1, label: 'University of Islamic Sciences, Karachi' },
] as const;

const PRAYER_CALCULATION_METHOD_UK_NOTE =
  'AlAdhan does not define a UK-only method. Muslim World League or Moonsighting Committee Worldwide are commonly used in the UK when matched to your mosque.';

const PRAYER_JURISTIC_SCHOOLS = [
  { id: 0, label: 'Shafi, Maliki, Hanbali' },
  { id: 1, label: 'Hanafi' },
] as const;

function getPrayerCountryOptions(currentCountry: string): string[] {
  const countries = PRAYER_LOCATION_PRESETS.map((preset) => preset.country as string);
  return currentCountry && !countries.includes(currentCountry)
    ? [currentCountry, ...countries]
    : countries;
}

function getPrayerCityOptions(country: string, currentCity: string): string[] {
  const preset = PRAYER_LOCATION_PRESETS.find((entry) => entry.country === country);
  const cities = preset?.cities ? [...preset.cities] as string[] : [];
  return currentCity && !cities.includes(currentCity)
    ? [currentCity, ...cities]
    : cities;
}

function getUpdateAction(state: DesktopUpdateState | null): UpdateAction {
  if (state?.status === 'available') return 'download';
  if (state?.status === 'downloaded') return 'install';
  return 'check';
}

function getUpdateStatusLabel(state: DesktopUpdateState | null): string {
  if (!state) return 'Loading update status...';
  if (!state.enabled) return 'Updates unavailable';
  if (state.status === 'idle') return 'Ready to check';
  if (state.status === 'checking') return 'Checking for updates...';
  if (state.status === 'up-to-date') return 'Up to date';
  if (state.status === 'available') return `Version ${state.availableVersion ?? 'new'} is available`;
  if (state.status === 'downloading') {
    const percent = typeof state.downloadPercent === 'number'
      ? ` (${Math.floor(state.downloadPercent)}%)`
      : '';
    return `Downloading update${percent}`;
  }
  if (state.status === 'downloaded') return `Version ${state.downloadedVersion ?? 'new'} is ready`;
  return 'Update check failed';
}

function getUpdateButtonLabel(state: DesktopUpdateState | null): string {
  const action = getUpdateAction(state);
  if (action === 'download') return 'Download Update';
  if (action === 'install') return 'Restart and Install';
  if (state?.status === 'checking') return 'Checking...';
  return 'Check for Updates';
}

function isUpdateButtonDisabled(state: DesktopUpdateState | null): boolean {
  if (!state || !state.enabled) return true;
  return state.status === 'checking' || state.status === 'downloading';
}

function shouldShowTitleBarUpdateButton(state: DesktopUpdateState | null): boolean {
  if (!state?.enabled) return false;
  if (state.status === 'available' || state.status === 'downloading' || state.status === 'downloaded') {
    return true;
  }
  return state.status === 'error' && state.canRetry;
}

function getTitleBarUpdateButtonText(state: DesktopUpdateState | null): string {
  if (!state) return 'Update';
  if (state.status === 'available') return 'Update';
  if (state.status === 'downloading') {
    return typeof state.downloadPercent === 'number'
      ? `Downloading ${Math.floor(state.downloadPercent)}%`
      : 'Downloading…';
  }
  if (state.status === 'downloaded') return 'Restart to update';
  if (state.status === 'error' && state.canRetry) return 'Retry update';
  return 'Update';
}

function catalogLanguageLabel(resource: { languageName?: string }): string {
  const raw = resource.languageName?.trim();
  if (!raw || raw.length === 0) return 'Other';
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

const DEFAULT_TRANSLATION_LANGUAGE = 'English';
const PREFERRED_TRANSLATION_ID = 131;
const PREFERRED_TAFSIR_ID = 169;

type QuranContentListResource = { id: number; name: string; languageName?: string };
type PomodoroMinuteSettingKey = 'focusMinutes' | 'breakMinutes';



export const Assistant: React.FC = () => {
  // #region agent log
  fetch('http://127.0.0.1:7445/ingest/5150cd8d-c9d2-4c97-b3e9-ffd5b4699b08', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '9312c8' },
    body: JSON.stringify({
      sessionId: '9312c8',
      location: 'Assistant.tsx:render',
      message: 'Assistant render start',
      data: { hasAyati: typeof window.ayati !== 'undefined' },
      hypothesisId: 'B',
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  const [activeTab, setActiveTab] = useState<Tab>('prayers');
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [ayahSettings, setAyahSettings] = useState<AyahLensSettings | null>(null);
  const [quranAuthStatus, setQuranAuthStatus] = useState<QuranAuthStatus>({ isConnected: false, scopes: [] });
  const [reflections, setReflections] = useState<AyahReflection[]>([]);
  const [collections, setCollections] = useState<AyahCollection[]>([]);
  const [reflectionSearch, setReflectionSearch] = useState('');
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [hiddenTafsirs, setHiddenTafsirs] = useState<Set<string>>(new Set());
  const setReflectionsWithTafsirDefaultClosed = useCallback((nextReflections: AyahReflection[]) => {
    setReflections(nextReflections);
    setHiddenTafsirs((prev) => {
      const next = new Set(prev);
      for (const r of nextReflections) {
        if (r.tafsir?.text?.trim()) next.add(r.id);
      }
      return next;
    });
  }, []);
  const [openNoteEditors, setOpenNoteEditors] = useState<Set<string>>(new Set());
  const [prayerSettings, setPrayerSettings] = useState<PrayerSettings | null>(null);
  const [prayerDay, setPrayerDay] = useState<PrayerDay | null>(null);
  const [prayerTomorrow, setPrayerTomorrow] = useState<PrayerDay | null>(null);
  const [prayerDraft, setPrayerDraft] = useState<PrayerSettings | null>(null);
  const [masjidlyMosques, setMasjidlyMosques] = useState<MasjidlyMosque[]>([]);
  const [masjidlyDirectoryStatus, setMasjidlyDirectoryStatus] = useState<MasjidlyDirectoryStatus>('idle');
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [todoTitle, setTodoTitle] = useState('');
  const [todoNotes, setTodoNotes] = useState('');
  const [todoPriority, setTodoPriority] = useState<TodoPriority>('none');
  const [todoDueDate, setTodoDueDate] = useState<Date>();
  const [todoReminderDate, setTodoReminderDate] = useState<Date>();
  const [todoAddDropdownOpen, setTodoAddDropdownOpen] = useState(false);
  const [pomodoroState, setPomodoroState] = useState<PomodoroState | null>(null);
  const [pomodoroSettingsDraft, setPomodoroSettingsDraft] = useState<Record<PomodoroMinuteSettingKey, string>>({
    focusMinutes: '25',
    breakMinutes: '10',
  });
  /** Bumps once per second while a session is running so `Date.now()`-based remaining time re-renders. */
  const [pomodoroUiTick, setPomodoroUiTick] = useState(0);
  const [selectedFocusTodoId, setSelectedFocusTodoId] = useState('');
  const [updateState, setUpdateState] = useState<DesktopUpdateState | null>(null);
  const selectedPetAppearanceId = normalizePetAppearanceId(
    (settings.pet as { appearanceId?: unknown } | undefined)?.appearanceId,
  );
  const forcedCompanionStates = useMemo(() => {
    try {
      const clips = Object.keys(getAtlasForAppearance(selectedPetAppearanceId).clips) as PetClipId[];
      // #region agent log
      fetch('http://127.0.0.1:7445/ingest/5150cd8d-c9d2-4c97-b3e9-ffd5b4699b08', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '9312c8' },
        body: JSON.stringify({
          sessionId: '9312c8',
          location: 'Assistant.tsx:atlas',
          message: 'pet atlas resolved',
          data: { appearanceId: selectedPetAppearanceId, clipCount: clips.length },
          hypothesisId: 'D',
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      return clips;
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7445/ingest/5150cd8d-c9d2-4c97-b3e9-ffd5b4699b08', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '9312c8' },
        body: JSON.stringify({
          sessionId: '9312c8',
          location: 'Assistant.tsx:atlas',
          message: 'pet atlas error',
          data: {
            appearanceId: selectedPetAppearanceId,
            error: error instanceof Error ? error.message : String(error),
          },
          hypothesisId: 'D',
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      throw error;
    }
  }, [selectedPetAppearanceId]);
  const [quranStatusMessage, setQuranStatusMessage] = useState('');
  const [keychainConsentOpen, setKeychainConsentOpen] = useState(false);
  const keychainConsentActionRef = useRef<(() => void | Promise<void>) | null>(null);
  const [qulFontPacks, setQulFontPacks] = useState<Record<string, boolean> | null>(null);
  const [recitationResources, setRecitationResources] = useState<QuranRecitationResource[]>([]);
  const [tafsirResources, setTafsirResources] = useState<QuranContentListResource[]>([]);
  const [translationResources, setTranslationResources] = useState<QuranContentListResource[]>([]);
  const [translationLanguageFilter, setTranslationLanguageFilter] = useState<string>(DEFAULT_TRANSLATION_LANGUAGE);
  const todoAddDropdownRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  const switchTab = useCallback((nextTab: Tab) => {
    setActiveTab(nextTab);
  }, []);

  const requestKeychainConsent = useCallback(async (action: () => void | Promise<void>) => {
    const status = await window.ayati.getKeychainConsentStatus();
    if (!status.required || status.acknowledged) {
      await action();
      return;
    }
    keychainConsentActionRef.current = action;
    setKeychainConsentOpen(true);
  }, []);

  const handleKeychainConsentContinue = useCallback(async () => {
    await window.ayati.acknowledgeKeychainConsent();
    setKeychainConsentOpen(false);
    const action = keychainConsentActionRef.current;
    keychainConsentActionRef.current = null;
    if (action) {
      await action();
    }
  }, []);

  const handleKeychainConsentCancel = useCallback(() => {
    keychainConsentActionRef.current = null;
    setKeychainConsentOpen(false);
  }, []);

  const ayahQulSettingsKey = useMemo(() => {
    if (!ayahSettings) return '';
    return `${ayahSettings.qulMushafKey ?? ''}:${ayahSettings.qulArabicEnabled !== false}`;
  }, [ayahSettings]);

  const translationCatalogLanguages = useMemo(() => {
    const labels = new Set<string>();
    for (const t of translationResources) {
      labels.add(catalogLanguageLabel(t));
    }
    return Array.from(labels).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [translationResources]);

  const translationsForSettingsPicker = useMemo(() => {
    let list = translationResources;
    if (translationLanguageFilter !== 'all') {
      list = list.filter((t) => catalogLanguageLabel(t) === translationLanguageFilter);
    }
    return [...list].sort((a, b) => {
      const byLang = (a.languageName || '').localeCompare(b.languageName || '', undefined, { sensitivity: 'base' });
      if (byLang !== 0) return byLang;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }, [translationResources, translationLanguageFilter]);

  useEffect(() => {
    void window.ayati.getQulFontPacks().then(setQulFontPacks).catch(() => setQulFontPacks(null));
  }, []);

  useEffect(() => {
    const root = document.getElementById('root');
    const shell = shellRef.current;
    // #region agent log
    fetch('http://127.0.0.1:7445/ingest/5150cd8d-c9d2-4c97-b3e9-ffd5b4699b08', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '9312c8' },
      body: JSON.stringify({
        sessionId: '9312c8',
        location: 'Assistant.tsx:layout',
        message: 'layout dimensions after mount',
        data: {
          rootRect: root ? JSON.stringify(root.getBoundingClientRect()) : null,
          shellRect: shell ? JSON.stringify(shell.getBoundingClientRect()) : null,
          rootChildCount: root?.childElementCount ?? 0,
        },
        hypothesisId: 'C',
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [activeTab]);

  useEffect(() => {
    if (!pomodoroState?.settings) return;
    setPomodoroSettingsDraft({
      focusMinutes: String(pomodoroState.settings.focusMinutes),
      breakMinutes: String(pomodoroState.settings.breakMinutes),
    });
  }, [pomodoroState?.settings.focusMinutes, pomodoroState?.settings.breakMinutes]);

  useEffect(() => {
    const pomodoroRunning = pomodoroState?.activeSession?.status === 'running';
    const prayersTabNeedsClock = activeTab === 'prayers';
    if (!pomodoroRunning && !prayersTabNeedsClock) return;
    const id = window.setInterval(() => setPomodoroUiTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [activeTab, pomodoroState?.activeSession?.id, pomodoroState?.activeSession?.status]);

  // Initialize
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7445/ingest/5150cd8d-c9d2-4c97-b3e9-ffd5b4699b08', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '9312c8' },
      body: JSON.stringify({
        sessionId: '9312c8',
        location: 'Assistant.tsx:init',
        message: 'init effect start',
        data: { hasAyati: typeof window.ayati !== 'undefined' },
        hypothesisId: 'B',
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    if (typeof window.ayati === 'undefined') {
      // #region agent log
      fetch('http://127.0.0.1:7445/ingest/5150cd8d-c9d2-4c97-b3e9-ffd5b4699b08', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '9312c8' },
        body: JSON.stringify({
          sessionId: '9312c8',
          location: 'Assistant.tsx:init',
          message: 'window.ayati missing in init effect',
          data: {},
          hypothesisId: 'B',
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      return;
    }

    window.ayati.getSettings().then((s) => {
      setSettings(s as Record<string, unknown>);
    });
    window.ayati.getAyahLensSettings().then(setAyahSettings);
    window.ayati.getAyahRecitationResources?.()
      .then((resources) => setRecitationResources(filterAvailableRecitationResources(resources)))
      .catch(() => setRecitationResources([]));
    void window.ayati.getAyahTafsirResources().then(setTafsirResources).catch(() => setTafsirResources([]));
    void window.ayati.getAyahTranslationResources().then(setTranslationResources).catch(() => setTranslationResources([]));
    window.ayati.getQuranAuthStatus().then(setQuranAuthStatus);
    void window.ayati.getKeychainConsentStatus().then((status) => {
      if (status.required && !status.acknowledged && status.hasStoredSecrets) {
        setKeychainConsentOpen(true);
      }
    });
    window.ayati.getAyahReflectionHistory().then(setReflectionsWithTafsirDefaultClosed);
    window.ayati.getAyahCollections?.().then(setCollections);
    window.ayati.getPrayerSettings?.().then((settings) => {
      setPrayerSettings(settings);
      setPrayerDraft(settings);
    });
    window.ayati.getPrayerTimes?.().then((payload) => {
      applyPrayerTimesPayload(payload ?? null, setPrayerDay, setPrayerTomorrow);
    });
    window.ayati.getTodos?.().then((nextTodos) => setTodos(normalizeTodoItems(nextTodos)));
    window.ayati.onTodosUpdated?.((nextTodos) => setTodos(normalizeTodoItems(nextTodos)));
    window.ayati.getPomodoroState?.().then(setPomodoroState);
    window.ayati.getUpdateState().then(setUpdateState);

    window.ayati.onUpdateState(setUpdateState);
    window.ayati.onAyahOAuthCallback((callbackUrl) => {
      window.ayati.completeQuranOAuthCallback(callbackUrl).then((status) => {
        setQuranAuthStatus(status);
        setQuranStatusMessage(status.error ?? 'Quran Foundation account connected.');
      });
    });

    window.ayati.onSwitchToChat(() => {
      switchTab('prayers');
    });

    window.ayati.onSwitchToSettings(() => {
      switchTab('settings');
    });

    window.ayati.onSwitchToPrayers?.(() => {
      switchTab('prayers');
    });

    window.ayati.onSwitchToTodos?.(() => {
      switchTab('todos');
    });

    window.ayati.onSwitchToFocus?.(() => {
      switchTab('focus');
    });

    window.ayati.onSwitchToReflections?.(() => {
      switchTab('reflections');
      void window.ayati.getAyahReflectionHistory().then(setReflectionsWithTafsirDefaultClosed);
    });

    window.ayati.onReflectionsUpdated?.(() => {
      void window.ayati.getAyahReflectionHistory().then(setReflectionsWithTafsirDefaultClosed);
    });

    return () => {
      window.ayati.removeAllListeners();
    };
  }, [switchTab]);

  const updateSetting = useCallback(async (key: string, value: unknown) => {
    const newSettings = await window.ayati.updateSettings(key, value);
    setSettings(newSettings as Record<string, unknown>);
  }, []);

  const updateAyahSetting = useCallback(async (key: string, value: unknown) => {
    const nextSettings = await window.ayati.updateAyahLensSetting(key, value);
    setAyahSettings(nextSettings);
  }, []);

  useEffect(() => {
    if (translationsForSettingsPicker.length === 0 || !ayahSettings) return;
    if (!translationsForSettingsPicker.some((t) => t.id === ayahSettings.translationId)) {
      const preferred = translationsForSettingsPicker.find((t) => t.id === PREFERRED_TRANSLATION_ID)
        ?? translationsForSettingsPicker[0];
      void updateAyahSetting('translationId', preferred.id);
    }
  }, [translationsForSettingsPicker, ayahSettings, updateAyahSetting]);

  useEffect(() => {
    if (tafsirResources.length === 0 || !ayahSettings) return;
    const currentId = ayahSettings.tafsirResourceId;
    if (currentId && tafsirResources.some((r) => r.id === currentId)) return;
    const preferred = tafsirResources.find((r) => r.id === PREFERRED_TAFSIR_ID) ?? tafsirResources[0];
    void updateAyahSetting('tafsirResourceId', preferred.id);
    if (preferred.name) void updateAyahSetting('tafsirResourceName', preferred.name);
  }, [tafsirResources, ayahSettings, updateAyahSetting]);

  const updateReminderListenReciter = useCallback(async (rawRecitationId: string) => {
    const recitationId = Number(rawRecitationId);
    const resource = recitationResources.find((item) => item.id === recitationId);
    if (!resource) return;
    const nextSettings = await window.ayati.updateAyahLensSetting('recitationId', resource.id);
    setAyahSettings(nextSettings);
    const namedSettings = await window.ayati.updateAyahLensSetting('reciterName', resource.name);
    setAyahSettings(namedSettings);
  }, [recitationResources]);

  const handleUpdateAction = useCallback(async () => {
    if (isUpdateButtonDisabled(updateState)) return;

    const action = getUpdateAction(updateState);
    try {
      if (action === 'download') {
        const result = await window.ayati.downloadUpdate();
        setUpdateState(result.state);
        if (!result.completed && result.state.message) {
          alert(result.state.message);
        }
        return;
      }

      if (action === 'install') {
        const confirmed = confirm('Restart Ayati - Quran Desktop Companion now to install the downloaded update?');
        if (!confirmed) return;
        const result = await window.ayati.installUpdate();
        setUpdateState(result.state);
        if (!result.accepted && result.state.message) {
          alert(result.state.message);
        }
        return;
      }

      const result = await window.ayati.checkForUpdate();
      setUpdateState(result.state);
      if (!result.checked && result.state.message) {
        alert(result.state.message ?? 'Automatic updates are not available in this build.');
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Update action failed.');
    }
  }, [updateState]);

  const refreshReflections = useCallback(async () => {
    const nextReflections = await window.ayati.getAyahReflectionHistory();
    setReflectionsWithTafsirDefaultClosed(nextReflections);
  }, [setReflectionsWithTafsirDefaultClosed]);

  const loadReflectionTafsir = useCallback(async (reflectionId: string) => {
    const resourceId = typeof ayahSettings?.tafsirResourceId === 'number' && ayahSettings.tafsirResourceId > 0
      ? ayahSettings.tafsirResourceId
      : undefined;
    await window.ayati.getAyahTafsir(reflectionId, resourceId);
    await refreshReflections();
  }, [refreshReflections, ayahSettings?.tafsirResourceId]);

  const loadReflectionAudio = useCallback(async (reflectionId: string) => {
    await window.ayati.getAyahAudio(reflectionId);
    await refreshReflections();
  }, [refreshReflections]);

  const addReflectionToCollectionFromPanel = useCallback(async (reflectionId: string, collectionId: string) => {
    await window.ayati.addReflectionToCollection(reflectionId, collectionId);
    await refreshReflections();
    setQuranStatusMessage('Collection updated.');
  }, [refreshReflections]);

  const savePrayerSettings = useCallback(async () => {
    if (!prayerDraft) return;
    const nextSettings = await window.ayati.updatePrayerSettings({
      ...prayerDraft,
      hasSavedSettings: true,
    });
    setPrayerSettings(nextSettings);
    setPrayerDraft(nextSettings);
    const bundle = await window.ayati.refreshPrayerTimes().catch(() => null);
    applyPrayerTimesPayload(bundle, setPrayerDay, setPrayerTomorrow);
  }, [prayerDraft]);

  const loadMasjidlyDirectory = useCallback(async () => {
    setMasjidlyDirectoryStatus('loading');
    try {
      const mosques = await window.ayati.listMasjidlyMosques();
      setMasjidlyMosques(mosques);
      setMasjidlyDirectoryStatus('ready');
    } catch {
      setMasjidlyMosques([]);
      setMasjidlyDirectoryStatus('error');
    }
  }, []);

  useEffect(() => {
    const source = prayerDraft?.source ?? prayerSettings?.source;
    if (source !== 'masjidly') return;
    if (masjidlyDirectoryStatus !== 'idle') return;
    void loadMasjidlyDirectory();
  }, [loadMasjidlyDirectory, masjidlyDirectoryStatus, prayerDraft?.source, prayerSettings?.source]);

  const updatePrayerSettingsFromSettings = useCallback(async (patch: Partial<PrayerSettings>) => {
    const nextSettings = await window.ayati.updatePrayerSettings(patch);
    setPrayerSettings(nextSettings);
    setPrayerDraft(nextSettings);
    const affectsPrayerSchedule =
      ('source' in patch || 'mosqueSlug' in patch || 'method' in patch || 'school' in patch || 'city' in patch || 'country' in patch);
    if (affectsPrayerSchedule) {
      const bundle = await window.ayati.refreshPrayerTimes().catch(() => null);
      applyPrayerTimesPayload(bundle, setPrayerDay, setPrayerTomorrow);
    }
  }, []);

  /** Saves calculation fields to the main process and refreshes displayed times without replacing unsaved draft fields (city/country until Save). */
  const persistPrayerCalculationFromDraft = useCallback((partial: Partial<Pick<PrayerSettings, 'method' | 'school'>>) => {
    void (async () => {
      const nextSettings = await window.ayati.updatePrayerSettings(partial);
      setPrayerSettings(nextSettings);
      const bundle = await window.ayati.refreshPrayerTimes().catch(() => null);
      applyPrayerTimesPayload(bundle, setPrayerDay, setPrayerTomorrow);
    })();
  }, []);

  const createTodoFromPanel = useCallback(async () => {
    const title = todoTitle.trim();
    if (!title) return;
    const nextTodos = await window.ayati.createTodo({
      title,
      notes: todoNotes,
      priority: todoPriority,
      dueAt: todoDueDate ? todoDueDate.getTime() : null,
      reminderAt: todoReminderDate ? todoReminderDate.getTime() : null,
    });
    setTodos(normalizeTodoItems(nextTodos));
    setTodoTitle('');
    setTodoNotes('');
    setTodoPriority('none');
    setTodoDueDate(undefined);
    setTodoReminderDate(undefined);
    setTodoAddDropdownOpen(false);
  }, [todoDueDate, todoNotes, todoPriority, todoReminderDate, todoTitle]);

  useEffect(() => {
    if (activeTab !== 'todos') {
      setTodoAddDropdownOpen(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!todoAddDropdownOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = todoAddDropdownRef.current;
      if (!root || root.contains(event.target as Node)) return;
      setTodoAddDropdownOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTodoAddDropdownOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [todoAddDropdownOpen]);

  const completeTodoFromPanel = useCallback(async (todoId: string, completed: boolean) => {
    setTodos(normalizeTodoItems(await window.ayati.completeTodo(todoId, completed)));
  }, []);

  const deleteTodoFromPanel = useCallback(async (todoId: string) => {
    if (!confirm('Delete this task?')) return;
    setTodos(normalizeTodoItems(await window.ayati.deleteTodo(todoId)));
  }, []);


  const updatePomodoroSettingsFromPanel = useCallback(async (patch: Partial<PomodoroSettings>) => {
    setPomodoroState(await window.ayati.updatePomodoroSettings(patch));
  }, []);

  const updatePomodoroMinuteDraftFromPanel = useCallback((key: PomodoroMinuteSettingKey, rawValue: string) => {
    setPomodoroSettingsDraft((current) => ({ ...current, [key]: rawValue }));
  }, []);

  const commitPomodoroMinuteDraftFromPanel = useCallback((key: PomodoroMinuteSettingKey) => {
    const fallback = pomodoroState?.settings[key] ?? (key === 'focusMinutes' ? 25 : 10);
    const rawValue = pomodoroSettingsDraft[key];
    const nextValue = Number(rawValue);

    if (rawValue.trim() === '' || !Number.isInteger(nextValue) || nextValue < 1) {
      setPomodoroSettingsDraft((current) => ({ ...current, [key]: String(fallback) }));
      return;
    }

    void updatePomodoroSettingsFromPanel({ [key]: nextValue });
  }, [pomodoroSettingsDraft, pomodoroState?.settings, updatePomodoroSettingsFromPanel]);

  const startPomodoroFromPanel = useCallback(async (kind: PomodoroSessionKind) => {
    const duration = kind === 'focus'
      ? pomodoroState?.settings.focusMinutes
      : pomodoroState?.settings.breakMinutes;
    setPomodoroState(await window.ayati.startPomodoro({
      kind,
      durationMinutes: duration,
      todoId: kind === 'focus' && selectedFocusTodoId ? selectedFocusTodoId : null,
    }));
  }, [pomodoroState?.settings.focusMinutes, pomodoroState?.settings.breakMinutes, selectedFocusTodoId]);

  const runQuranSignIn = useCallback(async () => {
    try {
      const { authorizeUrl } = await window.ayati.startQuranOAuth();
      window.ayati.openExternal(authorizeUrl);
      setQuranStatusMessage('Complete sign-in in your browser, then open Ayati from the callback page.');
    } catch (error) {
      const message = error instanceof Error && error.message.trim().length > 0
        ? error.message
        : 'Quran Foundation client ID is not configured.';
      setQuranStatusMessage(message);
    }
  }, []);

  const startQuranSignIn = useCallback(() => {
    void requestKeychainConsent(runQuranSignIn);
  }, [requestKeychainConsent, runQuranSignIn]);

  const disconnectQuran = useCallback(async () => {
    await window.ayati.disconnectQuranAccount();
    setQuranAuthStatus(await window.ayati.getQuranAuthStatus());
    setQuranStatusMessage('Quran Foundation account disconnected. Local reflections remain on this device.');
  }, []);

  const triggerTestReminderComment = useCallback(async () => {
    try {
      const didSendReminder = await window.ayati.forceTimedReminderComment();
      if (didSendReminder) {
        window.ayati.closeAssistant();
        return;
      }
      setQuranStatusMessage('Could not send a test reminder right now.');
    } catch (error) {
      setQuranStatusMessage(error instanceof Error ? error.message : 'Could not send a test reminder right now.');
    }
  }, []);

  const triggerTestPrayerReminderComment = useCallback(async () => {
    try {
      const didSend = await window.ayati.forcePrayerReminderComment();
      if (didSend) {
        window.ayati.closeAssistant();
        return;
      }
      setQuranStatusMessage('Could not send a test prayer reminder right now.');
    } catch (error) {
      setQuranStatusMessage(error instanceof Error ? error.message : 'Could not send a test prayer reminder right now.');
    }
  }, []);

  const triggerTestTodoReminderComment = useCallback(async () => {
    try {
      const didSend = await window.ayati.forceTodoReminderComment();
      if (didSend) {
        window.ayati.closeAssistant();
        return;
      }
      setQuranStatusMessage('Could not send a test to do reminder right now.');
    } catch (error) {
      setQuranStatusMessage(error instanceof Error ? error.message : 'Could not send a test to do reminder right now.');
    }
  }, []);

  const triggerWelcomeChatBubble = useCallback(async () => {
    try {
      const didSend = await window.ayati.forceWelcomeChatBubble();
      if (didSend) {
        window.ayati.closeAssistant();
        return;
      }
    } catch (error) {
      console.error('Failed to show welcome chat bubble:', error);
    }
  }, []);

  const closeWindow = useCallback(() => {
    window.ayati.closeAssistant();
  }, []);

  const filteredReflections = reflections.filter((reflection) => {
    const query = reflectionSearch.trim().toLowerCase();
    return !query || [
      reflection.verseKey,
      reflection.surahName,
      reflection.translation,
      reflection.reflection,
      reflection.note?.body ?? '',
    ].join(' ').toLowerCase().includes(query);
  });
  const now = Date.now();
  const nextPrayer = prayerDay ? getNextPrayer(prayerDay, now, prayerTomorrow) : null;
  const nextPrayerIsTomorrow = Boolean(
    nextPrayer && prayerTomorrow?.prayers.some((p) => p === nextPrayer),
  );
  const currentPrayerDraft = prayerDraft ?? prayerSettings ?? DEFAULT_PRAYER_DRAFT;
  const prayerCountryOptions = getPrayerCountryOptions(currentPrayerDraft.country);
  const prayerCityOptions = getPrayerCityOptions(currentPrayerDraft.country, currentPrayerDraft.city);
  const masjidlyCountryOptions = [...new Set(masjidlyMosques.map((mosque) => mosque.countryName))].sort();
  const masjidlyCityOptions = [...new Set(masjidlyMosques
    .filter((mosque) => mosque.countryName === currentPrayerDraft.country)
    .map((mosque) => mosque.cityName))].sort();
  const masjidlyMosqueOptions = masjidlyMosques.filter((mosque) => (
    mosque.countryName === currentPrayerDraft.country && mosque.cityName === currentPrayerDraft.city
  ));
  const incompleteTodos = todos.filter((todo) => !todo.completedAt);
  const completedTodos = todos.filter((todo) => todo.completedAt);
  void pomodoroUiTick;
  const pomodoroRemainingMs = getClientPomodoroRemainingMs(pomodoroState, Date.now());
  const pomodoroMinutes = pomodoroRemainingMs === null || pomodoroRemainingMs === undefined
    ? pomodoroState?.settings.focusMinutes ?? 25
    : Math.floor(pomodoroRemainingMs / 60000);
  const pomodoroSeconds = pomodoroRemainingMs === null || pomodoroRemainingMs === undefined
    ? 0
    : Math.floor((pomodoroRemainingMs % 60000) / 1000);
  const pomodoroDisplay = `${String(pomodoroMinutes).padStart(2, '0')}:${String(pomodoroSeconds).padStart(2, '0')}`;

  // #region agent log
  fetch('http://127.0.0.1:7445/ingest/5150cd8d-c9d2-4c97-b3e9-ffd5b4699b08', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '9312c8' },
    body: JSON.stringify({
      sessionId: '9312c8',
      location: 'Assistant.tsx:return',
      message: 'Assistant about to return JSX',
      data: {
        activeTab,
        prayerDraftSaved: currentPrayerDraft.hasSavedSettings,
        prayerDayCount: prayerDay?.prayers?.length ?? 0,
        todoCount: todos.length,
      },
      hypothesisId: 'C',
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return (
    <div ref={shellRef} className="dark flex flex-col h-screen bg-[#0f0f0f] text-neutral-200 overflow-hidden">
      {/* Header */}
      <div className="h-12 border-b border-white/5 flex items-center justify-between gap-2 px-4 select-none shrink-0 bg-[#0f0f0f] drag-region">
        <div className="flex items-center min-w-0 flex-1">
          <span className="min-w-0 truncate text-sm font-medium tracking-tight text-white" title={APP_FULL_NAME}>
            {APP_FULL_NAME}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 no-drag">
          {shouldShowTitleBarUpdateButton(updateState) && (
            <button
              type="button"
              onClick={handleUpdateAction}
              disabled={isUpdateButtonDisabled(updateState)}
              className="flex items-center gap-1.5 max-w-[min(200px,42vw)] px-2.5 py-1 rounded-xl text-xs font-semibold bg-[#67E0A3] text-[#07120f] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              title={getUpdateStatusLabel(updateState)}
              aria-label={getUpdateButtonLabel(updateState)}
            >
              <Icon
                icon={
                  getUpdateAction(updateState) === 'install'
                    ? 'solar:restart-linear'
                    : 'solar:download-linear'
                }
                className="text-base shrink-0"
              />
              <span className="truncate">{getTitleBarUpdateButtonText(updateState)}</span>
            </button>
          )}
          <button
            className="text-neutral-500 hover:text-white transition-colors flex items-center justify-center w-6 h-6"
            onClick={closeWindow}
            aria-label="Close assistant"
          >
            <Icon icon="solar:close-circle-linear" className="text-lg" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex min-h-0 flex-1 flex-col gap-0 bg-[#0f0f0f]">
        <AnimatedTabs
          tabs={[
            { id: 'prayers', label: 'Prayers' },
            { id: 'todos', label: 'To Do' },
            { id: 'focus', label: 'Focus' },
            { id: 'reflections', label: 'Reflections' },
            { id: 'settings', label: 'Settings' },
          ]}
          activeTab={activeTab}
          onChange={(tabId) => switchTab(tabId as Tab)}
          variant="underline"
          className="w-full shrink-0 justify-between border-b border-white/5 bg-[#0f0f0f] px-2 text-neutral-500 [&_button]:h-auto [&_button]:flex-1 [&_button]:border-0 [&_button]:px-3 [&_button]:py-2.5 [&_button]:text-xs [&_button]:font-medium [&_button]:text-neutral-500 [&_button]:hover:text-neutral-300 [&_button[aria-selected=true]]:text-[#67E0A3] [&_button]:focus-visible:border-[#67E0A3] [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-[#67E0A3]/40 [&_button]:focus-visible:ring-offset-0"
        />

        {activeTab === 'prayers' && (
          <div className={cn('flex flex-1 flex-col min-h-0 px-5 py-5', currentPrayerDraft.hasSavedSettings ? 'overflow-hidden' : 'overflow-y-auto scrollbar-hide')}>
            {!currentPrayerDraft.hasSavedSettings && (
              <div className="space-y-4">
                <h3 className="text-xs font-medium text-neutral-300 uppercase tracking-widest">Prayer Setup</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1.5">
                    <span className="block text-xs text-neutral-500">Prayer time source</span>
                    <Select
                      value={currentPrayerDraft.source}
                      onValueChange={(source: 'calculation' | 'masjidly') => setPrayerDraft((current) => {
                        const base = current ?? currentPrayerDraft;
                        if (source === 'masjidly') {
                          return {
                            ...base,
                            source,
                            calculationCity: base.city || base.calculationCity,
                            calculationCountry: base.country || base.calculationCountry,
                            country: '',
                            city: '',
                          };
                        }
                        return {
                          ...base,
                          source,
                          city: base.calculationCity || base.city,
                          country: base.calculationCountry || base.country,
                        };
                      })}
                    >
                      <SelectTrigger aria-label="Prayer time source" className="w-full border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 py-1.5 h-auto text-sm text-foreground focus-visible:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border border-white/10 bg-[#101010] text-neutral-200">
                        <SelectItem value="calculation">Calculated times</SelectItem>
                        <SelectItem value="masjidly">Masjidly mosque timetable</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {currentPrayerDraft.source === 'calculation' ? <>
                  <div className="space-y-1.5">
                    <span className="block text-xs text-neutral-500">Country</span>
                    <Select
                      value={currentPrayerDraft.country}
                      onValueChange={(country) => {
                        const firstCity = PRAYER_LOCATION_PRESETS.find((preset) => preset.country === country)?.cities[0] ?? '';
                        setPrayerDraft((current) => ({
                          ...(current ?? currentPrayerDraft),
                          country,
                          city: firstCity,
                          calculationCountry: country,
                          calculationCity: firstCity,
                        }));
                      }}
                    >
                      <SelectTrigger aria-label="Prayer country" className="w-full border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 py-1.5 h-auto text-sm text-foreground placeholder:text-neutral-600 focus-visible:border-b-[#67E0A3]/50 focus-visible:ring-0">
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent className="border border-white/10 bg-[#101010] text-neutral-200">
                        {prayerCountryOptions.map((country) => (
                          <SelectItem key={country} value={country}>{country}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <span className="block text-xs text-neutral-500">City</span>
                    <Select
                      value={currentPrayerDraft.city}
                      onValueChange={(city) => setPrayerDraft((current) => ({
                        ...(current ?? currentPrayerDraft),
                        city,
                        calculationCity: city,
                      }))}
                    >
                      <SelectTrigger aria-label="Prayer city" className="w-full border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 py-1.5 h-auto text-sm text-foreground placeholder:text-neutral-600 focus-visible:border-b-[#67E0A3]/50 focus-visible:ring-0">
                        <SelectValue placeholder="Select city" />
                      </SelectTrigger>
                      <SelectContent className="border border-white/10 bg-[#101010] text-neutral-200">
                        {prayerCityOptions.map((city) => (
                          <SelectItem key={city} value={city}>{city}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  </> : <>
                  {masjidlyDirectoryStatus === 'error' && (
                    <div className="col-span-2 flex items-center justify-between gap-3 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                      <p className="text-xs text-amber-200">Could not load Masjidly mosques.</p>
                      <Button type="button" size="sm" variant="outline" onClick={() => void loadMasjidlyDirectory()}>
                        Retry
                      </Button>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <span className="block text-xs text-neutral-500">Country</span>
                    <Select
                      value={currentPrayerDraft.country}
                      onValueChange={(country) => setPrayerDraft((current) => ({ ...(current ?? currentPrayerDraft), country, city: '', mosqueSlug: '' }))}
                      disabled={masjidlyDirectoryStatus !== 'ready'}
                    >
                      <SelectTrigger aria-label="Masjidly country" className="w-full border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 py-1.5 h-auto text-sm text-foreground focus-visible:ring-0">
                        <SelectValue placeholder={
                          masjidlyDirectoryStatus === 'loading' ? 'Loading countries…'
                            : masjidlyDirectoryStatus === 'error' ? 'Failed to load countries'
                              : 'Select country'
                        } />
                      </SelectTrigger>
                      <SelectContent className="border border-white/10 bg-[#101010] text-neutral-200">
                        {masjidlyCountryOptions.map((country) => <SelectItem key={country} value={country}>{country}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <span className="block text-xs text-neutral-500">City</span>
                    <Select
                      value={currentPrayerDraft.city}
                      onValueChange={(city) => setPrayerDraft((current) => ({ ...(current ?? currentPrayerDraft), city, mosqueSlug: '' }))}
                      disabled={!currentPrayerDraft.country}
                    >
                      <SelectTrigger aria-label="Masjidly city" className="w-full border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 py-1.5 h-auto text-sm text-foreground focus-visible:ring-0">
                        <SelectValue placeholder="Select city" />
                      </SelectTrigger>
                      <SelectContent className="border border-white/10 bg-[#101010] text-neutral-200">
                        {masjidlyCityOptions.map((city) => <SelectItem key={city} value={city}>{city}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <span className="block text-xs text-neutral-500">Mosque</span>
                    <Select
                      value={currentPrayerDraft.mosqueSlug}
                      onValueChange={(mosqueSlug) => setPrayerDraft((current) => ({ ...(current ?? currentPrayerDraft), mosqueSlug }))}
                      disabled={!currentPrayerDraft.city}
                    >
                      <SelectTrigger aria-label="Masjidly mosque" className="w-full border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 py-1.5 h-auto text-sm text-foreground focus-visible:ring-0">
                        <SelectValue placeholder="Select mosque" />
                      </SelectTrigger>
                      <SelectContent className="border border-white/10 bg-[#101010] text-neutral-200">
                        {masjidlyMosqueOptions.map((mosque) => (
                          <SelectItem key={mosque.slug} value={mosque.slug}>{mosque.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  </>}
                  <div className="flex items-center justify-between gap-3 pt-2">
                    <span className="text-sm text-neutral-300">Prayer Awareness</span>
                    <Switch
                      aria-label="Enable Prayer Awareness"
                      checked={currentPrayerDraft.enabled}
                      onCheckedChange={(enabled) => setPrayerDraft((current) => ({ ...(current ?? currentPrayerDraft), enabled }))}
                      className="data-[state=checked]:bg-[#67E0A3]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <span className="block text-xs text-neutral-500">Lead (min)</span>
                    <Input
                      type="number"
                      min={0}
                      max={120}
                      value={currentPrayerDraft.reminderLeadMinutes}
                      onChange={(event) => setPrayerDraft((current) => ({ ...(current ?? currentPrayerDraft), reminderLeadMinutes: Number(event.target.value) }))}
                      className="border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 py-1.5 h-auto text-sm text-foreground focus-visible:border-b-[#67E0A3]/50 focus-visible:ring-0"
                    />
                  </div>
                  {currentPrayerDraft.source === 'calculation' && <>
                  <div className="space-y-1.5">
                    <span className="block text-xs text-neutral-500">Calculation</span>
                    <Select
                      value={String(currentPrayerDraft.method)}
                      onValueChange={(value) => {
                        const method = Number(value);
                        setPrayerDraft((current) => ({ ...(current ?? currentPrayerDraft), method }));
                        persistPrayerCalculationFromDraft({ method });
                      }}
                    >
                      <SelectTrigger aria-label="Prayer calculation method" className="w-full border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 py-1.5 h-auto text-sm text-foreground focus-visible:border-b-[#67E0A3]/50 focus-visible:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border border-white/10 bg-[#101010] text-neutral-200">
                        {PRAYER_CALCULATION_METHODS.map((method) => (
                          <SelectItem key={method.id} value={String(method.id)}>{method.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-neutral-600 mt-1 leading-snug" role="note">{PRAYER_CALCULATION_METHOD_UK_NOTE}</p>
                  </div>
                  <div className="space-y-1.5">
                    <span className="block text-xs text-neutral-500">Juristic School</span>
                    <Select
                      value={String(currentPrayerDraft.school)}
                      onValueChange={(value) => {
                        const school = Number(value) as 0 | 1;
                        setPrayerDraft((current) => ({ ...(current ?? currentPrayerDraft), school }));
                        persistPrayerCalculationFromDraft({ school });
                      }}
                    >
                      <SelectTrigger aria-label="Prayer juristic school" className="w-full border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 py-1.5 h-auto text-sm text-foreground focus-visible:border-b-[#67E0A3]/50 focus-visible:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border border-white/10 bg-[#101010] text-neutral-200">
                        {PRAYER_JURISTIC_SCHOOLS.map((school) => (
                          <SelectItem key={school.id} value={String(school.id)}>{school.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  </>}
                  {currentPrayerDraft.source === 'masjidly' && (
                    <div className="col-span-2 flex items-center justify-between gap-3 pt-2">
                      <span className="text-sm text-neutral-300">Show iqamah times</span>
                      <Switch
                        aria-label="Show iqamah times"
                        checked={currentPrayerDraft.showIqamah}
                        onCheckedChange={(showIqamah) => setPrayerDraft((current) => ({ ...(current ?? currentPrayerDraft), showIqamah }))}
                      />
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  onClick={savePrayerSettings}
                  className="w-full bg-[#67E0A3] text-[#07120f] hover:bg-[#67E0A3]/90"
                  size="sm"
                >
                  Save
                </Button>
              </div>
            )}

            <section className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0 flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs text-neutral-500">Next Prayer</p>
                  <h3 className="truncate text-lg font-semibold text-white">
                    {nextPrayer
                      ? `${nextPrayer.label}${nextPrayerIsTomorrow ? ' (tomorrow)' : ''}`
                      : 'No upcoming prayer loaded'}
                  </h3>
                </div>
                {nextPrayer && (
                  <p
                    className="shrink-0 text-sm text-neutral-400 tabular-nums"
                    aria-label={`${formatNextPrayerCountdown(nextPrayer.at - now)} until ${nextPrayer.label}`}
                  >
                    {formatNextPrayerCountdown(nextPrayer.at - now)}
                  </p>
                )}
                {prayerDay?.error && <p className="text-xs text-amber-300">{prayerDay.error}</p>}
              </div>

              <div
                className="flex min-h-0 flex-1 flex-col border-t border-neutral-900 pt-1"
                role={prayerSettings?.showIqamah ? 'table' : 'list'}
                aria-label={prayerSettings?.showIqamah ? 'Prayer and iqamah times' : 'Prayer times'}
              >
                {prayerSettings?.showIqamah && (
                  <div className="grid grid-cols-[1fr_4.5rem_4.5rem] gap-3 border-b border-neutral-900 py-1 text-[10px] uppercase tracking-wider text-neutral-600" role="row">
                    <span role="columnheader">Prayer</span>
                    <span className="text-right" role="columnheader">Adhan</span>
                    <span className="text-right" role="columnheader">Iqamah</span>
                  </div>
                )}
                {(prayerDay?.prayers ?? []).map((prayer) => (
                  <div
                    key={prayer.name}
                    className={cn(
                      'grid flex-1 items-center gap-3 border-b border-neutral-900 last:border-0',
                      prayerSettings?.showIqamah ? 'grid-cols-[1fr_4.5rem_4.5rem]' : 'grid-cols-[1fr_4.5rem]',
                    )}
                    role={prayerSettings?.showIqamah ? 'row' : 'listitem'}
                  >
                    <span className="text-sm text-foreground" role={prayerSettings?.showIqamah ? 'cell' : undefined}>{prayer.label}</span>
                    <span className="text-right text-sm text-[#67E0A3] tabular-nums" role={prayerSettings?.showIqamah ? 'cell' : undefined}>
                      {formatPrayerTime(prayer.time, prayerSettings?.use24h ?? true)}
                    </span>
                    {prayerSettings?.showIqamah && (
                      <span className="text-right text-sm text-neutral-400 tabular-nums" role="cell">
                        {prayer.iqamahTime ? formatPrayerTime(prayer.iqamahTime, prayerSettings.use24h) : '—'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'todos' && (
<div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 scrollbar-hide">
          <Collapsible
            open={todoAddDropdownOpen}
            onOpenChange={setTodoAddDropdownOpen}
            className="relative"
            ref={todoAddDropdownRef}
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full border-dashed border-neutral-700/50 text-neutral-400 hover:text-[#67E0A3] hover:border-[#67E0A3]/40 bg-transparent"
              >
                Add Task
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <section
                id="todo-add-form-panel"
                aria-label="Add task"
                className="mt-3 space-y-3"
              >
                <Input
                  aria-label="Task title"
                  value={todoTitle}
                  onChange={(event) => setTodoTitle(event.target.value)}
                  placeholder="What do you need to do?"
                  className="border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 py-1.5 h-auto text-sm text-foreground placeholder:text-neutral-600 focus-visible:border-b-[#67E0A3]/50 focus-visible:ring-0"
                />
                <Input
                  aria-label="Task notes"
                  value={todoNotes}
                  onChange={(event) => setTodoNotes(event.target.value)}
                  placeholder="Notes"
                  className="border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 py-1.5 h-auto text-sm text-foreground placeholder:text-neutral-600 focus-visible:border-b-[#67E0A3]/50 focus-visible:ring-0"
                />
                <div className="flex items-center gap-4">
                  <Select
                    value={todoPriority}
                    onValueChange={(value: TodoPriority) => setTodoPriority(value)}
                  >
                    <SelectTrigger aria-label="Task priority" className="h-7 w-[90px] border-neutral-800 bg-transparent text-xs text-muted-foreground focus-visible:ring-0">
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent className="border-neutral-800 bg-[#0f0f0f] text-xs text-muted-foreground">
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                  <SmartDatePicker
                    value={todoDueDate}
                    onChange={setTodoDueDate}
                    placeholder="Due"
                  />
                  <SmartDatePicker
                    value={todoReminderDate}
                    onChange={setTodoReminderDate}
                    placeholder="Remind"
                    popoverAlign="end"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    onClick={createTodoFromPanel}
                    size="sm"
                    className="flex-1 bg-[#67E0A3] text-[#07120f] hover:bg-[#67E0A3]/90 text-xs"
                  >
                    Add Task
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setTodoAddDropdownOpen(false)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </Button>
                </div>
              </section>
            </CollapsibleContent>
          </Collapsible>

          <section className="space-y-0.5">
            {incompleteTodos.length === 0 && completedTodos.length === 0 && (
              <p className="text-xs text-neutral-600 text-center pt-8">No tasks yet. Tap + to add one.</p>
            )}
            {incompleteTodos.map((todo) => (
              <div
                key={todo.id}
                className="group flex items-start gap-2.5 py-2.5 border-b border-neutral-900 last:border-0"
              >
                <Checkbox
                  checked={false}
                  onCheckedChange={() => completeTodoFromPanel(todo.id, true)}
                  className="mt-0.5 data-checked:bg-[#67E0A3] data-checked:border-[#67E0A3]"
                />
                <div className="flex-1 min-w-0">
                  <span className="block text-sm text-foreground leading-snug">{todo.title}</span>
                  {todo.notes && (
                    <span className="block text-xs text-neutral-600 mt-0.5 line-clamp-1">{todo.notes}</span>
                  )}
                  {(todo.priority !== 'none' || formatTodoDate(todo.dueAt) || todo.reminderAt) && (
                    <div className="flex items-center gap-2 mt-1">
                      {todo.priority !== 'none' && (
                        <span className={`text-[10px] uppercase tracking-wider ${
                          todo.priority === 'high' ? 'text-red-400' :
                          todo.priority === 'medium' ? 'text-amber-400' :
                          'text-neutral-500'
                        }`}>{todo.priority}</span>
                      )}
                      {formatTodoDate(todo.dueAt) && (
                        <span className="text-[10px] text-neutral-500">
                          {formatTodoDate(todo.dueAt)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => deleteTodoFromPanel(todo.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-neutral-600 hover:text-red-400 hover:bg-transparent -mr-1 -mt-0.5"
                >
                  <Icon icon="solar:close-circle-linear" width="14" height="14" />
                </Button>
              </div>
            ))}
          </section>

          {completedTodos.length > 0 && (
            <>
              <div className="border-t border-neutral-900 pt-4 space-y-0.5">
                {completedTodos.map((todo) => (
                  <div
                    key={todo.id}
                    className="group flex items-start gap-2.5 py-2"
                  >
                    <Checkbox
                      checked
                      onCheckedChange={() => completeTodoFromPanel(todo.id, false)}
                      className="mt-0.5 data-checked:bg-neutral-600 data-checked:border-neutral-600"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="block text-sm text-neutral-600 line-through leading-snug">{todo.title}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => deleteTodoFromPanel(todo.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-neutral-600 hover:text-red-400 hover:bg-transparent -mr-1 -mt-0.5"
                    >
                      <Icon icon="solar:close-circle-linear" width="14" height="14" />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

        {activeTab === 'focus' && (
        <div className="flex-1 flex flex-col px-5 py-4 gap-0 min-h-0">
          {/* Session label & status */}
          <div className="flex items-center justify-between shrink-0">
            <span className="text-xs text-neutral-500 capitalize">{pomodoroState?.activeSession?.kind ?? 'focus'}</span>
            <span className="text-xs text-neutral-600">
              {pomodoroState?.activeSession?.status === 'running'
                ? 'Running'
                : pomodoroState?.activeSession?.status === 'paused'
                  ? 'Paused'
                  : 'Idle'}
            </span>
          </div>

          {/* Timer — absorbs remaining space */}
          <div className="flex-1 flex items-center justify-center min-h-0">
            <h3 className="text-6xl font-light tabular-nums tracking-tight text-white">{pomodoroDisplay}</h3>
          </div>

          {/* Controls section — fixed height */}
          <div className="shrink-0 flex flex-col gap-3">
            {/* Linked task — block wrapper so trigger spans same width as inputs/buttons below */}
            <label className="block w-full min-w-0">
              <Select value={selectedFocusTodoId || 'none'} onValueChange={(value) => setSelectedFocusTodoId(value === 'none' ? '' : value)}>
                <SelectTrigger aria-label="Focus task" className="h-8 w-full border-neutral-800 bg-transparent text-sm text-muted-foreground focus-visible:ring-0">
                  <SelectValue placeholder="No linked task" />
                </SelectTrigger>
                <SelectContent className="border-neutral-800 bg-[#0f0f0f] text-xs text-muted-foreground">
                  <SelectItem value="none">No linked task</SelectItem>
                  {incompleteTodos.map((todo) => <SelectItem key={todo.id} value={todo.id}>{todo.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>

            {/* Duration inputs */}
            <div className="grid grid-cols-2 gap-4">
              <label className="block text-[11px] text-neutral-500">
                Focus
                <Input
                  type="number"
                  min={1}
                  max={240}
                  value={pomodoroSettingsDraft.focusMinutes}
                  onChange={(event) => updatePomodoroMinuteDraftFromPanel('focusMinutes', event.target.value)}
                  onBlur={() => commitPomodoroMinuteDraftFromPanel('focusMinutes')}
                  className="mt-1.5 border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 py-1 h-auto text-sm text-foreground tabular-nums focus-visible:border-b-[#67E0A3]/50 focus-visible:ring-0"
                />
              </label>
              <label className="block text-[11px] text-neutral-500">
                Break
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={pomodoroSettingsDraft.breakMinutes}
                  onChange={(event) => updatePomodoroMinuteDraftFromPanel('breakMinutes', event.target.value)}
                  onBlur={() => commitPomodoroMinuteDraftFromPanel('breakMinutes')}
                  className="mt-1.5 border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 py-1 h-auto text-sm text-foreground tabular-nums focus-visible:border-b-[#67E0A3]/50 focus-visible:ring-0"
                />
              </label>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-[9fr_9fr_2fr] gap-2">
              {!pomodoroState?.activeSession || pomodoroState.activeSession.status === 'completed' || pomodoroState.activeSession.status === 'cancelled' ? (
                <Button size="sm" onClick={() => startPomodoroFromPanel('focus')} className="bg-[#67E0A3] text-[#07120f] hover:bg-[#67E0A3]/80">Start Focus</Button>
              ) : pomodoroState.activeSession.status === 'running' ? (
                <Button variant="outline" size="sm" onClick={async () => setPomodoroState(await window.ayati.pausePomodoro())} className="border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-600 bg-transparent">Pause</Button>
              ) : (
                <Button size="sm" onClick={async () => setPomodoroState(await window.ayati.resumePomodoro())} className="bg-[#67E0A3] text-[#07120f] hover:bg-[#67E0A3]/80">Resume</Button>
              )}
              <Button variant="outline" size="sm" onClick={() => startPomodoroFromPanel('break')} className="border-neutral-800 text-neutral-400 hover:text-[#67E0A3] hover:border-[#67E0A3]/40 bg-transparent">Start Break</Button>
              <Button variant="ghost" size="xs" onClick={async () => setPomodoroState(await window.ayati.cancelPomodoro())} className="text-neutral-600 hover:text-red-400 hover:bg-transparent self-center">Cancel</Button>
            </div>
          </div>

          {/* Stats */}
          <div className="border-t border-neutral-900 pt-3 mt-4 shrink-0">
            <p className="text-xs text-neutral-600">Completed focus sessions: {pomodoroState?.completedFocusCount ?? 0}</p>
          </div>
        </div>
      )}

      {/* CONTENT: Reflections */}
        {activeTab === 'reflections' && (
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 scrollbar-hide">

          {quranStatusMessage && (
            <div className="text-xs text-[#67E0A3] bg-[#67E0A3]/10 border border-[#67E0A3]/25 rounded-md px-3 py-2">
              {quranStatusMessage}
            </div>
          )}

          <Input
            type="search"
            aria-label="Search reflections"
            value={reflectionSearch}
            onChange={(event) => setReflectionSearch(event.target.value)}
            placeholder="Search reflections..."
            className="border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 py-1.5 h-auto text-sm text-foreground placeholder:text-neutral-600 focus-visible:border-b-[#67E0A3]/50 focus-visible:ring-0"
          />



          {reflections.length === 0 ? (
            <p className="text-xs text-neutral-600 text-center pt-8">
              No reflections yet. Capture your screen to receive a Quran-focused reminder.
            </p>
          ) : (
            <section className="space-y-0.5">
              {filteredReflections.map((reflection) => (
                <div key={reflection.id} className="group border-b border-neutral-900 last:border-0 py-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-[#67E0A3]">
                      {reflection.surahName} {reflection.verseKey}
                    </span>
                    <span className="text-[10px] text-neutral-600">
                      {reflection.syncState}
                    </span>
                  </div>

                  <QulArabicText
                    verseKey={reflection.verseKey}
                    fallbackText={reflection.arabicText}
                    className="text-right text-white/90"
                    variant="assistant"
                    qulSettingsKey={ayahQulSettingsKey}
                  />

                  <p translate="no" className="text-sm leading-relaxed text-neutral-200">
                    <TranslationWithFootnotes
                      text={reflection.translation}
                      footnotes={reflection.footnotes}
                    />
                  </p>

                  {reflection.whyThisVerse
                    && reflection.whyThisVerse !== LEGACY_TIMED_REMINDER_WHY && (
                    <p className="text-xs leading-relaxed text-neutral-500">
                      {reflection.whyThisVerse}
                    </p>
                  )}

                  {reflection.tafsir?.text?.trim() && !hiddenTafsirs.has(reflection.id) && (
                    <div className="space-y-1.5 border-l border-neutral-700 pl-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-neutral-500">Tafsir</span>
                        {reflection.tafsir.resourceName && (
                          <span className="text-[10px] text-neutral-600">{reflection.tafsir.resourceName}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => setHiddenTafsirs((prev) => new Set(prev).add(reflection.id))}
                          className="ml-auto text-neutral-600 hover:text-neutral-400 transition-colors"
                          aria-label="Hide tafsir"
                        >
                          <Icon icon="lucide:x" width="12" height="12" />
                        </button>
                      </div>
                      <div className="space-y-2">
                        {getTafsirParagraphs(reflection.tafsir.text).map((paragraph, index) => (
                          <p
                            key={`${reflection.id}-tafsir-${index}`}
                            className="text-xs leading-relaxed text-neutral-500"
                            translate="no"
                          >
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {collections.length > 0 && (
                    <Select
                      defaultValue=""
                      onValueChange={(value) => {
                        if (value) void addReflectionToCollectionFromPanel(reflection.id, value);
                      }}
                    >
                      <SelectTrigger aria-label={`Collection for ${reflection.verseKey}`} className="h-7 border-neutral-800 bg-transparent text-xs text-muted-foreground">
                        <SelectValue placeholder="Save to collection…" />
                      </SelectTrigger>
                      <SelectContent className="border-neutral-800 bg-[#0f0f0f] text-xs text-muted-foreground">
                        {collections.map((collection) => (
                          <SelectItem key={collection.id} value={collection.id}>{collection.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  <div className="flex items-center gap-2 -ml-2">
                    <Button variant="ghost" size="xs" onClick={() => {
                      if (!reflection.tafsir?.text?.trim()) {
                        loadReflectionTafsir(reflection.id);
                        setHiddenTafsirs((prev) => new Set(prev).add(reflection.id));
                      } else if (hiddenTafsirs.has(reflection.id)) {
                        setHiddenTafsirs((prev) => { const next = new Set(prev); next.delete(reflection.id); return next; });
                      } else {
                        setHiddenTafsirs((prev) => new Set(prev).add(reflection.id));
                      }
                    }} className="text-neutral-600 hover:text-[#67E0A3]">
                      <Icon icon="lucide:book-open" width="11" height="11" className="mr-1" />
                      Tafsir
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => loadReflectionAudio(reflection.id)} className="text-neutral-600 hover:text-[#67E0A3]">
                      <Icon icon="lucide:play" width="11" height="11" className="mr-1" />
                      Recite
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => { if (!openNoteEditors.has(reflection.id)) { setOpenNoteEditors((prev) => new Set(prev).add(reflection.id)); } else { setOpenNoteEditors((prev) => { const next = new Set(prev); next.delete(reflection.id); return next; }); } }} className="text-neutral-600 hover:text-[#67E0A3]">
                      <Icon icon="lucide:sticky-note" width="11" height="11" className="mr-1" />
                      Note
                    </Button>
                    <Button variant="ghost" size="xs" onClick={async () => {
                        await window.ayati.deleteAyahReflection(reflection.id);
                        await refreshReflections();
                      }} className="text-neutral-600 hover:text-red-400 ml-auto">
                      <Icon icon="lucide:trash-2" width="11" height="11" className="mr-1" />
                      Delete
                    </Button>
                  </div>

                  {(reflection.note?.body || openNoteEditors.has(reflection.id)) && (
                    <Textarea
                      aria-label={`Note for ${reflection.verseKey}`}
                      value={noteDrafts[reflection.id] ?? reflection.note?.body ?? ''}
                      onChange={(event) => setNoteDrafts((current) => ({ ...current, [reflection.id]: event.target.value }))}
                      placeholder="Add a short note..."
                      className="border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 py-1 h-auto min-h-0 text-xs text-foreground placeholder:text-neutral-600 focus-visible:border-b-[#67E0A3]/50 focus-visible:ring-0"
                      rows={1}
                    />
                  )}
                </div>
              ))}
              {filteredReflections.length === 0 && (
                <p className="text-xs text-neutral-600 text-center pt-8">No reflections match these filters.</p>
              )}
            </section>
          )}
        </div>
      )}

      {/* CONTENT: Settings */}
        {activeTab === 'settings' && (
        <div className="flex-1 flex flex-col overflow-y-auto px-5 py-4 space-y-3 scrollbar-hide">
          <SettingsSection title="Reminders">
            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex flex-col">
                  <span className="text-sm">
                    Timer Quran Reminders
                  </span>
                  <span className="text-[11px] text-neutral-600 mt-px">
                    Show a Quran reminder on the interval you choose
                  </span>
                </div>
                <Switch
                  checked={ayahSettings?.timedReminders ?? false}
                  onCheckedChange={(checked) => updateAyahSetting('timedReminders', checked)}
                  className="data-[state=unchecked]:bg-neutral-700 data-[state=checked]:bg-[#67E0A3]"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex flex-col">
                  <span className="text-sm">
                    App Switch Quran Nudges
                  </span>
                  <span className="text-[11px] text-neutral-600 mt-px">
                    Show Quran-linked reminders only when app context is clear
                  </span>
                </div>
                <Switch
                  checked={ayahSettings?.contextualNudges ?? true}
                  onCheckedChange={(checked) => updateAyahSetting('contextualNudges', checked)}
                  className="data-[state=unchecked]:bg-neutral-700 data-[state=checked]:bg-[#67E0A3]"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-[11px] text-neutral-600 mb-1">Timer</span>
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    value={ayahSettings?.timedReminderMinutes ?? 15}
                    onChange={(event) => updateAyahSetting('timedReminderMinutes', Number(event.target.value))}
                    className="border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 py-1 h-auto text-sm placeholder:text-neutral-600 focus-visible:border-b-[#67E0A3]/50 focus-visible:ring-0"
                  />
                </label>
                <label className="block">
                  <span className="block text-[11px] text-neutral-600 mb-1">Cooldown</span>
                  <Input
                    type="number"
                    min={1}
                    max={240}
                    value={ayahSettings?.nudgeCooldownMinutes ?? 15}
                    onChange={(event) => updateAyahSetting('nudgeCooldownMinutes', Number(event.target.value))}
                    className="border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 py-1 h-auto text-sm placeholder:text-neutral-600 focus-visible:border-b-[#67E0A3]/50 focus-visible:ring-0"
                  />
                </label>
              </div>
              <label className="block">
                <span className="block text-[11px] text-neutral-600 mb-1">Reciter</span>
                <Select
                  value={String(ayahSettings?.recitationId ?? '')}
                  onValueChange={(value) => updateReminderListenReciter(value)}
                  disabled={recitationResources.length === 0}
                >
                  <SelectTrigger aria-label="Reminder Listen Reciter" className="h-7 border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 text-sm text-muted-foreground focus-visible:ring-0 disabled:opacity-60">
                    <SelectValue placeholder={recitationResources.length === 0 ? 'Loading reciters' : 'Choose reciter'} />
                  </SelectTrigger>
                  <SelectContent className="border-neutral-800 bg-[#0f0f0f] text-xs text-muted-foreground">
                    {recitationResources.map((resource) => (
                      <SelectItem key={resource.id} value={String(resource.id)}>{resource.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="mt-0.5 block text-[11px] text-neutral-600">
                  Used when you press Listen on Quran reminder cards.
                </span>
              </label>
            </div>
          </SettingsSection>

          <SettingsSection title="Prayer Times">
            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex flex-col">
                  <span className="text-sm">Enable Prayer Awareness</span>
                  <span className="text-[11px] text-neutral-600 mt-px">Show prayer schedule and pet reminders</span>
                </div>
                <Switch
                  checked={prayerSettings?.enabled ?? false}
                  onCheckedChange={(checked) => updatePrayerSettingsFromSettings({ enabled: checked })}
                  className="data-[state=unchecked]:bg-neutral-700 data-[state=checked]:bg-[#67E0A3]"
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex flex-col">
                  <span className="text-sm">24h Time</span>
                  <span className="text-[11px] text-neutral-600 mt-px">Show prayer times in 24-hour format</span>
                </div>
                <Switch
                  checked={prayerSettings?.use24h ?? true}
                  onCheckedChange={(checked) => updatePrayerSettingsFromSettings({ use24h: checked })}
                  className="data-[state=unchecked]:bg-neutral-700 data-[state=checked]:bg-[#67E0A3]"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="col-span-2 block">
                  <span className="block text-[11px] text-neutral-600 mb-1">Source</span>
                  <Select
                    value={currentPrayerDraft.source}
                    onValueChange={(source: 'calculation' | 'masjidly') => updatePrayerSettingsFromSettings({ source })}
                  >
                    <SelectTrigger aria-label="Prayer time source" className="h-7 border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 text-sm text-muted-foreground focus-visible:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-neutral-800 bg-[#0f0f0f] text-xs text-muted-foreground">
                      <SelectItem value="calculation">Calculated times</SelectItem>
                      <SelectItem value="masjidly">Masjidly mosque timetable</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                {currentPrayerDraft.source === 'calculation' ? <>
                <label className="block">
                  <span className="block text-[11px] text-neutral-600 mb-1">Country</span>
                  <Select
                    value={currentPrayerDraft.country}
                    onValueChange={(country) => {
                      const firstCity = PRAYER_LOCATION_PRESETS.find((preset) => preset.country === country)?.cities[0] ?? '';
                      updatePrayerSettingsFromSettings({ country, city: firstCity });
                    }}
                  >
                    <SelectTrigger aria-label="Prayer country" className="h-7 border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 text-sm text-muted-foreground focus-visible:ring-0">
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent className="border-neutral-800 bg-[#0f0f0f] text-xs text-muted-foreground">
                      {prayerCountryOptions.map((country) => (
                        <SelectItem key={country} value={country}>{country}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="block">
                  <span className="block text-[11px] text-neutral-600 mb-1">City</span>
                  <Select
                    value={currentPrayerDraft.city}
                    onValueChange={(city) => updatePrayerSettingsFromSettings({ city })}
                  >
                    <SelectTrigger aria-label="Prayer city" className="h-7 border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 text-sm text-muted-foreground focus-visible:ring-0">
                      <SelectValue placeholder="Select city" />
                    </SelectTrigger>
                    <SelectContent className="border-neutral-800 bg-[#0f0f0f] text-xs text-muted-foreground">
                      {prayerCityOptions.map((city) => (
                        <SelectItem key={city} value={city}>{city}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                </> : <>
                {masjidlyDirectoryStatus === 'error' && (
                  <div className="col-span-2 flex items-center justify-between gap-3">
                    <p className="text-[11px] text-amber-200">Could not load Masjidly mosques.</p>
                    <Button type="button" size="sm" variant="outline" onClick={() => void loadMasjidlyDirectory()}>
                      Retry
                    </Button>
                  </div>
                )}
                <label className="block">
                  <span className="block text-[11px] text-neutral-600 mb-1">Country</span>
                  <Select
                    value={currentPrayerDraft.country}
                    onValueChange={(country) => updatePrayerSettingsFromSettings({ country, city: '', mosqueSlug: '' })}
                    disabled={masjidlyDirectoryStatus !== 'ready'}
                  >
                    <SelectTrigger aria-label="Masjidly country" className="h-7 border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 text-sm text-muted-foreground focus-visible:ring-0">
                      <SelectValue placeholder={
                        masjidlyDirectoryStatus === 'loading' ? 'Loading countries…'
                          : masjidlyDirectoryStatus === 'error' ? 'Failed to load countries'
                            : 'Select country'
                      } />
                    </SelectTrigger>
                    <SelectContent className="border-neutral-800 bg-[#0f0f0f] text-xs text-muted-foreground">
                      {masjidlyCountryOptions.map((country) => <SelectItem key={country} value={country}>{country}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
                <label className="block">
                  <span className="block text-[11px] text-neutral-600 mb-1">City</span>
                  <Select
                    value={currentPrayerDraft.city}
                    onValueChange={(city) => updatePrayerSettingsFromSettings({ city, mosqueSlug: '' })}
                    disabled={!currentPrayerDraft.country}
                  >
                    <SelectTrigger aria-label="Masjidly city" className="h-7 border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 text-sm text-muted-foreground focus-visible:ring-0">
                      <SelectValue placeholder="Select city" />
                    </SelectTrigger>
                    <SelectContent className="border-neutral-800 bg-[#0f0f0f] text-xs text-muted-foreground">
                      {masjidlyCityOptions.map((city) => <SelectItem key={city} value={city}>{city}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
                <label className="col-span-2 block">
                  <span className="block text-[11px] text-neutral-600 mb-1">Mosque</span>
                  <Select
                    value={currentPrayerDraft.mosqueSlug}
                    onValueChange={(mosqueSlug) => updatePrayerSettingsFromSettings({ mosqueSlug })}
                    disabled={!currentPrayerDraft.city}
                  >
                    <SelectTrigger aria-label="Masjidly mosque" className="h-7 border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 text-sm text-muted-foreground focus-visible:ring-0">
                      <SelectValue placeholder="Select mosque" />
                    </SelectTrigger>
                    <SelectContent className="border-neutral-800 bg-[#0f0f0f] text-xs text-muted-foreground">
                      {masjidlyMosqueOptions.map((mosque) => (
                        <SelectItem key={mosque.slug} value={mosque.slug}>{mosque.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                </>}
                <label className="block">
                  <span className="block text-[11px] text-neutral-600 mb-1">Lead</span>
                  <Input
                    type="number"
                    min={0}
                    max={120}
                    value={prayerSettings?.reminderLeadMinutes ?? 10}
                    onChange={(event) => updatePrayerSettingsFromSettings({ reminderLeadMinutes: Number(event.target.value) })}
                    className="border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 py-1 h-auto text-sm placeholder:text-neutral-600 focus-visible:border-b-[#67E0A3]/50 focus-visible:ring-0"
                  />
                </label>
                {currentPrayerDraft.source === 'calculation' ? <label className="block">
                  <span className="block text-[11px] text-neutral-600 mb-1">Method</span>
                  <Select
                    value={String(currentPrayerDraft.method)}
                    onValueChange={(value) => updatePrayerSettingsFromSettings({ method: Number(value) })}
                  >
                    <SelectTrigger aria-label="Prayer calculation method" className="h-7 border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 text-sm text-muted-foreground focus-visible:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-neutral-800 bg-[#0f0f0f] text-xs text-muted-foreground">
                      {PRAYER_CALCULATION_METHODS.map((method) => (
                        <SelectItem key={method.id} value={String(method.id)}>{method.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label> : <label className="flex items-center justify-between gap-3">
                  <span className="text-sm">Show iqamah times</span>
                  <Switch
                    aria-label="Show iqamah times"
                    checked={currentPrayerDraft.showIqamah}
                    onCheckedChange={(showIqamah) => updatePrayerSettingsFromSettings({ showIqamah })}
                  />
                </label>}
              </div>
            </div>
          </SettingsSection>


          <SettingsSection title="Companion">
            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex flex-col">
                  <span className="text-sm">
                    Seek attention
                  </span>
                  <span className="text-[11px] text-neutral-600 mt-px">
                    Move toward cursor periodically
                  </span>
                </div>
                <Switch
                  checked={(settings.pet as { attentionSeeker: boolean })?.attentionSeeker ?? true}
                  onCheckedChange={(checked) => updateSetting('pet.attentionSeeker', checked)}
                  className="data-[state=unchecked]:bg-neutral-700 data-[state=checked]:bg-[#67E0A3] shrink-0"
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex flex-col">
                  <span className="text-sm">
                    Transparent while asleep
                  </span>
                  <span className="text-[11px] text-neutral-600 mt-px">
                    Fade {APP_DISPLAY_NAME} when in doze/sleep state
                  </span>
                </div>
                <Switch
                  checked={(settings.pet as { transparentWhenSleeping?: boolean })?.transparentWhenSleeping ?? false}
                  onCheckedChange={(checked) => updateSetting('pet.transparentWhenSleeping', checked)}
                  className="data-[state=unchecked]:bg-neutral-700 data-[state=checked]:bg-[#67E0A3] shrink-0"
                />
              </label>
              <div>
                <span className="block text-sm">Companion appearance</span>
                <span className="block text-[11px] text-neutral-600 mt-px mb-1">
                  Which pet appears on your desktop
                </span>
                <Select
                  value={(settings.pet as { appearanceId?: PetAppearanceId })?.appearanceId ?? 'ayah'}
                  onValueChange={(value) => { void updateSetting('pet.appearanceId', value as PetAppearanceId); }}
                >
                  <SelectTrigger aria-label="Companion appearance" className="h-7 border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 text-sm text-muted-foreground focus-visible:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-neutral-800 bg-[#0f0f0f] text-xs text-muted-foreground">
                    {PET_APPEARANCE_IDS.map((id) => (
                      <SelectItem key={id} value={id}>
                        {PET_APPEARANCE_LABELS[id]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection title="Shortcuts">
            <div className="space-y-3">
              <HotkeyInput
                label="Open Assistant"
                description="Open the full assistant panel"
                value={(settings.hotkeys as { openAssistant?: string })?.openAssistant || 'CommandOrControl+Alt+.'}
                onChange={(value) => updateSetting('hotkeys.openAssistant', value)}
              />
              <HotkeyInput
                label="Hide App"
                description="Hide or show all Ayati windows (same shortcut toggles)"
                value={(settings.hotkeys as { hideApp?: string })?.hideApp || 'CommandOrControl+Alt+,'}
                onChange={(value) => updateSetting('hotkeys.hideApp', value)}
              />
            </div>
          </SettingsSection>

          <SettingsSection title="Quran">
            <div className="space-y-3">
              <p className="text-[11px] text-neutral-600 leading-relaxed">
                {KEYCHAIN_CONSENT_LEDE} On macOS, Ayati stores your Quran Foundation sign-in in Keychain after you approve access.
              </p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">
                    {quranAuthStatus.isConnected ? 'Connected' : 'Not connected'}
                  </p>
                  <p className="text-[11px] text-neutral-600 mt-px">
                    {quranAuthStatus.userName ?? 'Sign in to sync bookmarks with Quran Foundation.'}
                  </p>
                </div>
                {quranAuthStatus.isConnected ? (
                  <button
                    type="button"
                    onClick={disconnectQuran}
                    className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
                  >
                    Sign Out
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startQuranSignIn}
                    className="text-sm text-[#67E0A3] hover:text-[#67E0A3]/80 transition-colors"
                  >
                    Sign In
                  </button>
                )}
              </div>

              <label className="block">
                <span className="block text-[11px] text-neutral-600 mb-1">Quran Font</span>
                <Select
                  value={resolveSettingsQulMushafKey(ayahSettings?.qulMushafKey)}
                  onValueChange={(value) => void updateAyahSetting('qulMushafKey', value)}
                >
                  <SelectTrigger aria-label="Quran Font" className="h-7 border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 text-sm text-muted-foreground focus-visible:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-neutral-800 bg-[#0f0f0f] text-xs text-muted-foreground">
                    {QURAN_FONT_OPTIONS.map((opt) => (
                      <SelectItem
                        key={opt.value}
                        value={opt.value}
                        disabled={isQulFontPackMissing(qulFontPacks, opt.value)}
                      >
                        {opt.label}
                        {isQulFontPackMissing(qulFontPacks, opt.value) ? ' — fonts missing in bundle' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <div className="space-y-3">
                <span className="block text-[10px] text-neutral-600 uppercase tracking-widest">Translation &amp; tafsir</span>
                <label className="block">
                  <span className="block text-[11px] text-neutral-600 mb-1">Translation Language</span>
                  <Select
                    value={translationLanguageFilter}
                    onValueChange={setTranslationLanguageFilter}
                    disabled={translationResources.length === 0}
                  >
                    <SelectTrigger aria-label="Filter translations by language" className="h-7 border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 text-sm text-muted-foreground focus-visible:ring-0 disabled:opacity-50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-neutral-800 bg-[#0f0f0f] text-xs text-muted-foreground">
                      <SelectItem value="all">All languages</SelectItem>
                      {translationCatalogLanguages.map((lang) => (
                        <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="block">
                  <span className="block text-[11px] text-neutral-600 mb-1">Translation</span>
                  <Select
                    value={
                      translationsForSettingsPicker.some((t) => t.id === ayahSettings?.translationId)
                        ? String(ayahSettings?.translationId ?? '')
                        : String(translationsForSettingsPicker[0]?.id ?? '')
                    }
                    onValueChange={(value) => void updateAyahSetting('translationId', Number(value))}
                    disabled={translationsForSettingsPicker.length === 0}
                  >
                    <SelectTrigger aria-label="Quran translation resource" className="h-7 border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 text-sm text-muted-foreground focus-visible:ring-0 disabled:opacity-50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-neutral-800 bg-[#0f0f0f] text-xs text-muted-foreground">
                      {translationsForSettingsPicker.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.name}{t.languageName ? ` (${t.languageName})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="block">
                  <span className="block text-[11px] text-neutral-600 mb-1">Tafsir</span>
                  <Select
                    value={String(
                      (typeof ayahSettings?.tafsirResourceId === 'number'
                        && tafsirResources.some((r) => r.id === ayahSettings.tafsirResourceId)
                        ? ayahSettings.tafsirResourceId
                        : tafsirResources.find((r) => r.id === PREFERRED_TAFSIR_ID)?.id
                          ?? tafsirResources[0]?.id
                          ?? ''),
                    )}
                    onValueChange={(value) => {
                      if (!value) {
                        void updateAyahSetting('tafsirResourceId', null);
                        void updateAyahSetting('tafsirResourceName', null);
                        return;
                      }
                      const id = Number(value);
                      if (!Number.isInteger(id) || id <= 0) return;
                      const resource = tafsirResources.find((r) => r.id === id);
                      void updateAyahSetting('tafsirResourceId', id);
                      if (resource?.name) void updateAyahSetting('tafsirResourceName', resource.name);
                    }}
                    disabled={tafsirResources.length === 0}
                  >
                    <SelectTrigger aria-label="Default tafsir resource" className="h-7 border-0 border-b border-neutral-800 rounded-none bg-transparent px-0 text-sm text-muted-foreground focus-visible:ring-0 disabled:opacity-50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-neutral-800 bg-[#0f0f0f] text-xs text-muted-foreground">
                      {tafsirResources.map((r) => (
                        <SelectItem key={r.id} value={String(r.id)}>
                          {r.name}{r.languageName ? ` (${r.languageName})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </div>

              {quranStatusMessage && <p className="text-[11px] text-[#67E0A3]/70">{quranStatusMessage}</p>}
            </div>
          </SettingsSection>

          {isDevEnvironment && (
            <SettingsSection title="Developer">
              <div className="space-y-3">
              {isDevEnvironment && (
                <label className="flex items-center justify-between cursor-pointer group">
                  <div className="flex flex-col">
                    <span className="text-sm">Show window borders</span>
                    <span className="text-[11px] text-neutral-600 mt-px">Draw debug outlines around window bounds</span>
                  </div>
                  <Switch
                    checked={(settings.dev as { windowBorders?: boolean })?.windowBorders ?? false}
                    onCheckedChange={(checked) => updateSetting('dev.windowBorders', checked)}
                    className="data-[state=unchecked]:bg-neutral-700 data-[state=checked]:bg-[#67E0A3] shrink-0"
                  />
                </label>
              )}
              {isDevEnvironment && (
                <label className="flex items-center justify-between cursor-pointer group">
                  <div className="flex flex-col">
                    <span className="text-sm">Show companion mode overlay</span>
                    <span className="text-[11px] text-neutral-600 mt-px">Display current mode text above {APP_DISPLAY_NAME}</span>
                  </div>
                  <Switch
                    checked={(settings.dev as { showPetModeOverlay?: boolean })?.showPetModeOverlay ?? false}
                    onCheckedChange={(checked) => updateSetting('dev.showPetModeOverlay', checked)}
                    className="data-[state=unchecked]:bg-neutral-700 data-[state=checked]:bg-[#67E0A3] shrink-0"
                  />
                </label>
              )}
              {isDevEnvironment && (
                <div className="space-y-2">
                  <span className="block text-sm">Force companion state</span>
                  <span className="block text-[11px] text-neutral-600 mt-px">Instantly set {APP_DISPLAY_NAME}&apos;s current mood state</span>
                  <div className="grid grid-cols-3 gap-2">
                    {forcedCompanionStates.map((mood) => (
                      <button
                        key={mood}
                        type="button"
                        onClick={() => { window.ayati.executePetAction({ type: 'set_mood', value: mood }); }}
                        className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
                      >
                        {mood}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {isDevEnvironment && (
                <button
                  type="button"
                  onClick={() => { void window.ayati.forceActiveAppComment(); }}
                  className="w-full flex items-center justify-between text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Icon icon="solar:monitor-smartphone-linear" className="text-neutral-600" />
                    <span>Test Active App Comment</span>
                  </span>
                  <span className="text-[10px] text-neutral-600">Dev action</span>
                </button>
              )}
              {isDevEnvironment && (
                <button
                  type="button"
                  onClick={() => { void triggerTestReminderComment(); }}
                  className="w-full flex items-center justify-between text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Icon icon="solar:bell-bing-linear" className="text-neutral-600" />
                    <span>Test Reminder Comment</span>
                  </span>
                  <span className="text-[10px] text-neutral-600">Dev action</span>
                </button>
              )}
              {isDevEnvironment && (
                <button
                  type="button"
                  onClick={() => { void triggerTestPrayerReminderComment(); }}
                  className="w-full flex items-center justify-between text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Icon icon="solar:alarm-linear" className="text-neutral-600" />
                    <span>Test Prayer Reminder (Maghrib)</span>
                  </span>
                  <span className="text-[10px] text-neutral-600">Dev action</span>
                </button>
              )}
              {isDevEnvironment && (
                <button
                  type="button"
                  onClick={() => { void triggerTestTodoReminderComment(); }}
                  className="w-full flex items-center justify-between text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Icon icon="solar:clipboard-list-linear" className="text-neutral-600" />
                    <span>Test To Do Reminder</span>
                  </span>
                  <span className="text-[10px] text-neutral-600">Review PR 3</span>
                </button>
              )}
              {isDevEnvironment && (
                <button
                  type="button"
                  onClick={() => { window.ayati.forcePetSleep(); }}
                  className="w-full flex items-center justify-between text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Icon icon="solar:sleeping-linear" className="text-neutral-600" />
                    <span>Set {APP_DISPLAY_NAME} to Sleep</span>
                  </span>
                  <span className="text-[10px] text-neutral-600">Dev action</span>
                </button>
              )}
              {isDevEnvironment && (
                <button
                  type="button"
                  onClick={() => { void triggerWelcomeChatBubble(); }}
                  className="w-full flex items-center justify-between text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Icon icon="solar:chat-round-line-linear" className="text-neutral-600" />
                    <span>Test Welcome Chat Bubble</span>
                  </span>
                  <span className="text-[10px] text-neutral-600">Dev action</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (confirm('This will reset onboarding and restart the app. Continue?')) {
                    window.ayati.resetOnboarding();
                  }
                }}
                className="w-full flex items-center justify-between text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Icon icon="solar:restart-linear" className="text-neutral-600" />
                  <span>Reset Onboarding</span>
                </span>
                <span className="text-[10px] text-neutral-600">Restart required</span>
              </button>
              </div>
            </SettingsSection>
          )}

          <button
            type="button"
            onClick={() => window.ayati.petContextMenuAction('quit')}
            className="mt-auto w-full flex items-center justify-center gap-2 py-3 text-sm text-neutral-600 hover:text-red-400 transition-colors"
          >
            <Icon icon="solar:close-circle-linear" width="16" height="16" />
            <span>Quit {APP_DISPLAY_NAME}</span>
          </button>
        </div>
          )}
      </div>

      <KeychainConsentModal
        isOpen={keychainConsentOpen}
        onContinue={() => void handleKeychainConsentContinue()}
        onCancel={handleKeychainConsentCancel}
      />
    </div>
  );
};
