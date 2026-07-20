import type { PrayerDay, PrayerName, PrayerTimeEntry } from './ayah-types';

export interface FetchPrayerTimesInput {
  city: string;
  country: string;
  method: number;
  school: 0 | 1;
  date: Date;
  timezone: string;
  fetchImpl?: typeof fetch;
}

export interface FetchMasjidlyPrayerTimesInput {
  mosqueSlug: string;
  date: Date;
  fetchImpl?: typeof fetch;
}

export interface MasjidlyMosqueSummary {
  slug: string;
  name: string;
  cityName: string;
  countryName: string;
  timezone: string;
}

interface MasjidlyMosque extends MasjidlyMosqueSummary {
  citySlug: string;
  countryCode: string;
  isHidden?: boolean;
}

const MASJIDLY_BASE_URL = 'https://www.sheffieldmasjids.com';
const MAX_IQAMAH_LABEL_LENGTH = 40;
const PATH_SEGMENT_PATTERN = /^[a-z0-9-]+$/i;

const PRAYER_FIELDS: Array<{ name: PrayerName; label: string; source: string; masjidlySource: string; isReminderEnabled: boolean }> = [
  { name: 'fajr', label: 'Fajr', source: 'Fajr', masjidlySource: 'fajr', isReminderEnabled: true },
  { name: 'sunrise', label: 'Sunrise', source: 'Sunrise', masjidlySource: 'shurooq', isReminderEnabled: false },
  { name: 'dhuhr', label: 'Dhuhr', source: 'Dhuhr', masjidlySource: 'dhuhr', isReminderEnabled: true },
  { name: 'asr', label: 'Asr', source: 'Asr', masjidlySource: 'asr', isReminderEnabled: true },
  { name: 'maghrib', label: 'Maghrib', source: 'Maghrib', masjidlySource: 'maghrib', isReminderEnabled: true },
  { name: 'isha', label: 'Isha', source: 'Isha', masjidlySource: 'isha', isReminderEnabled: true },
];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatRequestDate(date: Date): string {
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function normalizeTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/\b(\d{1,2}):([0-5]\d)\b/);
  if (!match) return null;
  const hours = Number.parseInt(match[1], 10);
  if (hours > 23) return null;
  return `${pad(hours)}:${match[2]}`;
}

function resolveLocalPrayerTime(date: Date, time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0).getTime();
}

/** Wall-clock time in `timeZone` on the local calendar day of `date`. */
function resolveZonedPrayerTime(date: Date, time: string, timeZone: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  // ponytail: offset-correct UTC guess for IANA wall time; swap for Temporal.ZonedDateTime when available
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const zonedAsUtc = (timestamp: number): number => {
    const parts = formatter.formatToParts(new Date(timestamp));
    const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'), 0);
  };
  const desiredAsUtc = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
  // First guess: treat desired wall clock as UTC, then subtract the zone offset observed there.
  let utc = desiredAsUtc - (zonedAsUtc(desiredAsUtc) - desiredAsUtc);
  // Correct residual offset (DST edges); keep refining from the current guess.
  utc -= zonedAsUtc(utc) - desiredAsUtc;
  return utc;
}

function addMinutes(time: string, minutesToAdd: number): string {
  const [hours, minutes] = time.split(':').map(Number);
  const total = (hours * 60 + minutes + minutesToAdd) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function resolveMasjidlyIqamahTime(prayer: PrayerName, adhanTime: string, value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  const fixedTime = normalizeTime(raw);
  if (fixedTime) return fixedTime;

  const offset = raw.match(/^adhan\s*\+\s*(\d+)\s*(?:mins?|minutes?)?$/i)
    ?? raw.match(/^(\d+)\s*(?:mins?|minutes?)\s*after\s*adhan$/i);
  if (offset) return addMinutes(adhanTime, Number.parseInt(offset[1], 10));

  const lower = raw.toLowerCase();
  if (lower === 'entry time'
    || (prayer === 'fajr' && lower === 'various')
    || (prayer === 'maghrib' && lower === 'sunset')) return adhanTime;
  if (prayer === 'isha' && ['after maghrib', 'combined with maghrib', 'straight after maghrib'].includes(lower)) {
    return 'After Maghrib';
  }
  // Bound unknown third-party labels; drop garbage/long remote strings from the table.
  if (raw.length > MAX_IQAMAH_LABEL_LENGTH || /[\r\n\t]/.test(raw)) return null;
  if (!/^[\w .'+()/-]+$/i.test(raw)) return null;
  return raw;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseTimings(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload) || !isRecord(payload.data) || !isRecord(payload.data.timings)) {
    throw new Error('Prayer times response was missing required timings.');
  }
  return payload.data.timings;
}

function matchesDateRange(value: unknown, day: number): boolean {
  if (typeof value !== 'string') return false;
  const [start, end = start] = value.split('-').map(Number);
  return Number.isInteger(start) && Number.isInteger(end) && day >= start && day <= end;
}

function isSafePathSegment(value: unknown): value is string {
  return typeof value === 'string' && PATH_SEGMENT_PATTERN.test(value);
}

function parseMasjidlyMosque(entry: unknown): MasjidlyMosque | null {
  if (!isRecord(entry) || entry.isHidden === true) return null;
  if (!isSafePathSegment(entry.slug)
    || !isSafePathSegment(entry.citySlug)
    || !isSafePathSegment(entry.countryCode)
    || typeof entry.name !== 'string'
    || typeof entry.cityName !== 'string'
    || typeof entry.countryName !== 'string'
    || typeof entry.timezone !== 'string'
    || !entry.timezone.trim()) {
    return null;
  }
  return {
    slug: entry.slug,
    name: entry.name.trim(),
    citySlug: entry.citySlug,
    cityName: entry.cityName.trim(),
    countryCode: entry.countryCode,
    countryName: entry.countryName.trim(),
    timezone: entry.timezone.trim(),
    isHidden: false,
  };
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error('Prayer times are unavailable right now.');
  try {
    return await response.json();
  } catch {
    throw new Error('Prayer times response could not be read.');
  }
}

async function loadMasjidlyMosques(fetchImpl: typeof fetch): Promise<MasjidlyMosque[]> {
  const directory = await readJson(await fetchImpl(`${MASJIDLY_BASE_URL}/data/mosques.json`));
  const mosques = isRecord(directory) && Array.isArray(directory.mosques) ? directory.mosques : [];
  return mosques
    .map(parseMasjidlyMosque)
    .filter((mosque): mosque is MasjidlyMosque => mosque !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listMasjidlyMosques(fetchImpl: typeof fetch = fetch): Promise<MasjidlyMosqueSummary[]> {
  const mosques = await loadMasjidlyMosques(fetchImpl);
  return mosques.map(({ slug, name, cityName, countryName, timezone }) => ({
    slug,
    name,
    cityName,
    countryName,
    timezone,
  }));
}

export async function fetchMasjidlyPrayerTimes(input: FetchMasjidlyPrayerTimesInput): Promise<PrayerDay> {
  const mosqueSlug = input.mosqueSlug.trim();
  if (!mosqueSlug) throw new Error('A mosque is required for Masjidly prayer times.');
  if (!isSafePathSegment(mosqueSlug)) throw new Error('The selected Masjidly mosque is unavailable.');

  const fetchImpl = input.fetchImpl ?? fetch;
  const mosques = await loadMasjidlyMosques(fetchImpl);
  const mosque = mosques.find((entry) => entry.slug === mosqueSlug);
  if (!mosque) throw new Error('The selected Masjidly mosque is unavailable.');

  const month = input.date.toLocaleString('en-US', { month: 'long' }).toLowerCase();
  const countryCode = mosque.countryCode.toLowerCase();
  const url = `${MASJIDLY_BASE_URL}/data/mosques/${encodeURIComponent(countryCode)}/${encodeURIComponent(mosque.citySlug)}/${encodeURIComponent(mosque.slug)}/${encodeURIComponent(month)}.json`;
  const payload = await readJson(await fetchImpl(url));
  if (!isRecord(payload) || !Array.isArray(payload.prayer_times)) {
    throw new Error('Prayer times response was missing required timings.');
  }
  const dayOfMonth = input.date.getDate();
  const prayerRow = payload.prayer_times.find((row) => isRecord(row) && row.date === dayOfMonth);
  if (!isRecord(prayerRow)) throw new Error('Masjidly has no timetable for this date.');
  const iqamahRow = Array.isArray(payload.iqamah_times)
    ? payload.iqamah_times.find((row) => isRecord(row) && matchesDateRange(row.date_range, dayOfMonth))
    : undefined;

  const prayers: PrayerTimeEntry[] = PRAYER_FIELDS.map((field) => {
    const time = normalizeTime(prayerRow[field.masjidlySource]);
    if (!time) throw new Error('Prayer times response was missing required timings.');
    const iqamahTime = resolveMasjidlyIqamahTime(
      field.name,
      time,
      isRecord(iqamahRow) ? iqamahRow[field.masjidlySource] : undefined,
    );
    return {
      name: field.name,
      label: field.label,
      time,
      at: resolveZonedPrayerTime(input.date, time, mosque.timezone),
      isReminderEnabled: field.isReminderEnabled,
      ...(iqamahTime ? { iqamahTime } : {}),
    };
  });

  return {
    date: formatDateKey(input.date),
    city: mosque.cityName,
    country: mosque.countryName,
    method: 0,
    school: 0,
    timezone: mosque.timezone,
    source: 'masjidly',
    mosqueSlug: mosque.slug,
    mosqueName: mosque.name,
    fetchedAt: Date.now(),
    prayers,
  };
}

export async function fetchPrayerTimesByCity(input: FetchPrayerTimesInput): Promise<PrayerDay> {
  const city = input.city.trim();
  const country = input.country.trim();
  if (!city || !country) {
    throw new Error('City and country are required for prayer times.');
  }

  const url = new URL(`https://api.aladhan.com/v1/timingsByCity/${formatRequestDate(input.date)}`);
  url.searchParams.set('city', city);
  url.searchParams.set('country', country);
  url.searchParams.set('method', String(input.method));
  url.searchParams.set('school', String(input.school));

  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(url.toString());
  if (!response.ok) {
    throw new Error('Prayer times are unavailable right now.');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Prayer times response could not be read.');
  }

  const timings = parseTimings(payload);
  const prayers: PrayerTimeEntry[] = PRAYER_FIELDS.map((field) => {
    const time = normalizeTime(timings[field.source]);
    if (!time) {
      throw new Error('Prayer times response was missing required timings.');
    }
    return {
      name: field.name,
      label: field.label,
      time,
      at: resolveLocalPrayerTime(input.date, time),
      isReminderEnabled: field.isReminderEnabled,
    };
  });

  return {
    date: formatDateKey(input.date),
    city,
    country,
    method: input.method,
    school: input.school,
    timezone: input.timezone,
    source: 'aladhan',
    fetchedAt: Date.now(),
    prayers,
  };
}
