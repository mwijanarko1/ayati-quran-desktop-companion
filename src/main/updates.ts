export type DesktopUpdateStatus =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export type DesktopRuntimeArch = 'arm64' | 'x64' | 'other';

export interface DesktopRuntimeInfo {
  hostArch: DesktopRuntimeArch;
  appArch: DesktopRuntimeArch;
  runningUnderArm64Translation: boolean;
}

export interface DesktopUpdateState {
  enabled: boolean;
  status: DesktopUpdateStatus;
  currentVersion: string;
  hostArch: DesktopRuntimeArch;
  appArch: DesktopRuntimeArch;
  runningUnderArm64Translation: boolean;
  availableVersion: string | null;
  downloadedVersion: string | null;
  downloadPercent: number | null;
  checkedAt: string | null;
  message: string | null;
  errorContext: 'check' | 'download' | 'install' | null;
  canRetry: boolean;
}

export interface DesktopUpdateActionResult {
  accepted: boolean;
  completed: boolean;
  state: DesktopUpdateState;
}

export interface DesktopUpdateCheckResult {
  checked: boolean;
  state: DesktopUpdateState;
}

interface ResolveDesktopRuntimeInfoInput {
  platform: NodeJS.Platform;
  processArch: string;
  runningUnderArm64Translation: boolean;
}

interface AutoUpdateDisabledReasonInput {
  isDevelopment: boolean;
  isPackaged: boolean;
  platform: NodeJS.Platform;
  appImage?: string | undefined;
  hasUpdateFeedConfig: boolean;
}

function normalizeDesktopArch(arch: string): DesktopRuntimeArch {
  if (arch === 'arm64') return 'arm64';
  if (arch === 'x64') return 'x64';
  return 'other';
}

export function resolveDesktopRuntimeInfo(input: ResolveDesktopRuntimeInfoInput): DesktopRuntimeInfo {
  const appArch = normalizeDesktopArch(input.processArch);

  if (input.platform !== 'darwin') {
    return {
      hostArch: appArch,
      appArch,
      runningUnderArm64Translation: false,
    };
  }

  const hostArch = appArch === 'arm64' || input.runningUnderArm64Translation ? 'arm64' : appArch;

  return {
    hostArch,
    appArch,
    runningUnderArm64Translation: input.runningUnderArm64Translation,
  };
}

export function isArm64HostRunningIntelBuild(runtimeInfo: DesktopRuntimeInfo): boolean {
  return runtimeInfo.hostArch === 'arm64' && runtimeInfo.appArch === 'x64';
}

export function createInitialUpdateState(
  currentVersion: string,
  runtimeInfo: DesktopRuntimeInfo,
): DesktopUpdateState {
  return {
    enabled: false,
    status: 'disabled',
    currentVersion,
    hostArch: runtimeInfo.hostArch,
    appArch: runtimeInfo.appArch,
    runningUnderArm64Translation: runtimeInfo.runningUnderArm64Translation,
    availableVersion: null,
    downloadedVersion: null,
    downloadPercent: null,
    checkedAt: null,
    message: null,
    errorContext: null,
    canRetry: false,
  };
}

export function createConfiguredUpdateState(
  currentVersion: string,
  runtimeInfo: DesktopRuntimeInfo,
  enabled: boolean,
  disabledReason: string | null,
): DesktopUpdateState {
  return {
    ...createInitialUpdateState(currentVersion, runtimeInfo),
    enabled,
    status: enabled ? 'idle' : 'disabled',
    message: disabledReason,
  };
}

export function reduceUpdateStateOnCheckStart(
  state: DesktopUpdateState,
  checkedAt: string,
): DesktopUpdateState {
  return {
    ...state,
    status: 'checking',
    checkedAt,
    message: null,
    downloadPercent: null,
    errorContext: null,
    canRetry: false,
  };
}

export function reduceUpdateStateOnCheckFailure(
  state: DesktopUpdateState,
  message: string,
  checkedAt: string,
): DesktopUpdateState {
  return {
    ...state,
    status: 'error',
    message,
    checkedAt,
    downloadPercent: null,
    errorContext: 'check',
    canRetry: true,
  };
}

export function reduceUpdateStateOnUpdateAvailable(
  state: DesktopUpdateState,
  version: string,
  checkedAt: string,
): DesktopUpdateState {
  return {
    ...state,
    status: 'available',
    availableVersion: version,
    downloadedVersion: null,
    downloadPercent: null,
    checkedAt,
    message: null,
    errorContext: null,
    canRetry: false,
  };
}

export function reduceUpdateStateOnNoUpdate(
  state: DesktopUpdateState,
  checkedAt: string,
): DesktopUpdateState {
  return {
    ...state,
    status: 'up-to-date',
    availableVersion: null,
    downloadedVersion: null,
    downloadPercent: null,
    checkedAt,
    message: null,
    errorContext: null,
    canRetry: false,
  };
}

export function reduceUpdateStateOnDownloadStart(state: DesktopUpdateState): DesktopUpdateState {
  return {
    ...state,
    status: 'downloading',
    downloadPercent: 0,
    message: null,
    errorContext: null,
    canRetry: false,
  };
}

export function reduceUpdateStateOnDownloadFailure(
  state: DesktopUpdateState,
  message: string,
): DesktopUpdateState {
  return {
    ...state,
    status: state.availableVersion ? 'available' : 'error',
    message,
    downloadPercent: null,
    errorContext: 'download',
    canRetry: state.availableVersion !== null,
  };
}

export function reduceUpdateStateOnDownloadProgress(
  state: DesktopUpdateState,
  percent: number,
): DesktopUpdateState {
  return {
    ...state,
    status: 'downloading',
    downloadPercent: percent,
    message: null,
    errorContext: null,
    canRetry: false,
  };
}

export function reduceUpdateStateOnDownloadComplete(
  state: DesktopUpdateState,
  version: string,
): DesktopUpdateState {
  return {
    ...state,
    status: 'downloaded',
    availableVersion: version,
    downloadedVersion: version,
    downloadPercent: 100,
    message: null,
    errorContext: null,
    canRetry: true,
  };
}

export function reduceUpdateStateOnInstallFailure(
  state: DesktopUpdateState,
  message: string,
): DesktopUpdateState {
  return {
    ...state,
    status: 'downloaded',
    message,
    errorContext: 'install',
    canRetry: true,
  };
}

export function shouldBroadcastDownloadProgress(
  currentState: DesktopUpdateState,
  nextPercent: number,
): boolean {
  if (currentState.status !== 'downloading') {
    return true;
  }

  const currentPercent = currentState.downloadPercent;
  if (currentPercent === null) {
    return true;
  }

  const previousStep = Math.floor(currentPercent / 10);
  const nextStep = Math.floor(nextPercent / 10);
  return nextStep !== previousStep || nextPercent === 100;
}

export function getAutoUpdateDisabledReason(args: AutoUpdateDisabledReasonInput): string | null {
  if (!args.hasUpdateFeedConfig) {
    return 'Automatic updates are not available because no update feed is configured.';
  }
  if (args.isDevelopment || !args.isPackaged) {
    return 'Automatic updates are only available in packaged production builds.';
  }
  if (args.platform === 'linux' && !args.appImage) {
    return 'Automatic updates on Linux require running the AppImage build.';
  }
  return null;
}
