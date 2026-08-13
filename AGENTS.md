# AGENTS.md

## Project

Midian is a lightweight, mobile-first Obsidian plugin (id `midian`) inspired by Claudian Plus but built for phones: no subprocesses, direct HTTP APIs (Anthropic native + OpenAI-compatible), streaming output, sessions/memory/tools all stored in the vault. The plugin must keep working on Obsidian mobile (Capacitor WebView): no `child_process`, no home directory access, no Node-only APIs.

## Commands

```bash
npm run dev         # watch build; set OBSIDIAN_VAULT to auto-copy into the vault
npm run typecheck   # tsc --noEmit
npm test            # node --test --test-isolation=none tests/*.test.mts (Node >= 24 native TS)
npm run build       # production build
```

The default full check is:

```bash
npm run typecheck && npm test && npm run build
```

Tests mirror pure logic only. Anything importing `obsidian` cannot run under node; keep such logic thin and push the pure parts into `src/utils/` with mirrored tests in `tests/`.

## Architecture

| Area | Responsibility |
| --- | --- |
| `src/network/` | HTTP layer: `fetch` streaming + `requestUrl` non-streaming fallback, SSE parser (pure) |
| `src/providers/` | Dual protocol: Anthropic Messages API and OpenAI-compatible chat completions, both with streaming tool-call loops and non-streaming fallbacks |
| `src/tools/` | Vault tool specs and executor. All writes require per-call approval in the UI; `ask_user` is intercepted by the UI, never executed by the dispatcher |
| `src/context/` | System prompt assembly: persona, memory, @note chips, active note/selection, budget truncation |
| `src/memory/` | Memory engine: extract → short-term log → consolidate → user profile, injected into later chats |
| `src/sessions/` | Session CRUD in `.midian/sessions/*.json` |
| `src/settings/` | Settings model, tab, connection test |
| `src/i18n/` | zh/en dictionaries with fallback chain |
| `src/ui/` | ChatView (single view: header, messages, composer, chips, slash menu), renderers, modals, tool cards |
| `src/utils/` | Pure, unit-tested helpers (SSE-adjacent parsing, frontmatter, budget, base64, paths, export markdown) |

## Hard Rules

- **Mobile parity**: every feature must work on mobile. Prefer `requestUrl` over `fetch` when CORS is uncertain; `fetch` streaming with `requestUrl` fallback is the established pattern.
- **No new runtime dependencies.** The bundle must stay small (~73KB minified as of v0.6.0).
- **Vault-scoped writes**: paths must pass `resolveSafePath` (`src/utils/vaultPath.ts`) before any adapter write.
- **User data is sacred**: session/memory files must never be clobbered; merge instead of overwrite (see `update_properties`).
- Comments, identifiers, commit messages in English; user-visible strings must go through `t()` in both `zh.ts` and `en.ts`.
- Keep comments sparse; explain invariants, not obvious code.
- Provider behavior is protocol-specific: Anthropic uses `tool_use`/`tool_result` blocks, OpenAI-compatible uses `tool_calls`/`role: tool` messages. Do not assume parity; check both files when touching tools.
- Best-effort features (memory extraction, auto-title) must never break the chat: wrap in try/catch and run in the background.
