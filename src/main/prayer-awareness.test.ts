import { describe, expect, it } from 'vitest';

import {
  getNextPrayer,
  isInsidePrayerQuietWindow,
  mergePrayerSettings,
  shouldRefreshPrayerDay,
  shouldSendPrayerReminder,
} from './prayer-awareness';
import type { PrayerDay, PrayerSettings } from './ayah-types';

const settings: PrayerSettings = {
  enabled: true,
  source: 'calculation',
  mosqueSlug: '',
  showIqamah: false,
  calculationCity: 'London',
  calculationCountry: 'United Kingdom',
  city: 'London',
  country: 'United Kingdom',
  method: 3,
  school: 0,
  reminderLeadMinutes: 10,
  quietMinutesAfterPrayer: 15,
  use24h: true,
  hasSavedSettings: false,
};

const day: PrayerDay = {
  date: '2026-05-02',
  city: 'London',
  country: 'United Kingdom',
  method: 3,
  school: 0,
  timezone: 'Europe/London',
  source: 'aladhan',
  fetchedAt: new Date('2026-05-02T00:30:00Z').getTime(),
  prayers: [
    { name: 'fajr', label: 'Fajr', time: '04:11', at: new Date('2026-05-02T03:11:00Z').getTime(), isReminderEnabled: true },
    { name: 'sunrise', label: 'Sunrise', time: '05:44', at: new Date('2026-05-02T04:44:00Z').getTime(), isReminderEnabled: false },
    { name: 'dhuhr', label: 'Dhuhr', time: '13:02', at: new Date('2026-05-02T12:02:00Z').getTime(), isReminderEnabled: true },
    { name: 'asr', label: 'Asr', time: '17:07', at: new Date('2026-05-02T16:07:00Z').getTime(), isReminderEnabled: true },
    { name: 'maghrib', label: 'Maghrib', time: '20:17', at: new Date('2026-05-02T19:17:00Z').getTime(), isReminderEnabled: true },
    { name: 'isha', label: 'Isha', time: '21:43', at: new Date('2026-05-02T20:43:00Z').getTime(), isReminderEnabled: true },
  ],
};

const tomorrow: PrayerDay = {
  date: '2026-05-03',
  city: 'London',
  country: 'United Kingdom',
  method: 3,
  school: 0,
  timezone: 'Europe/London',
  source: 'aladhan',
  fetchedAt: new Date('2026-05-02T00:30:00Z').getTime(),
  prayers: [
    { name: 'fajr', label: 'Fajr', time: '04:10', at: new Date('2026-05-03T03:10:00Z').getTime(), isReminderEnabled: true },
    { name: 'sunrise', label: 'Sunrise', time: '05:43', at: new Date('2026-05-03T04:43:00Z').getTime(), isReminderEnabled: false },
    { name: 'dhuhr', label: 'Dhuhr', time: '13:02', at: new Date('2026-05-03T12:02:00Z').getTime(), isReminderEnabled: true },
    { name: 'asr', label: 'Asr', time: '17:08', at: new Date('2026-05-03T16:08:00Z').getTime(), isReminderEnabled: true },
    { name: 'maghrib', label: 'Maghrib', time: '20:18', at: new Date('2026-05-03T19:18:00Z').getTime(), isReminderEnabled: true },
    { name: 'isha', label: 'Isha', time: '21:44', at: new Date('2026-05-03T20:44:00Z').getTime(), isReminderEnabled: true },
  ],
};

describe('prayer awareness', () => {
  it('gets the next upcoming prayer', () => {
    expect(getNextPrayer(day, new Date('2026-05-02T11:00:00Z').getTime())?.name).toBe('dhuhr');
  });

  it('rolls to the next day Fajr after the last prayer of the current day', () => {
    const afterIsha = new Date('2026-05-02T21:50:00Z').getTime();
    expect(getNextPrayer(day, afterIsha, null)).toBeNull();
    expect(getNextPrayer(day, afterIsha, tomorrow)?.name).toBe('fajr');
  });

  it('refreshes when the stored day is missing or from another date/location', () => {
    expect(shouldRefreshPrayerDay(null, null, settings, new Date('2026-05-02T08:00:00Z').getTime())).toBe(true);
    expect(shouldRefreshPrayerDay(day, tomorrow, settings, new Date('2026-05-03T08:00:00Z').getTime())).toBe(true);
    expect(shouldRefreshPrayerDay(day, null, { ...settings, city: 'Manchester' }, new Date('2026-05-02T08:00:00Z').getTime())).toBe(true);
    expect(shouldRefreshPrayerDay(day, tomorrow, settings, new Date('2026-05-02T08:00:00Z').getTime())).toBe(false);
  });

  it('preserves calculation location when switching to Masjidly and back', () => {
    const calculation = mergePrayerSettings(settings, {
      city: 'Manchester',
      country: 'United Kingdom',
      hasSavedSettings: true,
    });
    expect(calculation).toMatchObject({
      source: 'calculation',
      city: 'Manchester',
      country: 'United Kingdom',
      calculationCity: 'Manchester',
      calculationCountry: 'United Kingdom',
    });

    const masjidly = mergePrayerSettings(calculation, {
      source: 'masjidly',
      mosqueSlug: 'mwhs',
    });
    expect(masjidly).toMatchObject({
      source: 'masjidly',
      mosqueSlug: 'mwhs',
      city: '',
      country: '',
      calculationCity: 'Manchester',
      calculationCountry: 'United Kingdom',
    });

    const restored = mergePrayerSettings(masjidly, { source: 'calculation' });
    expect(restored).toMatchObject({
      source: 'calculation',
      city: 'Manchester',
      country: 'United Kingdom',
      mosqueSlug: 'mwhs',
      calculationCity: 'Manchester',
      calculationCountry: 'United Kingdom',
    });
  });

  it('matches Masjidly days by selected mosque', () => {
    const masjidlySettings: PrayerSettings = { ...settings, source: 'masjidly', mosqueSlug: 'mwhs' };
    const masjidlyDay: PrayerDay = { ...day, source: 'masjidly', mosqueSlug: 'mwhs' };
    expect(shouldRefreshPrayerDay(masjidlyDay, null, masjidlySettings, new Date('2026-05-02T08:00:00Z').getTime())).toBe(false);
    expect(shouldRefreshPrayerDay(masjidlyDay, null, { ...masjidlySettings, mosqueSlug: 'other' }, new Date('2026-05-02T08:00:00Z').getTime())).toBe(true);
  });

  it('refreshes stale cached Masjidly times with unresolved iqamah rules, but not freshly fetched ones', () => {
    const masjidlySettings: PrayerSettings = { ...settings, source: 'masjidly', mosqueSlug: 'masjid-risalah' };
    const now = new Date('2026-05-02T08:00:00Z').getTime();
    const unresolvedPrayers = day.prayers.map((prayer) => (
      prayer.name === 'fajr' ? { ...prayer, iqamahTime: '10 minutes after adhan' } : prayer
    ));
    const freshDay: PrayerDay = {
      ...day,
      source: 'masjidly',
      mosqueSlug: 'masjid-risalah',
      fetchedAt: now - (30 * 60 * 1000),
      prayers: unresolvedPrayers,
    };
    const staleDay: PrayerDay = {
      ...freshDay,
      fetchedAt: now - (2 * 60 * 60 * 1000),
    };

    expect(shouldRefreshPrayerDay(freshDay, null, masjidlySettings, now)).toBe(false);
    expect(shouldRefreshPrayerDay(staleDay, null, masjidlySettings, now)).toBe(true);
  });

  it('refreshes after the last prayer when tomorrow times are missing or stale', () => {
    const afterIsha = new Date('2026-05-02T21:50:00Z').getTime();
    expect(shouldRefreshPrayerDay(day, null, settings, afterIsha)).toBe(true);
    expect(shouldRefreshPrayerDay(day, tomorrow, settings, afterIsha)).toBe(false);
    expect(shouldRefreshPrayerDay(day, { ...tomorrow, date: '2026-05-04' }, settings, afterIsha)).toBe(true);
  });

  it('sends one reminder inside the lead window and ignores sunrise', () => {
    const fajrReminder = shouldSendPrayerReminder({
      day,
      settings,
      sentReminderKeys: [],
      now: new Date('2026-05-02T03:05:00Z').getTime(),
    });
    expect(fajrReminder).toMatchObject({ shouldSend: true, reminderKey: '2026-05-02:fajr' });

    expect(shouldSendPrayerReminder({
      day,
      settings,
      sentReminderKeys: ['2026-05-02:fajr'],
      now: new Date('2026-05-02T03:05:00Z').getTime(),
    }).shouldSend).toBe(false);

    expect(shouldSendPrayerReminder({
      day,
      settings,
      sentReminderKeys: [],
      now: new Date('2026-05-02T04:40:00Z').getTime(),
    }).shouldSend).toBe(false);
  });

  it('sends the next-day Fajr reminder when today has no upcoming prayers', () => {
    const nextFajrReminder = shouldSendPrayerReminder({
      day,
      tomorrow,
      settings,
      sentReminderKeys: [],
      now: new Date('2026-05-03T03:05:00Z').getTime(),
    });
    expect(nextFajrReminder).toMatchObject({ shouldSend: true, reminderKey: '2026-05-03:fajr' });
  });

  it('detects quiet minutes after prayer starts', () => {
    expect(isInsidePrayerQuietWindow({
      day,
      settings,
      now: new Date('2026-05-02T12:10:00Z').getTime(),
    })).toBe(true);
    expect(isInsidePrayerQuietWindow({
      day,
      settings,
      now: new Date('2026-05-02T12:25:00Z').getTime(),
    })).toBe(false);
  });
});
