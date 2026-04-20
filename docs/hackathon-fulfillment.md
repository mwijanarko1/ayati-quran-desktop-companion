# Hackathon Fulfillment

Last reviewed: April 20, 2026.

This document maps Ayati - Quran Desktop Companion against the requirements summarized in
[`docs/hackathon-rules.md`](./hackathon-rules.md). It is intended to make the
submission story explicit for judges and for final pre-submission checks.

## Summary

Ayati - Quran Desktop Companion satisfies the core technical requirement by using at least one Quran
Foundation API from each required category:

- Content API: Quran Foundation Content API verse lookup.
- User API: Quran Foundation User API bookmark creation.

The app also includes a clear demo path, local privacy safeguards, fallback
behavior when external services fail, and documentation for setup and API usage.

## Technical Requirements

| Requirement | Status | Implementation |
| --- | --- | --- |
| Use at least one Quran Foundation Content API or Quran MCP | Implemented | Ayati - Quran Desktop Companion calls `GET /content/api/v4/verses/by_key/{verseKey}` in [`src/main/quran-foundation-client.ts`](../src/main/quran-foundation-client.ts) to fetch Arabic ayah text and translation text. The call includes `translations`, `fields=text_uthmani`, `words=false`, and `translation_fields=resource_name`. |
| Use at least one Quran Foundation User API | Implemented | Ayati - Quran Desktop Companion uses the Bookmarks User API. Saving a reflection calls `POST /auth/v1/bookmarks` in [`src/main/quran-foundation-client.ts`](../src/main/quran-foundation-client.ts), sending `key`, `verseNumber`, `type: "ayah"`, and `mushaf`. This satisfies the User API category because Bookmarks is one of the listed User API examples. |
| Authenticate Quran Foundation user API calls | Implemented | Ayati - Quran Desktop Companion starts a Quran Foundation OAuth/OIDC PKCE flow from the main process in [`src/main/main.ts`](../src/main/main.ts), requests OpenID, refresh, and bookmark creation scopes, stores encrypted tokens locally, refreshes tokens when possible, validates the OpenID nonce, and uses the user access token for bookmark sync. |
| Preserve app behavior if Quran Foundation is unavailable | Implemented | Verse content has fallback content, and bookmark sync failure marks the reflection as pending rather than losing the local reflection. See [`src/main/main.ts`](../src/main/main.ts) and [`src/main/ayah-reflection-store.ts`](../src/main/ayah-reflection-store.ts). |

## Content API Details

Ayati - Quran Desktop Companion generates a Quran-focused reflection from the user's current screen:

1. The user captures the screen from the app.
2. The app analyzes the screenshot with the configured vision-capable AI provider.
3. The app ranks candidate ayahs based on the detected context.
4. The app fetches Quran Foundation verse content for the selected ayah.
5. The app displays the Arabic text, translation, verse reference, reflection,
   and explanation for why the ayah was selected.

Relevant implementation:

- [`src/main/main.ts`](../src/main/main.ts): `captureAyahReflection`,
  `fetchVerseContentForReflection`, and `buildAyahReflection`.
- [`src/main/quran-foundation-client.ts`](../src/main/quran-foundation-client.ts):
  `fetchVerseContent`.
- [`src/renderer/screenshot-question/AyahVerseCard.tsx`](../src/renderer/screenshot-question/AyahVerseCard.tsx):
  ayah display UI.

## User API Details

Ayati - Quran Desktop Companion uses one User API from the hackathon list: Bookmarks.

When a signed-in user saves a reflection:

1. The renderer invokes `window.clawster.saveAyahReflection(reflectionId)`.
2. The main process marks the reflection as saved locally.
3. If a Quran Foundation user token is available, the main process calls
   `QuranFoundationClient.createBookmark`.
4. The client sends `POST /auth/v1/bookmarks`.
5. A successful response stores the returned bookmark ID and marks the
   reflection as synced.
6. A failed response keeps the reflection locally and marks it as pending sync.

Relevant implementation:

- [`src/main/main.ts`](../src/main/main.ts): `saveAyahReflectionById` and
  `ayah-save-reflection` IPC handler.
- [`src/main/quran-foundation-client.ts`](../src/main/quran-foundation-client.ts):
  `createBookmark`.
- [`src/main/ayah-reflection-store.ts`](../src/main/ayah-reflection-store.ts):
  `markReflectionSynced` and `markReflectionPendingSync`.
- [`src/renderer/screenshot-question/AyahVerseCard.tsx`](../src/renderer/screenshot-question/AyahVerseCard.tsx):
  save button and sync status labels.

Other User API examples from the rules, such as collections, streak tracking,
reflection posts, activity, and goals, are not required because the rules require
at least one API from the User API category. Ayati - Quran Desktop Companion intentionally uses
Bookmarks as the minimal, product-aligned User API.

## Submission Checklist

| Checklist item | Status | Notes |
| --- | --- | --- |
| Project title | Ready | `Ayati - Quran Desktop Companion`. |
| Team member names | Submission process | Add final team names in the hackathon submission form. |
| Short description | Ready | Electron desktop companion that turns a screenshot into a Quran-focused reflection and saved Quran Foundation bookmark. |
| Detailed explanation of the idea | Ready | Product explanation exists in [`README.md`](../README.md) and [`docs/prd.md`](./prd.md). |
| Live demo or working app link | Pending submission asset | Provide the packaged app, release link, or hosted landing/download link before submission. |
| GitHub repository, if available | Pending submission asset | Provide the repository URL at submission time. |
| 2 to 3 minute demo video | Pending submission asset | Record the demo flow described in [`README.md`](../README.md). |
| API usage description | Ready | [`README.md`](../README.md) documents Content API, User API, and OAuth/OIDC usage. This file provides the expanded fulfillment mapping. |

## Judging Criteria Alignment

| Criterion | Alignment |
| --- | --- |
| Impact on Quran engagement | Ayati - Quran Desktop Companion inserts Quran reflection into everyday computer use by connecting the current screen context to a relevant ayah. It is designed for repeated use after Ramadan through lightweight capture, reflection history, and saved bookmarks. |
| Product quality and UX | The app provides onboarding, provider setup, screen capture, ayah card display, save state, reflection history, and fallback messaging. |
| Technical execution | The app uses Electron, React, TypeScript strict mode, Vitest tests, Quran Foundation OAuth/OIDC, Content API calls, User API bookmark sync, token refresh, local encrypted token storage, and sanitized local reflection history. |
| Innovation and creativity | Ayati - Quran Desktop Companion turns arbitrary desktop context into Quran-centered reflection instead of requiring the user to start from a Quran search query. |
| Effective use of APIs | Quran Foundation APIs are used in the core journey: Content API provides the selected ayah text and translation, and User API bookmarks persist the user's saved ayah in their Quran Foundation account. |

## Practical Submission Notes

| Rule note | Fulfillment |
| --- | --- |
| Clearly show both Content and User API usage | The demo should show an ayah fetched from Quran Foundation and then save it as a Quran Foundation bookmark after sign-in. |
| Make the user journey obvious quickly | Recommended demo path: sign in, capture screen, show ayah card, save bookmark, show synced state, open reflection history. |
| Solve a real retention or engagement problem | The app creates small Quran reflection moments during normal desktop work and lets users save meaningful ayahs for later. |
| Make the concept understandable without a long explanation | Use the short framing: "Ayati - Quran Desktop Companion turns your current screen into a Quran reflection and lets you save the ayah to Quran Foundation." |

## Privacy And Conduct

| Requirement area | Fulfillment |
| --- | --- |
| Avoid confidential or proprietary material in the submission | The submission should include only code and assets intended for public review. Do not include `.env.local`, API keys, credentials, private screenshots, or local user data. |
| Respect third-party IP and licenses | Runtime dependencies are declared in [`package.json`](../package.json). Before submission, confirm any demo music, video, screenshots, fonts, and generated assets are owned by the team or licensed for the submission. |
| Protect user privacy | Ayati - Quran Desktop Companion clears screenshot image data after analysis and stores only text reflection data by default. Local history stores ayah text, translation, reflection copy, screen summary, themes, timestamps, and sync state, not screenshot images. |
| Accurate submission information | Team, repository, demo, API usage, and live app links should be reviewed against this file and [`docs/hackathon-rules.md`](./hackathon-rules.md) before final submission. |

## Verification Evidence

Current automated evidence:

- `src/main/quran-foundation-client.test.ts` covers safe token error mapping,
  successful User API bookmark response parsing, and User API error
  sanitization.
- `src/main/ayah-reflection-store.test.ts` covers text-only reflection history
  and pending bookmark sync behavior.
- Renderer tests cover the ayah card display and save interaction.

Recommended pre-submission checks:

```bash
bun run test
bun run build
```

Recommended manual demo verification:

1. Configure Quran Foundation credentials.
2. Sign in with Quran Foundation.
3. Capture the screen and receive an ayah reflection.
4. Save the reflection.
5. Confirm the UI reports "Saved to Quran Foundation" or a pending sync state
   if the API is unavailable.
