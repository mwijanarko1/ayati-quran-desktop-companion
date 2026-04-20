export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowSize {
  width: number;
  height: number;
}

export interface WindowPosition {
  x: number;
  y: number;
}

interface WindowPositionNearAnchorOptions {
  anchor: WindowBounds;
  windowSize: WindowSize;
  workArea: WindowBounds;
  verticalGap: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export function getWindowPositionNearAnchor({
  anchor,
  windowSize,
  workArea,
  verticalGap,
}: WindowPositionNearAnchorOptions): WindowPosition {
  const maxX = Math.max(workArea.x, workArea.x + workArea.width - windowSize.width);
  const maxY = Math.max(workArea.y, workArea.y + workArea.height - windowSize.height);
  const x = anchor.x + (anchor.width - windowSize.width) / 2;
  const y = anchor.y - windowSize.height + verticalGap;

  return {
    x: Math.round(clamp(x, workArea.x, maxX)),
    y: Math.round(clamp(y, workArea.y, maxY)),
  };
}
