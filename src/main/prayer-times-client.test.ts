import { describe, expect, it, vi } from 'vitest';

import { fetchMasjidlyPrayerTimes, fetchPrayerTimesByCity, listMasjidlyMosques } from './prayer-times-client';

const apiResponse = {
  code: 200,
  status: 'OK',
  data: {
    timings: {
      Fajr: '04:11 (BST)',
      Sunrise: '05:44 (BST)',
      Dhuhr: '13:02 (BST)',
      Asr: '17:07 (BST)',
      Maghrib: '20:17 (BST)',
      Isha: '21:43 (BST)',
    },
  },
};

describe('fetchPrayerTimesByCity', () => {
  it('builds the AlAdhan city URL and normalizes prayer times', async () => {
    const fetchImpl = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>(async () => new Response(JSON.stringify(apiResponse), { status: 200 }));

    const day = await fetchPrayerTimesByCity({
      city: 'London',
      country: 'United Kingdom',
      method: 3,
      school: 0,
      date: new Date('2026-05-02T08:00:00Z'),
      timezone: 'Europe/London',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchImpl.mock.calls[0]?.[0] ?? '');
    expect(calledUrl).toContain('/v1/timingsByCity/02-05-2026?');
    expect(calledUrl).toContain('city=London');
    expect(calledUrl).toContain('country=United+Kingdom');
    expect(calledUrl).toContain('method=3');
    expect(calledUrl).toContain('school=0');
    expect(day).toMatchObject({
      date: '2026-05-02',
      city: 'London',
      country: 'United Kingdom',
      method: 3,
      school: 0,
      timezone: 'Europe/London',
      source: 'aladhan',
    });
    expect(day.prayers.map((prayer) => prayer.name)).toEqual(['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']);
    expect(day.prayers.find((prayer) => prayer.name === 'sunrise')?.isReminderEnabled).toBe(false);
    expect(day.prayers.find((prayer) => prayer.name === 'fajr')?.time).toBe('04:11');
  });

  it('normalizes Masjidly adhan and matching iqamah times', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.endsWith('/data/mosques.json')) {
        return new Response(JSON.stringify({ mosques: [{
          slug: 'muslim-welfare-house',
          name: 'Muslim Welfare House Sheffield',
          citySlug: 'sheffield',
          cityName: 'Sheffield',
          countryCode: 'GB',
          countryName: 'United Kingdom',
          timezone: 'Europe/London',
          isHidden: false,
        }] }), { status: 200 });
      }
      return new Response(JSON.stringify({
        prayer_times: [{ date: 15, fajr: '03:46', shurooq: '04:53', dhuhr: '13:12', asr: '17:34', maghrib: '21:30', isha: '22:36' }],
        iqamah_times: [{ date_range: '11-20', fajr: '10 minutes after adhan', dhuhr: '13:30', asr: 'Entry Time', maghrib: 'Adhan+5', isha: 'After Maghrib' }],
      }), { status: 200 });
    });

    const day = await fetchMasjidlyPrayerTimes({
      mosqueSlug: 'muslim-welfare-house',
      date: new Date(2026, 6, 15, 8),
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain('/gb/sheffield/muslim-welfare-house/july.json');
    expect(day).toMatchObject({
      city: 'Sheffield',
      country: 'United Kingdom',
      source: 'masjidly',
      mosqueSlug: 'muslim-welfare-house',
      mosqueName: 'Muslim Welfare House Sheffield',
      timezone: 'Europe/London',
    });
    expect(day.prayers.find((prayer) => prayer.name === 'fajr')).toMatchObject({ time: '03:46', iqamahTime: '03:56' });
    expect(day.prayers.find((prayer) => prayer.name === 'dhuhr')?.iqamahTime).toBe('13:30');
    expect(day.prayers.find((prayer) => prayer.name === 'asr')?.iqamahTime).toBe('17:34');
    expect(day.prayers.find((prayer) => prayer.name === 'maghrib')?.iqamahTime).toBe('21:35');
    expect(day.prayers.find((prayer) => prayer.name === 'isha')?.iqamahTime).toBe('After Maghrib');
  });

  it('accepts one-digit hour strings and omits unknown/long iqamah labels', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.endsWith('/data/mosques.json')) {
        return new Response(JSON.stringify({ mosques: [{
          slug: 'test-mosque',
          name: 'Test Mosque',
          citySlug: 'sheffield',
          cityName: 'Sheffield',
          countryCode: 'GB',
          countryName: 'United Kingdom',
          timezone: 'Europe/London',
        }] }), { status: 200 });
      }
      return new Response(JSON.stringify({
        prayer_times: [{ date: 3, fajr: '3:46', shurooq: '4:53', dhuhr: '13:12', asr: '17:34', maghrib: '21:30', isha: '22:36' }],
        iqamah_times: [{
          date_range: '1-10',
          fajr: '9:30',
          dhuhr: 'x'.repeat(80),
          asr: 'Adhan + TBC !!!',
          maghrib: 'Sunset',
          isha: 'After Maghrib',
        }],
      }), { status: 200 });
    });

    const day = await fetchMasjidlyPrayerTimes({
      mosqueSlug: 'test-mosque',
      date: new Date(2026, 6, 3, 8),
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(day.prayers.find((prayer) => prayer.name === 'fajr')).toMatchObject({ time: '03:46', iqamahTime: '09:30' });
    expect(day.prayers.find((prayer) => prayer.name === 'dhuhr')?.iqamahTime).toBeUndefined();
    expect(day.prayers.find((prayer) => prayer.name === 'asr')?.iqamahTime).toBeUndefined();
    expect(day.prayers.find((prayer) => prayer.name === 'maghrib')?.iqamahTime).toBe('21:30');
    expect(day.prayers.find((prayer) => prayer.name === 'isha')?.iqamahTime).toBe('After Maghrib');
  });

  it('computes Masjidly prayer timestamps in the mosque timezone, not the system timezone', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.endsWith('/data/mosques.json')) {
        return new Response(JSON.stringify({ mosques: [{
          slug: 'dubai-mosque',
          name: 'Dubai Mosque',
          citySlug: 'dubai',
          cityName: 'Dubai',
          countryCode: 'AE',
          countryName: 'United Arab Emirates',
          timezone: 'Asia/Dubai',
        }] }), { status: 200 });
      }
      return new Response(JSON.stringify({
        prayer_times: [{ date: 15, fajr: '05:00', shurooq: '06:20', dhuhr: '12:30', asr: '15:45', maghrib: '18:40', isha: '20:00' }],
        iqamah_times: [],
      }), { status: 200 });
    });

    const day = await fetchMasjidlyPrayerTimes({
      mosqueSlug: 'dubai-mosque',
      date: new Date(2026, 0, 15, 12),
      fetchImpl: fetchImpl as typeof fetch,
    });

    const fajrAt = day.prayers.find((prayer) => prayer.name === 'fajr')?.at;
    expect(fajrAt).toBeTypeOf('number');
    // 05:00 Asia/Dubai is 01:00 UTC year-round (UTC+4).
    expect(new Date(fajrAt as number).toISOString()).toBe('2026-01-15T01:00:00.000Z');
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Dubai',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(fajrAt as number));
    expect(`${parts.find((p) => p.type === 'hour')?.value}:${parts.find((p) => p.type === 'minute')?.value}`).toBe('05:00');
  });

  it('rejects unsafe Masjidly path segments from the directory', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      mosques: [{
        slug: '../evil',
        name: 'Bad',
        citySlug: 'sheffield',
        cityName: 'Sheffield',
        countryCode: 'GB',
        countryName: 'United Kingdom',
        timezone: 'Europe/London',
      }],
    }), { status: 200 }));

    await expect(fetchMasjidlyPrayerTimes({
      mosqueSlug: '../evil',
      date: new Date(2026, 6, 15, 8),
      fetchImpl: fetchImpl as typeof fetch,
    })).rejects.toThrow('The selected Masjidly mosque is unavailable.');
  });

  it('lists visible Masjidly mosques for the renderer directory UI', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      mosques: [{
        slug: 'mwhs',
        name: 'Muslim Welfare House',
        citySlug: 'sheffield',
        cityName: 'Sheffield',
        countryCode: 'GB',
        countryName: 'United Kingdom',
        timezone: 'Europe/London',
        isHidden: false,
      }, {
        slug: 'hidden',
        name: 'Hidden',
        citySlug: 'sheffield',
        cityName: 'Sheffield',
        countryCode: 'GB',
        countryName: 'United Kingdom',
        timezone: 'Europe/London',
        isHidden: true,
      }],
    }), { status: 200 }));

    await expect(listMasjidlyMosques(fetchImpl as typeof fetch)).resolves.toEqual([{
      slug: 'mwhs',
      name: 'Muslim Welfare House',
      cityName: 'Sheffield',
      countryName: 'United Kingdom',
      timezone: 'Europe/London',
    }]);
  });

  it('returns a readable error when AlAdhan fails', async () => {
    const fetchImpl = vi.fn(async () => new Response('Service unavailable', { status: 503 }));

    await expect(fetchPrayerTimesByCity({
      city: 'London',
      country: 'United Kingdom',
      method: 3,
      school: 0,
      date: new Date('2026-05-02T08:00:00Z'),
      timezone: 'Europe/London',
      fetchImpl,
    })).rejects.toThrow('Prayer times are unavailable right now.');
  });

  it('rejects incomplete timing payloads', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      code: 200,
      data: { timings: { Fajr: '04:11' } },
    }), { status: 200 }));

    await expect(fetchPrayerTimesByCity({
      city: 'London',
      country: 'United Kingdom',
      method: 3,
      school: 0,
      date: new Date('2026-05-02T08:00:00Z'),
      timezone: 'Europe/London',
      fetchImpl,
    })).rejects.toThrow('Prayer times response was missing required timings.');
  });
});
