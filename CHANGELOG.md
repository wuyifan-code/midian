# Changelog

## [0.7.11] - 2026-08-13

### Fixed

- **Concurrent session writes no longer clobber user edits.** A background auto-title save could land after an edit/rewind and restore deleted messages. SessionStore now serializes writes per session (FIFO queue, last-invoked wins) and exposes an atomic `mutate()` used by auto-title: it reloads inside the queue and bails out if the conversation changed while generating.

### Added

- Chat flow tests for auto-title (session renamed from the reply) and the memory engine (facts persisted to `.midian/memory/short-term.md`); store tests for write-queue serialization and atomic mutate (90 tests total)

## [0.7.10] - 2026-08-13

### Added

- Slash menu chat flow test (filtering + template insertion; navigator pinned to en so i18n resolution is deterministic in tests)

### Changed

- Touch devices: larger hit targets (header icons 40px, send 44px, action/copy buttons 34px, chip remove 26px)
- Landscape safe-area: composer and message list now respect `safe-area-inset-left/right` for notched phones

## [0.7.9] - 2026-08-13

### Added

- Chat flow test for image attachments: the chip renders, the image reaches the API request as base64 (media type + PNG payload verified) and the session keeps the image path (85 tests total)

## [0.7.8] - 2026-08-13

### Added

- Chat flow regression tests: stopping mid-approval cancels the pending card and completes the turn (locks in the abort-safe fix), `ask_user` interception with the answer sent back to the model, and editing the last user message restores it to the composer and truncates the session (84 tests total)

## [0.7.7] - 2026-08-13

### Added

- Chat flow tests: drive the real ChatView end-to-end without a browser — send a message, stream the reply, approve a tool card mid-flight (real dispatcher reads the vault), verify the tool result reaches the second API request and the session persists; rewind verified (81 tests total)

## [0.7.6] - 2026-08-13

### Added

- Integration tests for the non-streaming `requestUrl` fallback of both providers (streaming rejected -> fallback parses and delivers the response, 78 tests total)
- Community-store red-line scan recorded in `docs/SUBMISSION.md` (no eval / innerHTML / Node APIs / electron in the bundle)

## [0.7.5] - 2026-08-13

### Added

- Provider integration tests: drive the real streaming + tool-call loops of both protocols against a local SSE server, verifying text streaming, tool argument accumulation, tool-result re-sending and error surfacing (76 tests total)

## [0.7.4] - 2026-08-13

### Added

- Bundle smoke test: builds `src/main.ts` with esbuild, loads it through a mocked `obsidian` module and executes `onload()`, proving the plugin initializes in an Obsidian-like runtime (73 tests total)

## [0.7.3] - 2026-08-13

### Added

- Network / CORS failure hint appended to chat errors (zh / en), with guidance on Base URL and the non-streaming fallback

### Fixed

- Session history listing now reads files in parallel, so large histories open quickly on mobile

## [0.7.2] - 2026-08-13

### Added

- Unit tests for session and memory stores (in-memory adapter mock, 70 tests total)
- `docs/SUBMISSION.md`: community plugin store submission checklist and exact PR contents

### Fixed

- `stringifyYamlValue` now quotes strings that would re-parse as booleans, null or numbers (e.g. `"false"`, `"3.5"`), so frontmatter round-trips faithfully
- Session/memory stores no longer import `obsidian` at runtime (pure path util instead), which also makes them testable under node

## [0.7.1] - 2026-08-13

### Added

- Image attachments larger than 5MB are skipped with a notice instead of failing the request
- `docs/MOBILE_TESTING.md`: structured real-device test checklist (Android / iOS)

### Fixed

- Non-streaming assistant messages now render inside the same `.midian-markdown` scope as streamed ones (code-block and image styles apply consistently)

## [0.7.0] - 2026-08-13

### Added

- Production bundle is now minified (~75KB, was ~116KB)
- API keys are hidden behind password fields with a show/hide toggle
- GitHub Actions CI (typecheck + tests + build) and Release workflow (auto-publish GitHub Releases on `v*` tags, BRAT-ready)
- Unit tests for memory transcript helpers and context-budget edge cases (52 total)
- README: BRAT install guide, CORS/streaming fallback notes, CI badge

### Fixed

- Pressing Stop now settles pending tool-approval / ask-user cards instead of leaving the chat hanging
- Multi-turn chats re-attach images from earlier turns to the API payload (vision context preserved)
- `truncateText` no longer splits surrogate pairs (emoji stay intact)

## [0.6.0] - 2026-08-13

### Added

- Dual providers: Claude (Anthropic native) + OpenAI-compatible (Kimi / DeepSeek / MiniMax / GLM / Qwen…)
- SSE streaming with automatic `requestUrl` non-streaming fallback for CORS-restricted endpoints
- Vault tools with per-call approval: `read_note` / `write_note` / `append_note` / `search_notes` / `list_folder` / `get_properties` / `update_properties` / `ask_user`
- Note context chips (`@note`), active note / selection capture, budget truncation
- Image attachments (base64, png / jpg / webp / gif)
- Slash commands (summarize / rewrite / translate / explain / continue / brainstorm)
- Memory engine: extract → short-term log → consolidate → user profile
- Session management: search, fork, rewind, delete, rename, export to note
- Message editing (re-send last user message), auto-title
- Thinking blocks (Anthropic `thinking` / OpenAI-compatible `reasoning_content`)
- i18n (zh / en); mobile-first UI (safe areas, large touch targets, IME-safe Enter)
- Vault-only storage: sessions in `.midian/sessions/`, memory in `.midian/memory/`
