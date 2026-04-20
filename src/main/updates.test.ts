import { describe, expect, it } from 'vitest';

import {
  createInitialUpdateState,
  reduceUpdateStateOnDownloadComplete,
  reduceUpdateStateOnDownloadProgress,
  reduceUpdateStateOnDownloadStart,
  reduceUpdateStateOnNoUpdate,
  reduceUpdateStateOnUpdateAvailable,
  shouldBroadcastDownloadProgress,
} from './updates';

const runtimeInfo = {
  hostArch: 'arm64' as const,
  appArch: 'x64' as const,
  runningUnderArm64Translation: true,
};

describe('desktop update state', () => {
  it('tracks update availability, download progress, and download completion', () => {
    const initial = createInitialUpdateState('0.0.1', runtimeInfo);
    const available = reduceUpdateStateOnUpdateAvailable(initial, '0.0.2', '2026-04-20T09:00:00.000Z');
    const downloading = reduceUpdateStateOnDownloadStart(available);
    const progress = reduceUpdateStateOnDownloadProgress(downloading, 54.4);
    const downloaded = reduceUpdateStateOnDownloadComplete(progress, '0.0.2');

    expect(available).toMatchObject({
      status: 'available',
      availableVersion: '0.0.2',
      checkedAt: '2026-04-20T09:00:00.000Z',
    });
    expect(progress).toMatchObject({
      status: 'downloading',
      downloadPercent: 54.4,
    });
    expect(downloaded).toMatchObject({
      status: 'downloaded',
      availableVersion: '0.0.2',
      downloadedVersion: '0.0.2',
      downloadPercent: 100,
    });
  });

  it('clears stale update metadata when no update is available', () => {
    const initial = createInitialUpdateState('0.0.1', runtimeInfo);
    const available = reduceUpdateStateOnUpdateAvailable(initial, '0.0.2', '2026-04-20T09:00:00.000Z');

    expect(reduceUpdateStateOnNoUpdate(available, '2026-04-20T10:00:00.000Z')).toMatchObject({
      status: 'up-to-date',
      availableVersion: null,
      downloadedVersion: null,
      downloadPercent: null,
      checkedAt: '2026-04-20T10:00:00.000Z',
    });
  });

  it('only broadcasts download progress at meaningful milestones', () => {
    const state = reduceUpdateStateOnDownloadProgress(
      reduceUpdateStateOnDownloadStart(
        reduceUpdateStateOnUpdateAvailable(
          createInitialUpdateState('0.0.1', runtimeInfo),
          '0.0.2',
          '2026-04-20T09:00:00.000Z',
        ),
      ),
      34.2,
    );

    expect(shouldBroadcastDownloadProgress(state, 35)).toBe(false);
    expect(shouldBroadcastDownloadProgress(state, 40)).toBe(true);
    expect(shouldBroadcastDownloadProgress(state, 100)).toBe(true);
  });
});
