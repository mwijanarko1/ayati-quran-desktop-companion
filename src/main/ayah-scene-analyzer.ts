import type { ClawBotClient } from './clawbot-client';
import type { AyahTheme, ScreenInsight } from './ayah-types';

const VALID_THEMES = new Set<AyahTheme>([
  'stress',
  'focus',
  'gratitude',
  'beauty',
  'patience',
  'risk',
  'excess',
  'conflict',
  'study',
  'planning',
  'work',
  'distraction',
  'unclear',
]);

const ANALYSIS_PROMPT = `Analyze this screenshot for Ayati - Quran Desktop Companion, a Quran-focused reflection companion.

Return only compact JSON with this shape:
{
  "summary": "one privacy-preserving sentence",
  "category": "study",
  "themes": [{"id": "study", "confidence": 0.76}],
  "overallConfidence": 0.0,
  "isSensitive": false
}

Valid theme ids: stress, focus, gratitude, beauty, patience, risk, excess, conflict, study, planning, work, distraction, unclear.

Rules:
- Use one exact theme id per theme object. Do not return a pipe-separated list of theme ids.
- Do not identify people, accounts, private messages, passwords, addresses, or financial details.
- If the screen is private, medical, financial, or hard to interpret, set isSensitive or unclear.
- Keep summary high-level and non-invasive.`;

function clampConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return JSON.parse(trimmed);
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('No JSON object found in screen analysis response.');
  }

  return JSON.parse(match[0]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeThemeId(value: unknown): AyahTheme | null {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (VALID_THEMES.has(normalized as AyahTheme)) {
    return normalized as AyahTheme;
  }

  const validTokens = normalized
    .split(/[,\s/]+/)
    .map((token) => token.trim())
    .filter((token): token is AyahTheme => VALID_THEMES.has(token as AyahTheme));

  return validTokens[0] ?? null;
}

function parseTheme(value: unknown): { id: AyahTheme; confidence: number } | null {
  if (typeof value === 'string') {
    const id = normalizeThemeId(value);
    return id ? { id, confidence: 0.65 } : null;
  }

  if (!isRecord(value)) return null;

  const id = normalizeThemeId(value.id ?? value.theme);
  if (!id) return null;

  return {
    id,
    confidence: typeof value.confidence === 'number' ? clampConfidence(value.confidence) : 0.65,
  };
}

function parseScreenInsight(value: unknown): ScreenInsight | null {
  if (!isRecord(value)) return null;

  const rawThemes = Array.isArray(value.themes) ? value.themes : [];
  const categoryTheme = normalizeThemeId(value.category);
  const hasAnalysisSignal =
    typeof value.summary === 'string' ||
    categoryTheme !== null ||
    rawThemes.length > 0 ||
    typeof value.overallConfidence === 'number' ||
    typeof value.isSensitive === 'boolean';

  if (!hasAnalysisSignal) return null;

  const themes = rawThemes
    .map(parseTheme)
    .filter((theme): theme is { id: AyahTheme; confidence: number } => theme !== null);

  if (!themes.some((theme) => theme.id !== 'unclear') && categoryTheme && categoryTheme !== 'unclear') {
    themes.push({ id: categoryTheme, confidence: 0.65 });
  }

  if (themes.length === 0) {
    themes.push({ id: 'unclear', confidence: 1 });
  }

  const hasActionableTheme = themes.some((theme) => theme.id !== 'unclear');
  const overallConfidence = typeof value.overallConfidence === 'number'
    ? clampConfidence(value.overallConfidence)
    : (hasActionableTheme ? 0.65 : 0);

  return {
    summary: typeof value.summary === 'string' && value.summary.trim()
      ? value.summary.trim().slice(0, 280)
      : 'A screen that needs a brief moment of reflection.',
    category: typeof value.category === 'string' && value.category.trim()
      ? value.category.trim().slice(0, 64)
      : themes[0].id,
    themes,
    overallConfidence,
    isSensitive: value.isSensitive === true,
  };
}

function buildScreenAnalysisError(message: string): Error {
  const trimmed = message.trim();
  if (!trimmed) {
    return new Error('AI provider returned an empty screen-analysis response.');
  }

  return new Error(`AI provider could not analyze the screen: ${trimmed.slice(0, 500)}`);
}

export async function analyzeScreenForAyah(
  clawbot: ClawBotClient | null,
  imageDataUrl: string,
): Promise<ScreenInsight> {
  if (!clawbot?.isConnected()) {
    throw new Error('AI provider is not connected.');
  }

  const response = await clawbot.analyzeScreen(imageDataUrl, ANALYSIS_PROMPT);
  const text = response.text ?? '';

  try {
    const parsed = parseScreenInsight(extractJson(text));
    if (parsed) return parsed;
  } catch {
    throw buildScreenAnalysisError(text);
  }

  throw buildScreenAnalysisError(text);
}
