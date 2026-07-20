import type { PrayerDay, PrayerSettings, PrayerTimeEntry } from './ayah-types';

export { getNextPrayer } from '../shared/prayer-schedule';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

function sanitizeText(value: unknown, fallback: string, max = 120): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : fallback;
}

function sanitizeInt(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

/** Applies a prayer-settings patch, preserving calculation location across Masjidly toggles. */
export function mergePrayerSettings(current: PrayerSettings, patch: Partial<PrayerSettings>): PrayerSettings {
  const nextSource = patch.source === 'masjidly' || patch.source === 'calculation' ? patch.source : current.source;
  let city = sanitizeText(patch.city, current.city);
  let country = sanitizeText(patch.country, current.country);
  let calculationCity = sanitizeText(patch.calculationCity, current.calculationCity);
  let calculationCountry = sanitizeText(patch.calculationCountry, current.calculationCountry);
  const mosqueSlug = sanitizeText(patch.mosqueSlug, current.mosqueSlug);

  if (nextSource === 'masjidly' && current.source !== 'masjidly') {
    calculationCity = current.city || current.calculationCity;
    calculationCountry = current.country || current.calculationCountry;
    if (typeof patch.city !== 'string') city = '';
    if (typeof patch.country !== 'string') country = '';
  } else if (nextSource === 'calculation' && current.source === 'masjidly') {
    city = calculationCity || city;
    country = calculationCountry || country;
  } else if (nextSource === 'calculation') {
    calculationCity = city;
    calculationCountry = country;
  }

  return {
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled,
    source: nextSource,
    mosqueSlug,
    showIqamah: typeof patch.showIqamah === 'boolean' ? patch.showIqamah : current.showIqamah,
    calculationCity,
    calculationCountry,
    city,
    country,
    method: sanitizeInt(patch.method, current.method, 1, 99),
    school: patch.school === 1 ? 1 : patch.school === 0 ? 0 : current.school,
    reminderLeadMinutes: sanitizeInt(patch.reminderLeadMinutes, current.reminderLeadMinutes, 0, 120),
    quietMinutesAfterPrayer: sanitizeInt(patch.quietMinutesAfterPrayer, current.quietMinutesAfterPrayer, 0, 120),
    hasSavedSettings: typeof patch.hasSavedSettings === 'boolean' ? patch.hasSavedSettings : current.hasSavedSettings,
    use24h: typeof patch.use24h === 'boolean' ? patch.use24h : current.use24h,
  };
}

function localDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localTomorrowDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + 1);
  return localDateKey(date.getTime());
}

function reminderKey(day: PrayerDay, prayer: PrayerTimeEntry): string {
  return `${day.date}:${prayer.name}`;
}

function settingsMatchDay(day: PrayerDay, settings: PrayerSettings): boolean {
  if (settings.source === 'masjidly') {
    return day.source === 'masjidly' && day.mosqueSlug === settings.mosqueSlug;
  }
  return day.source === 'aladhan'
    && day.city.trim().toLowerCase() === settings.city.trim().toLowerCase()
    && day.country.trim().toLowerCase() === settings.country.trim().toLowerCase()
    && day.method === settings.method
    && day.school === settings.school;
}

function hasUpcomingPrayer(day: PrayerDay, now: number): boolean {
  return day.prayers.some((prayer) => prayer.at > now);
}

function hasUnresolvedMasjidlyIqamah(day: PrayerDay | null): boolean {
  return day?.source === 'masjidly' && day.prayers.some((prayer) => (
    typeof prayer.iqamahTime === 'string'
    && /^(?:adhan\s*\+|\d+\s*(?:mins?|minutes?)\s*after\s*adhan|entry time|various|sunset)/i.test(prayer.iqamahTime.trim())
  ));
}

export function shouldRefreshPrayerDay(
  day: PrayerDay | null,
  tomorrow: PrayerDay | null,
  settings: PrayerSettings,
  now: number,
): boolean {
  if (!settings.enabled) return false;
  if (settings.source === 'masjidly' ? !settings.mosqueSlug.trim() : (!settings.city.trim() || !settings.country.trim())) return false;
  if (!day) return true;
  if (day.date !== localDateKey(now)) return true;
  if (!settingsMatchDay(day, settings)) return true;
  // Migrate stale cached raw iqamah rules without a permanent once-per-minute refetch loop.
  if (
    (hasUnresolvedMasjidlyIqamah(day) || hasUnresolvedMasjidlyIqamah(tomorrow))
    && now - day.fetchedAt > ONE_HOUR_MS
  ) return true;
  if (now - day.fetchedAt > ONE_DAY_MS) return true;
  if (
    day.date === localDateKey(now)
    && !hasUpcomingPrayer(day, now)
    && (!tomorrow
      || tomorrow.date !== localTomorrowDateKey(now)
      || !settingsMatchDay(tomorrow, settings))
  ) {
    return true;
  }
  return false;
}

export function shouldSendPrayerReminder(input: {
  day: PrayerDay;
  tomorrow?: PrayerDay | null;
  settings: PrayerSettings;
  sentReminderKeys: string[];
  now: number;
}): { shouldSend: boolean; prayer?: PrayerTimeEntry; reminderKey?: string } {
  if (!input.settings.enabled) return { shouldSend: false };
  const leadMs = Math.max(0, input.settings.reminderLeadMinutes) * 60 * 1000;
  const tomorrow = input.tomorrow ?? null;

  const scan = (day: PrayerDay): { prayer: PrayerTimeEntry; reminderKey: string } | null => {
    const prayer = day.prayers.find((item) => {
      if (!item.isReminderEnabled) return false;
      const key = reminderKey(day, item);
      if (input.sentReminderKeys.includes(key)) return false;
      return input.now >= item.at - leadMs && input.now < item.at;
    });
    if (!prayer) return null;
    return { prayer, reminderKey: reminderKey(day, prayer) };
  };

  const todayHit = scan(input.day);
  if (todayHit) {
    return { shouldSend: true, prayer: todayHit.prayer, reminderKey: todayHit.reminderKey };
  }
  if (tomorrow) {
    const tomorrowHit = scan(tomorrow);
    if (tomorrowHit) {
      return { shouldSend: true, prayer: tomorrowHit.prayer, reminderKey: tomorrowHit.reminderKey };
    }
  }
  return { shouldSend: false };
}

export function isInsidePrayerQuietWindow(input: {
  day: PrayerDay | null;
  settings: PrayerSettings;
  now: number;
}): boolean {
  if (!input.day || !input.settings.enabled) return false;
  const quietMs = Math.max(0, input.settings.quietMinutesAfterPrayer) * 60 * 1000;
  if (quietMs === 0) return false;
  return input.day.prayers.some((prayer) => (
    prayer.isReminderEnabled && input.now >= prayer.at && input.now < prayer.at + quietMs
  ));
}
