# Ayati - Quran Desktop Companion

Ayati - Quran Desktop Companion is an Electron desktop companion that turns a screenshot into a Quran-focused reflection. Press the capture shortcut, Ayati - Quran Desktop Companion sends the image to the configured AI provider account, ranks a relevant ayah, retrieves Quran Foundation content, and can save a Quran Foundation bookmark when the user is signed in.

## AI Provider

Ayati - Quran Desktop Companion uses the OpenRouter API by default:

```bash
OPENROUTER_API_KEY=your-openrouter-key
```

The default endpoint is `https://openrouter.ai/api/v1`, and the bundled default model is `google/gemma-4-31b-it:free`.

Settings also includes direct API account presets:

| Provider | Base URL | Default model |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-5.2` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-3-flash-preview` |
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |
| Claude (Anthropic) | `https://api.anthropic.com/v1` | `claude-sonnet-4-20250514` |
| Grok (xAI) | `https://api.x.ai/v1` | `grok-4.20-reasoning` |
| Kimi (Moonshot AI) | `https://api.moonshot.ai/v1` | `kimi-k2.5` |
| GLM (Z.AI) | `https://api.z.ai/api/paas/v4` | `glm-5.1` |

OpenAI-compatible providers append `/chat/completions`; Claude appends `/messages` and uses Anthropic’s `x-api-key` plus `anthropic-version` headers.

## Quran Foundation API Usage

Ayati - Quran Desktop Companion uses the required Quran Foundation API categories:

- **Content API:** `GET {QURAN_API_BASE_URL}/content/api/v4/verses/by_key/{verseKey}` with `translations`, `fields=text_uthmani`, and `translation_fields=resource_name` to fetch Arabic text and translation.
- **Content API:** `GET {QURAN_API_BASE_URL}/content/api/v4/tafsirs/{resourceId}/by_ayah/{verseKey}` for tafsir snippets.
- **Content API:** `GET {QURAN_API_BASE_URL}/content/api/v4/recitations/{recitationId}/by_ayah/{verseKey}` for ayah recitation audio.
- **User API:** `POST {QURAN_API_BASE_URL}/auth/v1/bookmarks` to save an ayah bookmark with `key`, `verseNumber`, `type: "ayah"`, and `mushaf`.
- **User API:** `POST {QURAN_API_BASE_URL}/auth/v1/notes` to save personal reflection notes attached to the selected ayah.
- **User API:** `POST {QURAN_API_BASE_URL}/auth/v1/collections` and `POST /auth/v1/collections/{collectionId}/bookmarks` to create collections and place saved ayahs into them.
- **User API:** `POST {QURAN_API_BASE_URL}/auth/v1/activity-days` plus `GET /auth/v1/streaks/current-streak-days?type=QURAN` to record Quran activity and display the current streak.
- **OAuth2/OIDC:** `GET {QURAN_AUTH_BASE_URL}/oauth2/auth` and `POST {QURAN_AUTH_BASE_URL}/oauth2/token` using PKCE authorization code flow for user sign-in and refresh.

Configure local demo credentials in `.env.local`:

```bash
QURAN_CLIENT_ID=your-quran-foundation-client-id
QURAN_CLIENT_SECRET=your-quran-foundation-client-secret
QURAN_REDIRECT_URI=ayati://oauth/callback
QURAN_FOUNDATION_ENV=prelive
```

For production, move token exchange to a backend proxy. Desktop apps cannot truly hide client secrets.

## Privacy

Ayati - Quran Desktop Companion does not persist screenshot images by default. Screenshots are captured for analysis, cleared after the reflection is built, and local history stores only text summaries, ayah content, themes, timestamps, notes, collection IDs, feedback, and sync state. Quran translations and tafsir returned by Quran Foundation are displayed as returned and are not re-translated.

## Demo Script

1. Open Settings and choose an AI provider account.
2. Sign in with Quran Foundation.
3. Press `Cmd+Shift+/` or choose **Reflect on Screen**.
4. Show the ayah card with Arabic text, translation, reference, reflection, and why it was selected.
5. Expand tafsir, then play recitation for the returned ayah.
6. Save the bookmark and confirm synced or pending status.
7. Add a personal note and save the ayah into a Quran Foundation collection.
8. Mark the ayah relevant, then use **Show Another Ayah** to demonstrate alternate ranked candidates.
9. Open the **Reflections** tab to show filters, the day recap, streak state, and saved collection/note metadata.
10. Copy the branded share card.

## Development

```bash
bun install
bun run test
bun run build
```

Runtime code lives under `src/`:

- `src/main/main.ts` - Electron app bootstrap, windows, IPC, screenshot capture, and Ayati - Quran Desktop Companion orchestration.
- `src/main/clawbot-client.ts` - AI provider client used for chat, streaming, and screenshot analysis.
- `src/shared/ai-providers.ts` - provider catalog, default endpoints, default models, and protocol metadata.
- `src/main/quran-foundation-client.ts` - Quran Foundation OAuth, content, and bookmark API client.
- `src/main/ayah-*.ts` - ayah ranking, fallbacks, reflection history, and screen-scene analysis.
- `src/renderer/assistant/` - assistant panel with chat, reflections, and settings.
- `src/renderer/screenshot-question/` - floating screenshot reflection surface.
- `src/renderer/onboarding/` - first-launch setup.

## License

This project is licensed under a modified MIT License. It requires any website or application using this software in production to include a visible backlink to [mikhailwijanarko.xyz](https://mikhailwijanarko.xyz) on its landing page.

See the [LICENSE](LICENSE) file for the full text.
