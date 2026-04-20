---
last_mapped: 2026-04-19T00:00:00Z
---

# Codebase Map

## System Overview

Ayati - Quran Desktop Companion is an Electron 28 desktop app with React 18, Vite 5, Tailwind, TypeScript strict mode, and `electron-store` for local persistence. Screen chat and vision analysis go through the configured AI provider account. OpenAI-compatible providers use chat completions; Claude uses the Anthropic Messages API.

The workspace root contains runtime code, package metadata, and hackathon planning/API notes in `docs/`.

## Directory Guide

- `src/main/main.ts` - Electron app bootstrap, window creation, global hotkeys, screen capture, IPC handlers, tray, app lifecycle, and Ayati - Quran Desktop Companion orchestration.
- `src/main/preload.ts` - `window.ayati` bridge exposed to renderer windows.
- `src/main/store.ts` - `electron-store` schema, OpenRouter defaults, and legacy local-provider migration.
- `src/main/clawbot-client.ts` - AI provider client for chat, streaming, and screen analysis calls.
- `src/main/quran-foundation-client.ts` - Quran Foundation OAuth, content, and bookmark API client.
- `src/main/ayah-*.ts` - ayah ranking, fallback content, reflection history, and scene-analysis helpers.
- `src/shared/ai-providers.ts` - provider catalog for OpenRouter, OpenAI, Gemini, DeepSeek, Claude, Grok, Kimi, GLM, and custom OpenAI-compatible accounts.
- `src/renderer/screenshot-question/` - floating screenshot reflection surface.
- `src/renderer/assistant/` - main assistant panel with chat, activity, settings, reflections, and Quran Foundation settings.
- `src/renderer/components/` - shared renderer components such as provider setup, markdown, links, and hotkey input.
- `src/shared/types.ts` - shared TypeScript types that can be imported by main-process modules.
- `docs/prd.md` - product requirements for Ayati - Quran Desktop Companion.
- `ayahlens-hackathon-implementation-plan.md` - active implementation plan and acceptance criteria.

## Key Workflows

- Build: from the repo root run `bun run build`, which executes renderer Vite build then main-process TypeScript compile.
- Tests: Vitest harness with unit and renderer tests (`bun run test`).
- Capture flow: renderer calls `window.ayati.captureScreenWithContext()` or app-specific IPC; main process captures a temporary screenshot and passes image data to the configured AI provider.
- Reflection flow: main process analyzes the screen, ranks candidate ayahs, fetches Quran Foundation content, persists text-only reflection history, and optionally syncs a Quran Foundation bookmark.
- Settings flow: renderer uses allowlisted IPC writes; main process updates `electron-store` and applies runtime effects such as hotkey and AI provider changes.

## Known Risks

- `main.ts` is large and owns many responsibilities, so new Ayati - Quran Desktop Companion orchestration should be placed in focused modules and wired through narrow IPC handlers.
- Desktop OAuth cannot truly protect a client secret. The MVP supports local configuration for hackathon demo, but production should move token exchange to a backend proxy.
- Screenshot privacy depends on keeping screenshots in memory or temp files only; history must store summaries and Quran content, not image data.
- Quran Foundation API endpoint shapes may change, so the client should normalize errors and keep endpoint configuration centralized.
- The existing app has no test harness before this implementation; regression coverage starts with Ayati - Quran Desktop Companion domain, client, and renderer behavior.
