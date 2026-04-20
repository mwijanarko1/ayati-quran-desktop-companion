# Ayati - Quran Desktop Companion Hackathon Implementation Plan

## Summary

Modify the legacy Electron desktop companion into **Ayati - Quran Desktop Companion**, a Quran-focused screen companion for the Quran Foundation Hackathon. The MVP will reuse the strongest existing pieces: always-on-top pet window, global hotkey, macOS screenshot capture, Electron IPC, assistant panel, and local OpenClaw vision analysis. The new product layer will add Quran Foundation OAuth, Content API verse retrieval, User API bookmarking, a deterministic theme-to-ayah ranking engine, compact verse cards, local reflection history, and privacy-first screenshot handling.

The chosen API scope is **Real OAuth MVP**: implement Quran Foundation Content API usage plus Quran Foundation OAuth/User API bookmarking so eligibility is satisfied directly.

## Grounded Repo Facts

- App lives in nested git repo: [`ayati`](/Users/mikhail/Desktop/Ayati - Quran Desktop Companion/ayati)
- PRD lives at [`docs/prd.md`](/Users/mikhail/Desktop/Ayati - Quran Desktop Companion/docs/prd.md)
- No codebase map exists yet, so implementation must start by creating [`docs/CODEBASE_MAP.md`](/Users/mikhail/Desktop/Ayati - Quran Desktop Companion/docs/CODEBASE_MAP.md)
- Current stack: Electron 28, React 18, Vite 5, TypeScript strict mode, Tailwind 3, `electron-store`, `@iconify/react`
- There is no existing test harness
- Existing reusable seams:
  - Screenshot capture: [`main.ts`](/Users/mikhail/Desktop/Ayati - Quran Desktop Companion/ayati/src/main/main.ts)
  - IPC bridge: [`preload.ts`](/Users/mikhail/Desktop/Ayati - Quran Desktop Companion/ayati/src/main/preload.ts)
  - Persistent store: [`store.ts`](/Users/mikhail/Desktop/Ayati - Quran Desktop Companion/ayati/src/main/store.ts)
  - Assistant panel: [`Assistant.tsx`](/Users/mikhail/Desktop/Ayati - Quran Desktop Companion/ayati/src/renderer/assistant/Assistant.tsx)
  - Screenshot flow: [`ScreenshotQuestion.tsx`](/Users/mikhail/Desktop/Ayati - Quran Desktop Companion/ayati/src/renderer/screenshot-question/ScreenshotQuestion.tsx)

## Hackathon Constraints

The live hackathon page says projects must use at least one Quran Foundation **Content API** or Quran MCP and at least one **User API**. It also scores projects on impact, UX, technical execution, innovation, and API use. The live page fetched during planning shows the deadline as **May 20, 2026**.

The implementation will satisfy this by using:

- Content API: fetch Arabic verse text, translation, chapter/ayah metadata, and optionally tafsir snippet for selected `verseKey`
- User API: create/list Quran Foundation user bookmarks and optionally collections
- OAuth2/OIDC: authorize the user and refresh user tokens
- OpenClaw: keep local screenshot scene understanding, because Quran Foundation APIs provide Quran content/user data, not screen vision

Sources:
- Hackathon requirements and judging: https://launch.provisioncapital.com/quran-hackathon
- Quran Foundation API portal: https://api-docs.quran.foundation/
- Content API docs: https://api-docs.quran.foundation/docs/content_apis_versioned/content-apis/
- User API docs: https://api-docs.quran.foundation/docs/user_related_apis_versioned/user-related-apis/
- OAuth2 docs: https://api-docs.quran.foundation/docs/oauth2_apis_versioned/oauth-2-apis
- JS SDK reference, for endpoint behavior and examples: https://api-docs.quran.foundation/docs/sdk/javascript

## MVP User Flow

1. User launches Ayati - Quran Desktop Companion and sees the small always-on-top companion.
2. User signs in to Quran Foundation from Settings.
3. User presses the existing capture shortcut, repurposed as “Reflect on screen.”
4. App captures the screen once, shows capture state, and deletes the image after analysis.
5. OpenClaw returns structured screen insight: summary, category, themes, confidence, sensitivity.
6. Theme engine ranks curated ayah candidates and chooses one strong match.
7. Quran Foundation Content API retrieves verified verse text, translation, and metadata.
8. Companion displays a compact verse card: Arabic, translation, reference, reflection, and “Why this verse.”
9. User saves the reflection.
10. App calls Quran Foundation User API bookmark endpoint and stores local history with `quranBookmarkId`.
11. User can reopen recent reflections in the assistant panel.

## Explicit MVP Scope

Build:

- Rebrand user-facing UI to Ayati - Quran Desktop Companion
- Quran Foundation OAuth sign-in
- Quran Foundation Content API client
- Quran Foundation User API bookmark client
- One-click screenshot-to-ayah pipeline
- Theme taxonomy and deterministic ranking
- Verse card UI
- Bookmark/save action
- Recent local reflection history
- Preferences for translation, companion position, capture mode, and default save behavior
- Low-confidence fallback verse flow
- Privacy state: no screenshot persistence by default

Defer:

- Audio playback
- Tafsir expansion beyond optional short snippet
- Reflection notes
- Streaks
- relevance feedback
- Alternative verse rotation
- Multi-monitor optimization beyond existing nearest-display positioning
- Ambient dhikr reminders
- Share/export
- Long-form Quran reader

## Architecture

### Main Process

Add these modules under [`src/main`](/Users/mikhail/Desktop/Ayati - Quran Desktop Companion/ayati/src/main):

- `quran-foundation-client.ts`
  - Handles OAuth token exchange, refresh, Content API calls, User API calls
  - Runs only in main process
  - Never exposes client secrets or tokens to renderer
  - Uses `safeStorage` to encrypt stored user refresh/access tokens before writing to `electron-store`

- `ayah-scene-analyzer.ts`
  - Wraps existing `clawbot.analyzeScreen`
  - Sends a strict JSON prompt for screen summary and theme extraction
  - Validates parsed output with local TypeScript guards or Zod if dependency is added for validation
  - Falls back to generic remembrance themes if OpenClaw is disconnected or malformed

- `ayah-theme-engine.ts`
  - Contains controlled taxonomy: `stress`, `focus`, `gratitude`, `beauty`, `patience`, `risk`, `excess`, `conflict`, `study`, `planning`, `work`, `distraction`, `unclear`
  - Maps themes to curated candidate verse keys
  - Scores candidates by theme confidence, recency penalty, user save history, and fallback priority

- `ayah-reflection-store.ts`
  - Stores local reflection history, save state, pending sync queue, and settings
  - Stores text summaries only, never screenshot images by default

- `oauth-callback.ts`
  - Registers custom protocol `ayati://oauth/callback`
  - Provides fallback manual callback paste flow for dev/demo if protocol redirect is not configured in Quran Foundation app settings

### Renderer

Add/modify these surfaces:

- Replace screenshot question UI with `AyahCapturePanel`
  - Capture state
  - Analyzing state
  - Verse card state
  - Error/fallback state
  - Save button state

- Add assistant tab `Reflections`
  - Recent reflections
  - Saved/bookmarked state
  - Search/filter by theme, surah, or keyword
  - Reopen verse card

- Add settings section `Quran Foundation`
  - Sign in/out
  - Auth status
  - Translation preference
  - Default reciter placeholder for post-MVP
  - Default capture behavior
  - Privacy copy: screenshots are temporary unless enabled later

- Keep existing `window.ayati` global name for minimal churn, but add Ayati - Quran Desktop Companion-specific methods.

## Public Interfaces And Types

Update [`preload.ts`](/Users/mikhail/Desktop/Ayati - Quran Desktop Companion/ayati/src/main/preload.ts) and [`vite-env.d.ts`](/Users/mikhail/Desktop/Ayati - Quran Desktop Companion/ayati/src/renderer/vite-env.d.ts) with:

```ts
type AyahTheme =
  | 'stress'
  | 'focus'
  | 'gratitude'
  | 'beauty'
  | 'patience'
  | 'risk'
  | 'excess'
  | 'conflict'
  | 'study'
  | 'planning'
  | 'work'
  | 'distraction'
  | 'unclear';

interface ScreenInsight {
  summary: string;
  category: string;
  themes: Array<{ id: AyahTheme; confidence: number }>;
  overallConfidence: number;
  isSensitive: boolean;
  fallbackReason?: string;
}

interface AyahReflection {
  id: string;
  verseKey: string;
  surahName: string;
  ayahNumber: number;
  arabicText: string;
  translation: string;
  translatorId: number;
  reflection: string;
  whyThisVerse: string;
  screenSummary: string;
  themes: Array<{ id: AyahTheme; confidence: number }>;
  createdAt: number;
  savedAt?: number;
  quranBookmarkId?: string;
  syncState: 'local' | 'synced' | 'pending' | 'failed';
}

interface QuranAuthStatus {
  isConnected: boolean;
  userName?: string;
  scopes: string[];
  expiresAt?: number;
  error?: string;
}
```

Add `window.ayati` methods:

```ts
startQuranOAuth(): Promise<{ authorizeUrl: string }>;
completeQuranOAuthCallback(callbackUrl: string): Promise<QuranAuthStatus>;
getQuranAuthStatus(): Promise<QuranAuthStatus>;
disconnectQuranAccount(): Promise<boolean>;

captureAyahReflection(): Promise<AyahReflection>;
saveAyahReflection(reflectionId: string): Promise<AyahReflection>;
getAyahReflectionHistory(): Promise<AyahReflection[]>;
deleteAyahReflection(reflectionId: string): Promise<boolean>;

getAyahLensSettings(): Promise<AyahLensSettings>;
updateAyahLensSetting(key: string, value: unknown): Promise<AyahLensSettings>;
```

Update [`store.ts`](/Users/mikhail/Desktop/Ayati - Quran Desktop Companion/ayati/src/main/store.ts):

```ts
ayahLens: {
  quranAuth: {
    encryptedAccessToken: string | null;
    encryptedRefreshToken: string | null;
    expiresAt: number | null;
    scopes: string[];
  };
  preferences: {
    translationId: number;
    mushafId: number;
    captureMode: 'fullScreen';
    saveScreenshots: false;
  };
  reflections: AyahReflection[];
  pendingSync: Array<{ reflectionId: string; action: 'bookmark'; attempts: number }>;
  recentVerseKeys: string[];
}
```

Defaults:

- `translationId`: `20` initially, matching Quran Foundation SDK example usage
- `mushafId`: `4` for UthmaniHafs unless docs/API access requires a different default during implementation
- `captureMode`: `fullScreen`
- `saveScreenshots`: `false`

## API Behavior

### OAuth

- Request scopes: `openid offline_access bookmark bookmark.create`
- Use PKCE authorization code flow for user sign-in
- Use refresh token flow before expiry
- Store token metadata in encrypted `electron-store`
- If refresh fails, mark auth disconnected and keep local history intact

### Content API

- Fetch verse by `verseKey`
- Fetch Arabic script and translation
- Cache successful verse payloads locally by `verseKey + translationId`
- Disable automatic re-translation of returned Quran translations in UI copy and docs

### User API

- On save:
  - If authenticated, call User API to add an ayah bookmark with `key`, `verseNumber`, `type: 'ayah'`, `mushaf`
  - Store returned bookmark id if available
  - If API fails, mark `syncState: 'pending'` and retry from settings/history
- If unauthenticated:
  - Allow local save, but show “Sign in to sync with Quran Foundation”

## Implementation Phases

### Phase 0: Codebase Map And Branch

- Create [`docs/CODEBASE_MAP.md`](/Users/mikhail/Desktop/Ayati - Quran Desktop Companion/docs/CODEBASE_MAP.md)
- Record main/renderer/shared entrypoints and Ayati - Quran Desktop Companion implementation areas
- Work in nested repo [`ayati`](/Users/mikhail/Desktop/Ayati - Quran Desktop Companion/ayati)
- Create branch `feature/ayahlens-hackathon`

### Phase 1: Test Harness First

Add Vitest-based harness because the Vite/React app currently has no tests.

Package changes:

- Add exact dev dependencies: `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `msw`
- Add scripts:
  - `test`
  - `test:watch`
  - `test:coverage`

Initial RED tests:

- Theme engine selects stress/patience verse candidate for stress insight
- Theme engine uses fallback for unclear/low confidence insight
- Reflection store does not persist screenshot image
- Quran client maps token/auth errors into safe app errors
- Save flow marks pending when User API fails
- Verse card renders Arabic, translation, reference, why line, and save action

Record TDD evidence:

```bash
python3 ~/.agents/scripts/tdd_evidence.py record-red --task ayahlens-mvp --test "npm test -- --run"
python3 ~/.agents/scripts/tdd_evidence.py record-green --task ayahlens-mvp --test "npm test -- --run"
```

### Phase 2: Domain Layer

Implement pure modules first:

- `ayah-theme-engine.ts`
- `ayah-reflection-store.ts`
- `ayah-types.ts`
- `ayah-fallbacks.ts`

Acceptance:

- Candidate ranking is deterministic
- Recent verse keys are penalized to avoid repetition
- Sensitive or unclear screen insight chooses general remembrance fallback
- No renderer dependency in domain modules

### Phase 3: Quran Foundation Client

Implement main-process API client:

- OAuth authorize URL builder
- PKCE verifier/challenge generation
- Token exchange
- Refresh
- Content verse fetch
- User bookmark creation
- Error normalization
- In-memory token cache plus encrypted persistence

Acceptance:

- Tokens never cross preload boundary
- Renderer only sees `QuranAuthStatus`
- API methods can be tested with MSW or mocked `fetch`
- Failed calls return typed safe errors, not raw stack traces

### Phase 4: Screenshot-To-Reflection Pipeline

Replace generic screenshot question behavior with:

1. `captureScreenWithContext`
2. `analyzeScreenForAyah`
3. `rankAyahCandidates`
4. `fetchVerseContent`
5. `buildReflection`
6. `storeReflection`
7. Return `AyahReflection`

Acceptance:

- Screenshot image is deleted/temp-only after analysis
- Reflection can be produced when OpenClaw is connected
- Fallback reflection can be produced when OpenClaw is disconnected
- Low confidence UI clearly says the screen was hard to interpret

### Phase 5: IPC And Store Integration

Add IPC handlers in [`main.ts`](/Users/mikhail/Desktop/Ayati - Quran Desktop Companion/ayati/src/main/main.ts):

- `quran-auth-status`
- `quran-auth-start`
- `quran-auth-complete`
- `quran-auth-disconnect`
- `ayah-capture-reflection`
- `ayah-save-reflection`
- `ayah-history`
- `ayah-delete-reflection`
- `ayah-settings-get`
- `ayah-settings-update`

Acceptance:

- All renderer inputs are validated
- Arbitrary settings keys cannot write outside allowed Ayati - Quran Desktop Companion settings
- Save retry state survives app restart
- Existing chat IPC remains functional until intentionally hidden/rebranded

### Phase 6: UI Rework

Modify:

- [`ScreenshotQuestion.tsx`](/Users/mikhail/Desktop/Ayati - Quran Desktop Companion/ayati/src/renderer/screenshot-question/ScreenshotQuestion.tsx)
- [`Assistant.tsx`](/Users/mikhail/Desktop/Ayati - Quran Desktop Companion/ayati/src/renderer/assistant/Assistant.tsx)
- related CSS files

UI decisions:

- Product name: `Ayati - Quran Desktop Companion`
- Keep compact companion pattern, but remove chatbot/productivity-first copy
- Use the existing Iconify dependency rather than adding an icon library
- Avoid generic cards-inside-cards; use compact verse surfaces and full-width assistant panels
- Arabic text gets proper `dir="rtl"` and readable font stack
- Buttons have clear labels: `Reflect on Screen`, `Save Bookmark`, `Open History`, `Sign In`

States to implement:

- Permission required
- Capturing
- Analyzing
- Verse loaded
- Low confidence fallback
- Offline/API failure
- Unauthenticated save
- Saved
- Pending sync

### Phase 7: Rebrand And Packaging

Update user-facing product copy:

- `package.json` product name updated to Ayati - Quran Desktop Companion
- macOS permission strings
- window titles
- onboarding copy
- assistant tab labels
- context menu labels
- screenshot prompts
- README hackathon section

Keep internal symbol names like `window.ayati` unless changing them is required for visible output. This limits risk before the hackathon.

### Phase 8: Submission Assets

Add docs for judges:

- `README.md` section: “Hackathon API Usage”
- Document exact Content API endpoints and User API endpoints used
- Include privacy statement: screenshots are transient; only text summaries are saved
- Include demo script:
  - Sign in
  - Capture stressful work/coding screen
  - Show verse match
  - Save bookmark
  - Reopen history
  - Show API usage notes

## Test Cases And Acceptance Scenarios

### Unit Tests

- Theme ranking returns relevant candidate for each primary theme
- Ranking avoids immediate verse repetition
- Low confidence selects fallback verse
- Sensitive screen does not save screenshot or infer invasive details
- Store trims history at configured max
- Pending sync queue increments attempts and preserves failures
- OAuth token expiry triggers refresh path
- Quran API errors map to safe typed errors

### Integration Tests

- `captureAyahReflection` with mocked OpenClaw and Quran API returns complete `AyahReflection`
- `saveAyahReflection` with mocked User API writes `quranBookmarkId`
- `saveAyahReflection` with 401 refreshes token once, then retries
- `saveAyahReflection` with network failure marks `pending`
- Settings updates reject unknown keys

### Renderer Tests

- Verse card renders Arabic RTL text, translation, reference, why line
- Unauthenticated save shows sign-in prompt
- Authenticated save shows saving then saved
- Permission denied state tells user how to enable Screen Recording
- History tab opens a saved reflection
- Loading states do not resize the window unexpectedly

### Manual QA

- `bun run build`
- `bun run test -- --run`
- Launch Electron app only when requested or during implementation verification
- On macOS:
  - Screen Recording denied
  - Screen Recording granted
  - OpenClaw unavailable fallback
  - Quran auth unavailable fallback
  - Successful OAuth/sign-in path
  - Successful bookmark save path

## Security And Privacy Requirements

- Do not expose Quran access tokens, refresh tokens, client secret, or OpenClaw token to renderer
- Do not persist screenshot images by default
- Do not log screenshot base64 or OAuth tokens
- Encrypt stored OAuth tokens with Electron `safeStorage`
- Validate IPC payloads before use
- Use allowlisted settings keys only
- Keep all API traffic in main process
- Add `.env.example` (template) and `.env.local` (gitignored) for Quran client configuration; never commit real credentials
- For production beyond the hackathon, move client secret/token exchange to a backend proxy because desktop apps cannot truly hide secrets

## Rollout Plan

1. Implement MVP behind Ayati - Quran Desktop Companion UI path while preserving enough existing structure to avoid destabilizing Electron windows.
2. Keep local history working even before Quran OAuth is configured.
3. Require Quran OAuth for judged “synced bookmark” demo.
4. Package demo with clear setup instructions for `QURAN_CLIENT_ID`, redirect URI, and local OpenClaw gateway.
5. Prepare a 2–3 minute video using the happy path and one fallback path.

## Explicit Assumptions And Defaults

- Product name is **Ayati - Quran Desktop Companion**.
- The MVP uses real Quran Foundation OAuth/User API integration.
- OpenClaw remains the screen-understanding provider.
- Quran Foundation APIs provide Quran content and user bookmarking, not vision.
- Screenshots are never persisted by default.
- Save action maps to Quran Foundation bookmark creation first; collections are secondary if endpoint access is stable during implementation.
- Existing mascot/window mechanics are reused for speed; visible copy is rebranded.
- Internal `window.ayati` API name remains for implementation safety.
- Add Vitest test harness because no existing test setup is present.
- Use `npm` because the repo has `package-lock.json`.
- Do not add new UI icon dependencies; use existing `@iconify/react`.
