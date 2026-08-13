# Changelog

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
