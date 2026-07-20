import { randomUUID } from 'crypto';

import { getFallbackVerseContent } from './ayah-fallbacks';
import { rankAyahCandidates } from './ayah-theme-engine';
import { getRandomQuranVerseKey } from './quran-sentence-verse-pool';
import type {
  AyahLensSettings,
  AyahLensState,
  AyahReflection,
  AyahTheme,
  QuranVerseContent,
  ScreenInsight,
} from './ayah-types';

const APP_THEME_REPEAT_MS = 2 * 60 * 60 * 1000;
const MAX_RECENT_APP_THEME_KEYS = 30;
const MIN_ACTIONABLE_CONFIDENCE = 0.58;
const DEFAULT_NUDGE_COOLDOWN_MINUTES = 15;
const DEFAULT_TIMED_REMINDER_MINUTES = 15;
const DEFAULT_TIMED_REMINDER_FETCH_TIMEOUT_MS = 700;
const TIMED_REMINDER_REFLECTION = 'Pause for a Quran reminder and let this ayah reset the next moment.';

type NudgeTheme = Exclude<AyahTheme, 'unclear'>;
type ReflectionCopy = Pick<ReturnType<typeof rankAyahCandidates>[number], 'reflection' | 'whyThisVerse'>;

export interface ContextualNudgeInput {
  app: string;
  title?: string;
  now: number;
  settings: AyahLensSettings;
  nudgeState: AyahLensState['nudgeState'];
  recentVerseKeys: string[];
  fetchVerseContent: (verseKey: string) => Promise<QuranVerseContent>;
  ignoreLimits?: boolean;
}

export interface ContextualNudgeResult {
  message: {
    id: string;
    text: string;
    verseKey?: string;
    /** Arabic ayah text; shown RTL in the pet chat bubble (like Reflect on screen). */
    arabicText?: string;
    /** English translation shown below the Arabic line. */
    footerText?: string;
    trigger: 'app_switch' | 'timer';
    quickReplies: string[];
    reflectionId: string;
  };
  reflection: AyahReflection;
  nextState: AyahLensState['nudgeState'];
}

export interface TimedQuranReminderInput {
  now: number;
  settings: AyahLensSettings;
  nudgeState: AyahLensState['nudgeState'];
  recentVerseKeys: string[];
  fetchVerseContent: (verseKey: string) => Promise<QuranVerseContent>;
  verseFetchTimeoutMs?: number;
}

interface ClassifiedContext {
  insight: ScreenInsight;
  appThemeKey: string;
  label: string;
}

const SENSITIVE_APP_PATTERNS = [
  /1password/i,
  /bitwarden/i,
  /dashlane/i,
  /keeper/i,
  /keychain/i,
  /lastpass/i,
  /proton pass/i,
];

const SENSITIVE_TEXT_PATTERNS = [
  /\bbank(?:ing)?\b/i,
  /\bcard number\b/i,
  /\bdiagnosis\b/i,
  /\bmedical\b/i,
  /\bpatient\b/i,
  /\bpassword\b/i,
  /\bpasscode\b/i,
  /\bpayroll\b/i,
  /\bprivate message\b/i,
  /\bsalary\b/i,
  /\bsocial security\b/i,
  /\bssn\b/i,
  /\btax return\b/i,
];

const UNAVAILABLE_TITLE_PATTERNS = [
  /^\s*$/,
  /^\[?unavailable\]?\??$/i,
  /^unknown$/i,
];

const TITLE_THEME_RULES: Array<{ pattern: RegExp; theme: NudgeTheme; confidence: number; label: string; summary: string }> = [
  {
    pattern: /\b(quran|tafsir|hadith|islamic|surah|ayah|mushaf)\b/i,
    theme: 'study',
    confidence: 0.9,
    label: 'Quran study',
    summary: 'A Quran study or reading window is active.',
  },
  {
    pattern: /\b(api|docs?|documentation|readme|research|paper|notes?|course|lesson|study)\b/i,
    theme: 'study',
    confidence: 0.82,
    label: 'study',
    summary: 'A study or reading window is active.',
  },
  {
    pattern: /\b(todo|roadmap|calendar|schedule|plan|planning|linear|notion|jira|task)\b/i,
    theme: 'planning',
    confidence: 0.78,
    label: 'planning',
    summary: 'A planning window is active.',
  },
  {
    pattern: /\b(error|failed|failing|bug|incident|urgent|deadline|overdue|blocked)\b/i,
    theme: 'stress',
    confidence: 0.8,
    label: 'pressure',
    summary: 'A pressure-heavy work window is active.',
  },
  {
    pattern: /\b(pull request|merge|deploy|build|terminal|console|typescript|react|electron|code|github)\b/i,
    theme: 'work',
    confidence: 0.74,
    label: 'deep work',
    summary: 'A focused work window is active.',
  },
  {
    pattern: /\b(design|figma|canvas|photo|image|gallery|color|typography)\b/i,
    theme: 'beauty',
    confidence: 0.7,
    label: 'creative work',
    summary: 'A visual or creative window is active.',
  },
  {
    pattern: /\b(cart|checkout|sale|price|shop|amazon|ebay|marketplace)\b/i,
    theme: 'excess',
    confidence: 0.68,
    label: 'spending',
    summary: 'A shopping or spending window is active.',
  },
  {
    pattern: /\b(youtube|netflix|tiktok|instagram|reddit|x\.com|twitter|feed|shorts)\b/i,
    theme: 'distraction',
    confidence: 0.68,
    label: 'attention drift',
    summary: 'A media or feed window is active.',
  },
  {
    pattern: /\b(argument|complaint|conflict|dispute|angry|upset)\b/i,
    theme: 'conflict',
    confidence: 0.72,
    label: 'conflict',
    summary: 'A tense communication window is active.',
  },
];

const APP_THEME_RULES: Array<{ pattern: RegExp; theme: NudgeTheme; confidence: number; label: string; summary: string }> = [
  {
    pattern: /\b(cursor|visual studio code|xcode|terminal|iterm|warp|github desktop)\b/i,
    theme: 'work',
    confidence: 0.68,
    label: 'deep work',
    summary: 'A focused work app is active.',
  },
  {
    pattern: /\b(zotero|books|preview|obsidian|notion)\b/i,
    theme: 'study',
    confidence: 0.7,
    label: 'study',
    summary: 'A study or note-taking app is active.',
  },
  {
    pattern: /\b(figma|sketch|photoshop|illustrator|affinity)\b/i,
    theme: 'beauty',
    confidence: 0.68,
    label: 'creative work',
    summary: 'A visual or creative app is active.',
  },
  {
    pattern: /\b(calendar|reminders|things|todoist|linear|jira)\b/i,
    theme: 'planning',
    confidence: 0.72,
    label: 'planning',
    summary: 'A planning app is active.',
  },
];

function localDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isUnavailableTitle(title: string | undefined): boolean {
  return UNAVAILABLE_TITLE_PATTERNS.some((pattern) => pattern.test(title ?? ''));
}

function normalizeAppThemeKey(app: string, theme: AyahTheme): string {
  return `${app.trim().toLowerCase().replace(/\s+/g, ' ')}:${theme}`;
}

function isSensitiveContext(app: string, title: string | undefined): boolean {
  const haystack = `${app} ${title ?? ''}`;
  return SENSITIVE_APP_PATTERNS.some((pattern) => pattern.test(app))
    || SENSITIVE_TEXT_PATTERNS.some((pattern) => pattern.test(haystack));
}

function findRule(value: string, rules: typeof TITLE_THEME_RULES): typeof TITLE_THEME_RULES[number] | null {
  return rules.find((rule) => rule.pattern.test(value)) ?? null;
}

function classifyContext(app: string, title: string | undefined): ClassifiedContext | null {
  const cleanApp = app.trim();
  const cleanTitle = title?.trim();
  if (!cleanApp || isSensitiveContext(cleanApp, cleanTitle)) return null;

  const titleAvailable = !isUnavailableTitle(cleanTitle);
  const titleRule = titleAvailable && cleanTitle ? findRule(cleanTitle, TITLE_THEME_RULES) : null;
  const appRule = findRule(cleanApp, APP_THEME_RULES);
  const rule = titleRule ?? appRule;

  if (!rule || rule.confidence < MIN_ACTIONABLE_CONFIDENCE) return null;

  return {
    appThemeKey: normalizeAppThemeKey(cleanApp, rule.theme),
    label: rule.label,
    insight: {
      summary: rule.summary,
      category: rule.theme,
      themes: [{ id: rule.theme, confidence: rule.confidence }],
      overallConfidence: rule.confidence,
      isSensitive: false,
    },
  };
}

function normalizeNudgeState(
  state: AyahLensState['nudgeState'],
  now: number,
): AyahLensState['nudgeState'] {
  const today = localDateKey(now);
  if (state.shownTodayDate === today) {
    return {
      lastShownAt: state.lastShownAt ?? null,
      lastTimedReminderAt: state.lastTimedReminderAt ?? null,
      shownToday: state.shownToday,
      shownTodayDate: state.shownTodayDate,
      recentAppThemeKeys: state.recentAppThemeKeys ?? [],
    };
  }

  return {
    lastShownAt: state.lastShownAt ?? null,
    lastTimedReminderAt: state.lastTimedReminderAt ?? null,
    shownToday: 0,
    shownTodayDate: today,
    recentAppThemeKeys: state.recentAppThemeKeys ?? [],
  };
}

function canShowNudge(
  state: AyahLensState['nudgeState'],
  settings: AyahLensSettings,
  now: number,
  appThemeKey: string,
): boolean {
  if (!settings.contextualNudges) return false;

  const cooldownMinutes = Math.max(1, settings.nudgeCooldownMinutes || DEFAULT_NUDGE_COOLDOWN_MINUTES);
  if (state.lastShownAt && now - state.lastShownAt < cooldownMinutes * 60 * 1000) {
    return false;
  }

  return !state.recentAppThemeKeys.some((item) => (
    item.key === appThemeKey && now - item.shownAt < APP_THEME_REPEAT_MS
  ));
}

function canShowTimedReminder(
  state: AyahLensState['nudgeState'],
  settings: AyahLensSettings,
  now: number,
): boolean {
  if (!settings.timedReminders) return false;

  const intervalMinutes = Math.max(1, settings.timedReminderMinutes || DEFAULT_TIMED_REMINDER_MINUTES);
  const lastReminderAt = Math.max(state.lastShownAt ?? 0, state.lastTimedReminderAt ?? 0);
  return !lastReminderAt || now - lastReminderAt >= intervalMinutes * 60 * 1000;
}

function getNextNudgeState(
  state: AyahLensState['nudgeState'],
  now: number,
  appThemeKey: string,
): AyahLensState['nudgeState'] {
  const recentAppThemeKeys = [
    { key: appThemeKey, shownAt: now },
    ...state.recentAppThemeKeys.filter((item) => (
      item.key !== appThemeKey && now - item.shownAt < APP_THEME_REPEAT_MS
    )),
  ].slice(0, MAX_RECENT_APP_THEME_KEYS);

  return {
    lastShownAt: now,
    lastTimedReminderAt: state.lastTimedReminderAt ?? null,
    shownToday: state.shownToday + 1,
    shownTodayDate: localDateKey(now),
    recentAppThemeKeys,
  };
}

function getNextTimedReminderState(
  state: AyahLensState['nudgeState'],
  now: number,
): AyahLensState['nudgeState'] {
  return {
    lastShownAt: now,
    lastTimedReminderAt: now,
    shownToday: state.shownToday + 1,
    shownTodayDate: localDateKey(now),
    recentAppThemeKeys: state.recentAppThemeKeys,
  };
}

function buildReflection(
  verse: QuranVerseContent,
  copy: ReflectionCopy,
  insight: ScreenInsight,
  now: number,
): AyahReflection {
  return {
    id: randomUUID(),
    verseKey: verse.verseKey,
    surahName: verse.surahName,
    ayahNumber: verse.ayahNumber,
    arabicText: verse.arabicText,
    translation: verse.translation,
    translatorId: verse.translatorId,
    reflection: copy.reflection,
    whyThisVerse: copy.whyThisVerse,
    screenSummary: insight.summary,
    themes: insight.themes,
    createdAt: now,
    syncState: 'local',
  };
}

function buildPopupIntro(label: string, verse: QuranVerseContent): string {
  return `Looks like ${label}. A fitting reminder — **${verse.surahName} · ${verse.verseKey}**`;
}

function buildTimedReminderIntro(verse: QuranVerseContent): string {
  return `Time for a Quran reminder — **${verse.surahName} · ${verse.verseKey}**`;
}

function getTimedReminderInsight(): ScreenInsight {
  return {
    summary: 'A timer-based Quran reminder was due.',
    category: 'gratitude',
    themes: [
      { id: 'gratitude', confidence: 0.72 },
      { id: 'focus', confidence: 0.64 },
      { id: 'patience', confidence: 0.6 },
    ],
    overallConfidence: 0.72,
    isSensitive: false,
  };
}

async function fetchTimedReminderVerseContent(input: TimedQuranReminderInput, verseKey: string): Promise<QuranVerseContent> {
  const timeoutMs = Math.max(1, input.verseFetchTimeoutMs ?? DEFAULT_TIMED_REMINDER_FETCH_TIMEOUT_MS);
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      input.fetchVerseContent(verseKey),
      new Promise<QuranVerseContent>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Timed Quran reminder content fetch timed out.'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function buildContextualQuranNudge(input: ContextualNudgeInput): Promise<ContextualNudgeResult | null> {
  const classified = classifyContext(input.app, input.title);
  if (!classified) return null;

  const normalizedState = normalizeNudgeState(input.nudgeState, input.now);
  if (!input.ignoreLimits && !canShowNudge(normalizedState, input.settings, input.now, classified.appThemeKey)) {
    return null;
  }

  const [candidate] = rankAyahCandidates(classified.insight, input.recentVerseKeys);
  if (!candidate) return null;

  let verse: QuranVerseContent;
  try {
    verse = await input.fetchVerseContent(candidate.verseKey);
  } catch {
    verse = getFallbackVerseContent(candidate.verseKey);
  }

  const reflection = buildReflection(verse, candidate, classified.insight, input.now);
  return {
    reflection,
    nextState: getNextNudgeState(normalizedState, input.now, classified.appThemeKey),
    message: {
      id: randomUUID(),
      text: buildPopupIntro(classified.label, verse),
      verseKey: verse.verseKey,
      arabicText: verse.arabicText,
      footerText: verse.translation,
      trigger: 'app_switch',
      quickReplies: ['Listen', 'Tafsir', 'Reflect', 'Save', 'Dismiss'],
      reflectionId: reflection.id,
    },
  };
}

export async function buildTimedQuranReminder(input: TimedQuranReminderInput): Promise<ContextualNudgeResult | null> {
  const normalizedState = normalizeNudgeState(input.nudgeState, input.now);
  if (!canShowTimedReminder(normalizedState, input.settings, input.now)) {
    return null;
  }

  const insight = getTimedReminderInsight();
  const verseKey = getRandomQuranVerseKey();

  let verse: QuranVerseContent;
  try {
    verse = await fetchTimedReminderVerseContent(input, verseKey);
  } catch {
    verse = getFallbackVerseContent(verseKey);
  }

  const reflection = buildReflection(verse, {
    reflection: TIMED_REMINDER_REFLECTION,
    whyThisVerse: '',
  }, insight, input.now);

  return {
    reflection,
    nextState: getNextTimedReminderState(normalizedState, input.now),
    message: {
      id: randomUUID(),
      text: buildTimedReminderIntro(verse),
      verseKey: verse.verseKey,
      arabicText: verse.arabicText,
      footerText: verse.translation,
      trigger: 'timer',
      quickReplies: ['Listen', 'Tafsir', 'Reflect', 'Save', 'Dismiss'],
      reflectionId: reflection.id,
    },
  };
}
