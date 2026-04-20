# Ayati - Quran Desktop Companion Features So Far

Use this as the demo-video checklist. The strongest story is: Ayati - Quran Desktop Companion turns the user's current screen into a Quran reflection, fetches verified Quran Foundation content, and saves the ayah as a Quran Foundation bookmark.

## Best Demo Flow

1. Open Ayati - Quran Desktop Companion and show the always-on-top desktop companion.
2. Open Settings and show the AI provider selector plus Quran Foundation sign-in.
3. Trigger **Reflect on Screen** with `CommandOrControl+Shift+/` or the Reflections button.
4. Show the capture/analyzing state, then the ayah card.
5. Point out the Arabic text, translation, reference, reflection, and "Why this verse" explanation.
6. Click **Save Bookmark** and show the synced, pending, or local save state.
7. Open **Reflections** to show recent text-only history.
8. Switch apps to show contextual Quran nudges if the watch settings are enabled and the context is clear.

## Core User Features

### Always-On-Top Companion

- Small floating Ayati - Quran Desktop Companion character that stays visible while the user works.
- Draggable companion position with saved placement.
- Animated moods, idle behavior, sleep/doze states, camera-snap capture animation, and optional transparency while asleep.
- Companion context menu for chat, settings, workspace, and quit actions.
- Speech bubble with quick replies for nudges and assistant prompts.

### Screenshot-To-Ayah Reflection

- One-click and hotkey-triggered screen reflection.
- macOS native screen capture path with Electron desktop-capturer fallback.
- Screen Recording permission checks with user-facing error states.
- Temporary screenshot handling: screenshots are used for analysis and then cleared from memory.
- Vision analysis through the configured AI provider.
- Privacy-preserving screen summary, category, theme scores, confidence, and sensitive-screen handling.
- Theme taxonomy for stress, focus, gratitude, beauty, patience, risk, excess, conflict, study, planning, work, distraction, and unclear screens.
- Deterministic ayah ranking with recent-verse penalties to reduce repeats.
- Optional AI selection pass that chooses among the top curated candidates without allowing arbitrary verse choices.

### Ayah Card

- Compact card for the selected ayah.
- Arabic ayah text with RTL rendering.
- Translation text from Quran Foundation or the bundled fallback content.
- Surah name, ayah reference, reflection copy, and "Why this verse" explanation.
- Save button with clear states: unsaved, saving, saved locally, pending sync, or saved to Quran Foundation.
- Reflect-again action and `Esc` close behavior in the capture window.

### Quran Foundation Integration

- Quran Foundation OAuth/OIDC sign-in with PKCE.
- Custom callback support through `ayati://oauth/callback`.
- Manual callback paste fallback for demo/dev environments.
- Encrypted local storage for Quran Foundation access and refresh tokens.
- Token refresh before API use when possible.
- Quran Foundation Content API verse lookup by `verseKey`.
- Arabic Uthmani text and configured translation retrieval.
- Translation ID setting, defaulting to `20`.
- Mushaf ID setting, defaulting to `4`.
- Local verse cache by verse key and translation ID.
- Quran Foundation User API bookmark creation when saving a reflection.
- Sign out flow that disconnects Quran Foundation while keeping local reflections.

### Save And Reflection History

- Local reflection history capped at recent entries.
- History stores text only: ayah content, translation, screen summary, themes, timestamps, and sync state.
- No screenshot images are stored in reflection history.
- Save reflections locally even when the user is not signed in.
- Sync saved reflections to Quran Foundation bookmarks when a user token is available.
- Pending sync state when bookmark creation fails.
- Delete reflections from local history.
- Recent verse tracking to avoid showing the same ayah too often.

### Contextual Quran Nudges

- Active-app and window-title watching.
- Rule-based context classifier for study, planning, pressure, work, design, shopping, distraction, and conflict.
- Sensitive app and sensitive-title suppression for passwords, banking, medical, payroll, private messages, and similar contexts.
- Cooldown minutes setting.
- Maximum nudges per day setting.
- Repeat suppression for the same app/theme pair.
- Companion popup with quick replies: **Reflect**, **Save**, and **Not now**.
- Nudge reflections are also added to local reflection history.

## Setup And Control Features

### AI Provider Setup

- OpenRouter is the default provider.
- Provider presets for OpenAI, Google Gemini, DeepSeek, Claude, Grok, Kimi, GLM, and custom OpenAI-compatible APIs.
- Provider-specific base URL, model, and API key settings.
- Claude uses the Anthropic Messages API path and headers.
- OpenAI-compatible providers use chat completions.
- Gateway/provider validation from onboarding and settings.

### Onboarding

- First-run setup flow for Ayati - Quran Desktop Companion.
- AI provider defaults loaded into onboarding.
- Watch settings for active app and window titles.
- Hotkey configuration during setup.
- Launch-on-startup preference.

### Assistant Panel

- Tabs for chat, reflections, activity, and settings.
- **Reflect on Screen** action inside the assistant.
- Recent reflections list with save and delete actions.
- Settings for AI provider, Quran Foundation, contextual nudges, watcher behavior, companion behavior, and keyboard shortcuts.
- Privacy copy in settings explaining that screenshots are deleted after analysis.

### Chat And Screen Context

- Quick chat bar hotkey: `CommandOrControl+Shift+Space`.
- Full assistant hotkey: `CommandOrControl+Shift+A`.
- Chat history persistence and clearing.
- Optional screen context in assistant chat.
- Streaming assistant response support.
- Pet chat bubble can ask the provider for more detail when connected.

### Activity And Watchers

- Active app watching.
- Optional window title sharing.
- Folder watching is still present from the underlying desktop companion.
- Activity tab shows recent app, file, and screen-capture events.

## Privacy And Reliability Talking Points

- Screenshots are transient and are not saved by default.
- Reflection history stores text summaries and Quran content, not image data.
- Quran Foundation tokens are encrypted before local storage when Electron safe storage is available.
- Sensitive or unclear screen contexts fall back to general remembrance instead of guessing details.
- Quran content has bundled fallback verses if the Content API or content token is unavailable.
- Bookmark failures do not lose the reflection; the app keeps it locally and marks it pending.
- API errors are sanitized before display.

## Good Demo Moments

- Show Settings > Quran Foundation and say: "This is a real Quran Foundation OAuth flow, with bookmark sync after sign-in."
- Show Settings > AI Provider and say: "The screenshot understanding can use OpenRouter or direct provider accounts."
- Trigger Reflect on Screen and say: "Ayati - Quran Desktop Companion analyzes the screen, maps it to a spiritual theme, chooses from curated ayah candidates, then fetches Quran Foundation content."
- On the card, point to the translation and say: "This translation is displayed as returned; Ayati - Quran Desktop Companion is not re-translating Quran text."
- Save the ayah and say: "Saving creates a Quran Foundation bookmark when connected, and stays local if not."
- Open Reflections and say: "The history is text-only, so previous reflections are available without storing screenshots."
- Trigger or force a contextual nudge and say: "Ayati - Quran Desktop Companion can gently surface Quran reminders only when the app context is clear and non-sensitive."

## Do Not Promise Yet

These are in the PRD or plan, but they are not complete demo features yet:

- Audio playback.
- Tafsir expansion.
- Personal reflection notes.
- Named bookmark collections.
- Daily streaks and goals.
- Relevance feedback.
- "Show another verse" alternative selection.
- Search/filter inside reflection history.
- Automatic retry worker for pending bookmark sync.
- Advanced multi-monitor capture controls.
- Region capture or active-window-only capture.
