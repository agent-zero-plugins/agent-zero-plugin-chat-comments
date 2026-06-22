# Behaviour & UI Specification — `agent-zero-plugin-chat-comments`

**Type:** Reverse-engineered, after-the-fact specification (derived from source at commit on `main`, depth-1 clone).
**Plugin id:** `chat_comments` · **Version:** `0.1.0` · **Title:** "Chat Comments"
**Conformance keywords:** MUST / SHOULD / MAY per RFC 2119. Each statement is traced to its source file. "Observed" = behaviour the code provably exhibits; "Latent" = a code path present but not reachable from current UI; "Gap" = a defect/ambiguity surfaced by self-review.

---

## 0. Scope & Classification

A **pure WebUI plugin** with one thin stateless API handler. It lets a user select text inside a rendered chat message, attach a Google-Docs-style comment to that selection (highlighted inline), manage all comments from a top-bar modal, and emit every comment into the prompt box as a single numbered instruction. Comments persist **per-chat** on `AgentContext.data["chat_comments"]`.

- **No agent-side code** (no tools, no Python extensions, no `hooks.py`, no prompts, no skills).
- **No settings** — `plugin.yaml: settings_sections: []`, `per_project_config: false`, `per_agent_config: false`; `default_config.yaml` intentionally empty; `meta.yaml: env: []`. Confirmed: there is **no `config.html`** and **no per-project config-panel open path**. (Self-review note: the orchestration prompt's "config-panel / project-creation" context does **not** apply to this plugin — explicitly recorded as out of scope in §6.)
- **No secrets**, no network egress beyond the same-origin A0 API.

---

## 1. Extension Points & A0 Surfaces Consumed (upstream-vs-fork)

All seams below are **stock upstream Agent Zero** — verified present in live `/a0`. **No `@extensible` fork seam is required**; the plugin runs on an unmodified A0.

| # | Surface | Live A0 location (verified) | Used for | Upstream/Fork |
|---|---|---|---|---|
| S-1 | `<x-extension id="chat-top-end">` injection point | `webui/components/chat/top-section/chat-top.html:26` | Mounts the top-bar button (UI-1) | Upstream |
| S-2 | `x-create` Alpine directive | `webui/js/initFw.js:32` | One-shot `bootstrap()` on button create | Upstream |
| S-3 | `createStore(name, model)` | `webui/js/AlpineStore.js:12` | Registers `$store.chatComments` | Upstream |
| S-4 | `callJsonApi(endpoint, data)` | `webui/js/api.js:8` | Load/save comments (carries A0 creds) | Upstream |
| S-5 | `openModal` / `closeModal(path?)` | `webui/js/modals.js:215,333,484-485` | Comments-manager modal lifecycle | Upstream |
| S-6 | `chatsStore.getSelectedChatId()` | `webui/components/sidebar/chats/chats-store.js:24` | Resolve current context id | Upstream |
| S-7 | `chatInputStore.message` + `adjustTextareaHeight()` | `webui/components/chat/input/input-store.js:10,86` | Inject text into prompt box | Upstream |
| S-8 | `toastFrontendSuccess` / `toastFrontendError` | `webui/components/notifications/notification-store.js:853-862` | User-facing toasts | Upstream |
| S-9 | Message DOM id `message-<id>` | `webui/js/messages.js:233` | Anchor target containers | Upstream |
| S-10 | `#chat-input` textarea, `#chat-history` container | `webui/components/chat/input/chat-bar-input.html:41`, `webui/index.html:103` | Prompt injection + mutation observer root | Upstream |
| S-11 | `AgentContext.get(id)` + `context.data` + `save_tmp_chat` | `agent.py` (`self.data`), `helpers/persist_chat.py:32`; `_serialize_context` includes non-`_` `data` keys | Per-chat persistence | Upstream |

> Self-review (traceability): every store import resolves to a real upstream module; the API imports resolve to upstream `helpers.api` / `helpers.persist_chat`. No dangling seam. The plugin is the same persistence pattern used by `chat_rename` (S-11).

---

## 2. Behaviours (BEH-n)

### Bootstrap & lifecycle

- **BEH-1 — One-shot bootstrap.** When the top-bar button (UI-1) is first created, A0's `x-create` (S-2) fires `bootstrap()` exactly once (guarded by `_bootstrapped`). Bootstrap MUST: (a) register a document-level `contextmenu` listener, (b) register a document-level `click` listener, (c) create a `MutationObserver` watching `#chat-history` (fallback `document.body`) `{childList, subtree}`, and (d) load comments for the current context.
  *Source: `chat-comments-store.js` `bootstrap()`, `connectObserver()`.*

- **BEH-2 — Load on bootstrap.** On bootstrap the store resolves context id via `getSelectedChatId()` (fallback `globalThis.getContext()`), POSTs `{action:"load", context}` to `/plugins/chat_comments/comments`, and stores `res.comments` (coerced to `[]` if not an array). On any error, comments become `[]` (silent — no toast). Then a re-anchor is scheduled.
  *Source: `loadForCurrentContext()`.*

- **BEH-3 — Context-switch detection / lazy reload.** Re-anchoring is scheduled via `requestAnimationFrame` (coalesced by `_reanchorScheduled`). Inside the frame, if the live context id differs from the loaded `contextId`, the store **reloads** for the new context instead of re-anchoring. This is the only mechanism that swaps comment sets when the user changes chats; it is driven by DOM mutations (BEH-4), **not** by an explicit chat-selection event.
  *Source: `scheduleReanchor()`. Gap G-1 (see §7): switching to a chat that produces **no** DOM mutation will not trigger a reload until the next mutation.*

- **BEH-4 — Auto re-anchor on chat DOM change.** Any mutation under `#chat-history` schedules a re-anchor (BEH-7). The observer is disconnected during the plugin's own highlight writes and reconnected after, to avoid an infinite mutation loop.
  *Source: `MutationObserver` callback → `scheduleReanchor()`; `reanchorAll()` disconnect/reconnect.*

### Selection context menu

- **BEH-5 — Custom right-click menu over message text.** On `contextmenu`, if there is a non-collapsed, non-whitespace selection **and** `range.startContainer` resolves to a `message-<id>` container, the plugin MUST call `preventDefault()` (suppressing the native menu), snapshot the range/text/container, and show its menu (UI-2) at the cursor, clamped within the viewport. Otherwise the plugin hides its menu and lets the **native** context menu show.
  *Source: `onContextMenu()`, `getMessageContainer()`, `showMenu()`.*

- **BEH-6 — Menu actions.** UI-2 offers exactly three actions:
  - **Comment** → opens the inline editor (UI-3) to attach a comment to the selection (BEH-8).
  - **Copy text** → `navigator.clipboard.writeText(selection)`; success/failure toast (S-8).
  - **Send to prompt** → appends the selection, Markdown-blockquoted (`> ` per line), to the prompt box (BEH-13, append mode).
  *Source: `showMenu()` items, `copySelection()`, `sendSelectionToPrompt()`, `quoteText()`.*

### Comment creation, anchoring, persistence

- **BEH-7 — Inline highlight rendering (re-anchor).** `reanchorAll()` clears all existing `.cc-highlight` marks, then for each comment with a `message_id`: finds `#message-<id>`, computes the `occurrence`-th non-overlapping match of `quoted_text` in the container's `textContent`, and wraps that `[start,end)` range in `<mark class="cc-highlight" data-comment-id=…>` (UI-5), splitting safely across text nodes. Comments whose message or text/occurrence cannot be found are **silently skipped** (best-effort; the comment data is retained).
  *Source: `reanchorAll()`, `anchoring.js` `findOccurrenceOffsets`/`wrapOffsets`/`clearHighlights`.*

- **BEH-8 — Create anchored comment.** From the editor (UI-3): the note is trimmed and clipped to `MAX_COMMENT_LENGTH` (2000). Empty → no-op. The plugin computes `message_id` (container id minus `message-`), `occurrence` = count of `quoted_text` matches starting strictly before the selection start, builds `{id (uuid), message_id, quoted_text, occurrence, comment, created_at (unix s)}`, pushes it, persists (BEH-11), and re-anchors (→ highlight appears).
  *Source: `startComment()`, `anchoring.js` `rangeStartOffset`/`occurrenceForStart`, `openEditor()`.*

- **BEH-9 — Reject overlapping comment.** If the selected range intersects an existing `.cc-highlight` in the same container, creation is refused with toast "That text already has a comment." (one comment per span).
  *Source: `startComment()` → `rangeIntersectsHighlights()`.*

### View / edit / delete

- **BEH-10 — Highlight click → view popover.** A document click whose target is inside a `.cc-highlight` opens the view popover (UI-6) for that comment id, showing the note plus **Edit** and **Delete**. Click outside the popover closes it; click outside the open context menu closes the menu.
  *Source: `onDocumentClick()`, `openViewPopover()`, `closePopover()`, `hideMenu()`.*
  - **Edit** → reopens the editor (UI-3) prefilled; saving with non-empty trimmed text updates the note and persists; an **empty edit is a no-op** (delete is the explicit removal path). *Source: `editComment()`.*
  - **Delete** → removes the comment by id, persists, re-anchors (highlight disappears). *Source: `deleteComment()`.*

### Persistence

- **BEH-11 — Save round-trip.** `persist()` POSTs `{action:"save", context, comments}`. The API (`Comments.process`) requires a non-empty `context` (else 400) that resolves via `AgentContext.get` (else 404); requires `comments` to be a list (else 400); then **sanitises** each item: drops non-dicts, trims+clips `comment` to 2000, **drops items with empty comment**, coerces `occurrence`/`created_at` to int, stringifies `id`/`message_id`/`quoted_text`. It writes `context.data["chat_comments"]` and calls `save_tmp_chat`, returning `{ok, context, count}`. On client-side failure an error toast fires; on success there is **no** toast for inline/modal saves.
  *Source: `api/comments.py`, `persist()`. S-11 verified: non-`_` `data` keys are serialised into the chat JSON, so comments survive reload/restart.*

- **BEH-12 — General (untethered) comment.** From the modal (UI-4) the user adds a comment with `message_id:""`, `quoted_text:""`, `occurrence:0`. It renders no highlight, is tagged "General", and is included in send-all. Trigger: **Add** button or **Ctrl/Cmd+Enter** in the textarea; empty draft → no-op; Add is `:disabled` while the draft is blank.
  *Source: `addGeneralComment()`, `comments-modal.html`.*

### Prompt-box emission

- **BEH-13 — Insert into prompt.** `insertIntoPrompt(text, mode)` writes to `#chat-input`, mirrors `chatInputStore.message`, dispatches a bubbling `input` event, calls `adjustTextareaHeight()`, focuses, and moves the caret to end. `mode:"append"` joins to existing content with a blank line; `mode:"replace"` overwrites. Selection→prompt and selection-menu use **append**; send-all uses **replace**.
  *Source: `insertIntoPrompt()` (S-7, S-10).*

- **BEH-14 — Send all comments to prompt.** With ≥1 comment, builds a single numbered instruction headed *"I've left comments on this conversation. Please address each:"*; anchored items render `Referenced text:` (blockquoted) + `Comment:`, general items render `General comment:`; inserts in **replace** mode, **closes the modal**, and toasts "N comment(s) sent to prompt." With 0 comments it only toasts "No comments to send yet." (no insertion). Footer "Send to prompt" is `:disabled` at 0 comments.
  *Source: `sendAllToPrompt()`, `comments-modal.html` footer. Self-review consistency: send-all does **not** persist — it only reads existing state, which is already persisted at creation time.*

---

## 3. Injected UI Components (UI-n)

- **UI-1 — Top-bar comments button.** Injected at `chat-top-end` (S-1). Selector `.cc-toolbar-btn` (a `<button>` rendered by `x-if="$store.chatComments"`). Shows a Material `comment` glyph; `title`/`aria-label` reflect count; click → `openCommentsModal()`. Carries the `x-create` bootstrap hook (BEH-1).
  *Source: `extensions/webui/chat-top-end/chat-comments-mount.html`.*

- **UI-1a — Count badge.** Selector `.cc-badge` inside UI-1; `x-show` on `comments.length`, `x-text` the number.

- **UI-2 — Context menu.** Selector `.cc-menu`, `position:fixed`, `z-index:100000`, viewport-clamped. Children `.cc-menu-item` × 3 (Comment / Copy text / Send to prompt). Dynamically created in JS (not Alpine).
  *Source: `showMenu()` + mount stylesheet.*

- **UI-3 — Inline editor.** Selector `.cc-editor` with `.cc-editor-input` textarea + Save (`.cc-btn-primary`) / Cancel (`.cc-btn`). Anchored under the selection/highlight, viewport-clamped, autofocused. Used by both create and edit.
  *Source: `openEditor()`.*

- **UI-4 — Comments-manager modal.** Loaded from `/plugins/chat_comments/webui/comments-modal.html` via `openModal` (S-5). Root `.cc-modal-root`. Empty state `.cc-modal-empty` ("No comments yet."). List `.cc-modal-list` of `.cc-modal-item`, each with a quote (`.cc-modal-quote`, whitespace-collapsed + clipped to 90 via `truncate()`) **or** a `.cc-modal-general-tag` "General", the note (`.cc-modal-note`, 2-line clamp), and a delete button `.cc-modal-del` (Material `delete`). Add row `.cc-modal-add`: `.cc-modal-add-input` textarea (`maxlength=2000`) + `.cc-modal-add-btn` (`:disabled` until non-empty). Footer `[data-modal-footer]`: **Close** (`.btn-cancel`) and **Send to prompt** (`.btn-ok`, `:disabled` at 0 comments).
  *Source: `comments-modal.html`.*

- **UI-5 — Inline highlight.** `<mark class="cc-highlight" data-comment-id=…>`; yellow fill + amber underline; pointer cursor; click opens UI-6.
  *Source: `wrapOffsets()` + mount stylesheet.*

- **UI-6 — View popover.** Selector `.cc-popover` with `.cc-popover-text` and Edit/Delete actions. Anchored to the clicked highlight, viewport-clamped.
  *Source: `openViewPopover()`.*

> Self-review (selectors): no `data-testid` on any component (consistent with core A0); tests/automation MUST target class selectors (`.cc-toolbar-btn`, `.cc-modal-root`, `.cc-modal-note`, `.cc-modal-general-tag`, `.cc-badge`) and footer role+text — matching `tests/e2e/behaviour.mjs`.

---

## 4. Configuration Screen

**None.** This plugin has no config UI and no settings of any kind (see §0). The only persisted state is the per-chat comment list (§5). Verification: a config-panel behaviour test would have **nothing to assert**; the e2e suite correctly exercises the feature surface (modal + add-general-comment) instead.

---

## 5. State & Persistence

- **Storage key:** `context.data["chat_comments"]` (`helpers/constants.py: DATA_KEY`). Persisted to the chat's tmp JSON by `save_tmp_chat` (S-11). Scope = **per chat/context**; not per project, not per agent, not global.
- **Comment record schema** (server-canonical, BEH-11): `{ id: str, message_id: str, quoted_text: str, occurrence: int, comment: str (≤2000), created_at: int (unix s) }`.
- **Limits:** `MAX_COMMENT_LENGTH = 2000` enforced client-side (create/edit/general) **and** server-side; modal textarea also `maxlength=2000`.
- **Client cache:** `store.comments` is the working copy; the server's sanitised list is authoritative only on next load. (Self-review G-2: after a save the client does **not** adopt the server's cleaned/clipped result, so a >2000-char create would briefly show untrimmed text client-side until reload — though client also clips at 2000, so divergence is effectively nil.)

---

## 6. Out of Scope (recorded for traceability)

- **Config panel / per-project config / project-creation flow** — not applicable; the plugin ships no config surface (§4). The orchestration prompt's project-scoping context is **not exercised** by this plugin.
- **`@extensible` fork seams** — none required; all surfaces are stock upstream (§1).
- **Agent-side behaviour** — none; comments are inert text until the user clicks Send-to-prompt, which merely fills the prompt box (it does not auto-submit).

---

## 7. Edge Cases, Config-Dependent Behaviour & Self-Review Gaps

- **EC-1 — Selection outside a message:** native context menu is preserved (BEH-5).
- **EC-2 — Overlapping selection:** creation refused (BEH-9); one comment per span.
- **EC-3 — Re-anchor miss:** if `quoted_text`/`occurrence` no longer match (message edited/streamed/re-rendered differently), the highlight silently doesn't render but the comment persists and still appears in the modal and send-all (BEH-7). Best-effort by design.
- **EC-4 — No context id:** load/persist become no-ops client-side; API returns 400 (BEH-2, BEH-11).
- **EC-5 — Clipboard denied:** "Copy failed." toast (BEH-6).
- **EC-6 — Empty comment / empty edit:** no-op (BEH-8, BEH-10, BEH-12); server also drops empty-comment items (BEH-11).
- **EC-7 — `created_at` not surfaced:** stored but never displayed/sorted; comments render in insertion order.

**Self-review gaps (defects/ambiguities found; not blocking, logged for completeness):**

- **G-1 (consistency):** Context-switch reload (BEH-3) is piggy-backed on DOM mutations. A chat switch that yields no `#chat-history` mutation could leave stale comments loaded until the next mutation. Recommendation: also reload on an explicit chat-selected signal.
- **G-2 (verifiability):** Client does not re-adopt the server's sanitised list after save (§5); divergence is bounded only because both sides clip at 2000 and drop empties identically. Recommendation: set `store.comments` from the save response (or reload) to keep client/server strictly equal.
- **G-3 (robustness):** `wrapOffsets` uses `range.surroundContents`, which throws if a highlight boundary would split a non-text element; current callers operate within single text-node sub-ranges so this is not hit, but a future multi-element anchor could throw inside `reanchorAll` (caught and logged, not user-visible).
- **G-4 (ambiguity, cosmetic):** `pyproject.toml` still carries template identity (`name = "agent-zero-plugin-my-plugin"`), and `test_smoke.py` references "my_plugin"; harmless (not shipped in the OCI artifact) but a traceability smell. The shipped manifests (`plugin.yaml`/`meta.yaml`) are correct and version-aligned at `0.1.0`.

**IEEE-29148 self-review verdict:** Complete (every file's user-facing effect is captured), Unambiguous (RFC 2119 keywords; selectors/keys pinned to source lines), Consistent (no contradictory statements; send-all read-only vs creation write-through reconciled), Verifiable (each BEH/UI maps to a concrete selector or API contract; e2e suite covers UI-1/UI-4/BEH-12/BEH-14 gateway), Traceable (BEH-n ↔ UI-n ↔ S-n ↔ source).

**Clone location (read-only):** `/tmp/fan-chat-comments` · **Plugin source root:** `/tmp/fan-chat-comments/usr/plugins/chat_comments/` · **Live A0 seams verified under:** `/a0/webui/`, `/a0/helpers/persist_chat.py`, `/a0/agent.py`.