# E2E Test Spec — `agent-zero-plugin-chat-comments`

**Target:** live A0 (disposable fast-loop pod for validation, CI nested-rootless A0 as the gate), plugin installed via the standard `plugin-e2e` lifecycle (install → verify → uninstall). Driver: Playwright (`tests/e2e/`), authenticated through the A0 login the testkit already performs; same-origin `callJsonApi`/`fetchApi` carries A0 creds + CSRF. Harness shape extends the existing `tests/e2e/behaviour.mjs` (class selectors only — core A0 ships no `data-testid`).

**Plugin under test:** `chat_comments` v0.1.0 — pure WebUI plugin + one stateless `load`/`save` API handler (`/plugins/chat_comments/comments`). No settings, no config screen, no agent-side code (verified: `plugin.yaml settings_sections: []`, `per_project_config:false`, `per_agent_config:false`, `default_config.yaml` empty, `meta.yaml env: []`, no `config.html`, no `hooks.py`/`prompts`/`skills`).

**Source root (read-only clone):** `/tmp/fan-chat-comments/usr/plugins/chat_comments/`
**Live seams verified:** `/a0/webui/components/chat/top-section/chat-top.html:26` (`x-extension id="chat-top-end"`), `/a0/webui/components/chat/input/chat-bar-input.html:41` (`#chat-input`), `/a0/webui/index.html:103` (`#chat-history`), `/a0/webui/js/messages.js:209,230-233` (`setMessage` user-path → `#message-<id>` with `.message-text > pre`), `/a0/webui/js/messages.js:602` (`window.getContext()` exposed), `/a0/webui/components/sidebar/chats/chats-store.js:373` (`createStore("chats", …)`, reached via `Alpine.store("chats")`), `/a0/helpers/persist_chat.py:32` (`save_tmp_chat`, non-`_` `data` keys serialised), `/a0/webui/js/api.js` (`callJsonApi` throws on `!ok`; `fetchApi` adds CSRF + returns raw `Response`), `/a0/python/api/api.py:161` (CSRF enforced).

---

## HARD RULES — binding preamble (MUST appear verbatim in the `.feature` / harness header)

> 1. **No silent swallow.** Every scenario is a real, falsifiable assertion. Failures are recorded and turn the group RED — never caught-and-ignored. Each group emits a `[coverage]` tally.
> 2. **No fake green.** A scenario is either genuinely asserted or an explicit `@skip` with a tracked reason (issue link) — never a bare pass for an untested case. Negative assertions must run only after the inspected surface has fully rendered (no absence-before-render). Exact-string assertions use full-string equality, not `toContain` partials, where a formatting regression must be caught.
> 3. **Self-provisioning fixtures, through the UI.** The suite creates whatever app state it needs (e.g. A0 chats/contexts) by driving the REAL UI, not backend/"magic" API calls. The only API touches are read-only probes (`{action:"load"}`) and the deliberate negative-contract pokes.
> 4. **LLM-less & hermetic.** Runtime/persistence-seam behaviours are exercised via a deterministic, stock rendering helper (`setMessage` user-path) and a real persistence round-trip (full `page.reload()` + `{action:"load"}`). No API key, no live MCP pod, no test-only debug routes added to the shipped plugin. A deterministic LLM stub is added only if the plugin truly needs an agent turn (it does not).
> 5. **≤10 grouped specs, one webm video each** (no GIF).
> 6. **Best-effort try/catch reserved** for genuinely un-enableable env only (a real agent turn, OS clipboard) — anything reachable via a seam MUST hard-assert. A try/catch may never mask a *missing* positive assertion.
> 7. **Validated on the local fast loop** (disposable A0) before pushing; CI is the final gate.

### How the hard rules bind THIS plugin (read before the groups)

- **Rule 3 (UI fixtures):** the plugin is per-chat, not per-project. Provisioning a *chat/context* is the real fixture. The suite does it through the UI: load `/`, which A0 auto-creates a default context (id resolvable via `window.getContext()` or `window.Alpine.store("chats").getSelectedChatId()` — **closes C-2**) and — where multi-chat isolation is tested — drives the sidebar "new chat" control. **No `callJsonApi` is used to mint state**; the only allowed direct API touches are the *read-only probe* `{action:"load"}` and the deliberate negative-contract pokes (E2E-19/E2E-20).
- **Rule 4 (LLM-less rendering + persistence round-trip):** the plugin has **no fork seam and no agent turn** (§ Out-of-scope). The two seams needing hermetic exercise are **DOM anchoring** (needs a rendered `#message-<id>` plain-text body *without* an LLM reply) and **persistence** (`context.data["chat_comments"]` → `save_tmp_chat` → chat JSON). Both are made deterministic with **stock A0 only**:
  - **Rendered-message fixture (no LLM, `type:"user"`) — closes C-1:** `page.evaluate` imports `/js/messages.js` and calls `setMessage({ id:"e2e-msg-1", no:1, type:"user", content:"<deterministic text>" })`. The user-path (`drawMessageUser`, messages.js:965) calls `getOrCreateMessageContainer(id,"right",…)` directly, producing `#message-e2e-msg-1` whose `.message-text > pre` holds the literal text as **plain text** — no markdown mangling, no `process-group`/`process-step` chrome, no detail-collapse. (`type:"agent"` routes through `drawProcessStep` and builds `process-step-<id>` step containers with step chrome in `textContent` — it does **not** yield the plain `#message-<id>` body the plugin anchors to via `getElementById("message-"+id)`, and is therefore banned as the fixture.) `setMessage` (messages.js:209) sets `id: id || String(no)`, so **`id` is always passed explicitly.** Every selection/anchor assertion targets `#message-e2e-msg-1 .message-text`. The fast loop verifies `getSelection()` over the substring yields the exact `quoted_text` the plugin stores.
  - **Persistence round-trip (no invented routes) — closes C-3:** persistence is asserted by the plugin's own `{action:"load"}` issued **after a full `page.reload()`**. The `load` handler reads `context.data[DATA_KEY]` (comments.py:22), which is only populated from disk by `save_tmp_chat`, so a post-reload load is a genuine round-trip through persistence, not in-memory state. **No `dump_live` route, no `A0_E2E_DUMP_LIVE`, no `.devkit.yml e2e_pod_env` is added** — adding a debug route to a shipped plugin (it lands in the OCI artifact) is rejected, and the reusable-workflow `e2e_pod_env` support is unverified. The `.devkit.yml` carries only the standard `plugin_dir`:
    ```yaml
    # .devkit.yml (standard fields only)
    plugin_dir: usr/plugins/chat_comments
    ```
- **Rule 6 (try/catch ONLY for un-enableable env):** exactly two surfaces qualify — the **OS clipboard** (`navigator.clipboard` is permission-gated/headless-unreliable: BEH-6 "Copy text") and a **real agent turn** (never invoked). The clipboard *toast* path is hard-asserted: the success path by granting `clipboard-write` via `context.grantPermissions(["clipboard-read","clipboard-write"])`; the OS-denied branch (EC-5 "Copy failed.") by *revoking* permission and hard-asserting the error toast. The only try/catch wraps the bare `writeText` call (whose rejection is browser-version-dependent) — the toast assertion is the gate and the test **fails if neither the success toast nor "Copy failed." appears** (closes m-4).
- **Rule 2 (@skip discipline):** the only `@skip` in this suite is **EC-3 context-switch-with-no-DOM-mutation (G-1)** — a confirmed source gap that cannot be exercised deterministically without flake; tracked. Everything else hard-asserts.
- **Store/context introspection (closes C-2):** all `page.evaluate` store probes use `window.Alpine.store("chatComments")` (e.g. `_bootstrapped`, `_historyObserver`, `comments`, `contextId`, methods) and resolve the context id via `window.getContext()` (the plugin's own fallback) or `window.Alpine.store("chats").getSelectedChatId()`. `window.$store` and `window.chatsStore` are **never used** (they do not exist as `window` globals).
- **API status-code observation (closes C-4):** contract-error assertions (E2E-20) use `window.fetchApi(API_PATH, {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(...)})` — which carries CSRF + same-origin creds and returns the raw `Response` so `res.status` and `await res.text()` are observable. `callJsonApi` is **not** used for status-code assertions because it throws on `!response.ok` and never surfaces the numeric status.
- **Out of scope (asserted as N/A, not tested):** config panel / per-project config / project-creation flow (plugin ships none — §4 of behaviour spec); `@extensible` fork seams (none); agent-side behaviour (none — Send-to-prompt only *fills* the box, never submits, which IS asserted in Group H).

---

## Coverage map (BEH-/UI-/EC- → E2E-)

| Source | Covered by |
|---|---|
| BEH-1 bootstrap one-shot | E2E-1, E2E-2 |
| BEH-2 load on bootstrap | E2E-3 |
| BEH-3 context-switch reload | E2E-4 ; G-1 → E2E-5 `@skip` |
| BEH-4 auto re-anchor on DOM change | E2E-12 |
| BEH-5 custom right-click menu / EC-1 | E2E-6, E2E-7 |
| BEH-6 menu actions (Comment/Copy/Send) / EC-5 | E2E-8, E2E-9, E2E-10 |
| BEH-7 inline highlight render / EC-3 | E2E-11, E2E-12, E2E-25 |
| BEH-8 create anchored comment | E2E-13 |
| BEH-9 reject overlapping / EC-2 | E2E-14 |
| BEH-10 highlight→popover view/edit/delete / EC-6 | E2E-15, E2E-16, E2E-17 |
| BEH-11 save round-trip / EC-4 / sanitise | E2E-18, E2E-19, E2E-20 |
| BEH-12 general comment / EC-6 | E2E-21, E2E-22 |
| BEH-13 insert into prompt (append/replace) | E2E-23 (append + multi-line), E2E-24 (replace via H) |
| BEH-14 send-all | E2E-26, E2E-27, E2E-28 |
| UI-1 top-bar button | E2E-1, E2E-6-prereq |
| UI-1a badge | E2E-22 |
| UI-2 context menu | E2E-7 |
| UI-3 editor | E2E-13, E2E-16 |
| UI-4 modal | E2E-21 |
| UI-5 highlight mark | E2E-11 |
| UI-6 popover | E2E-15 |
| EC-4 no-context | E2E-20 |
| EC-7 created_at not surfaced | E2E-29 |

---

## Group A — Bootstrap, button mount & initial load (BEH-1, BEH-2, UI-1)

**Preconditions/fixtures (UI):** navigate to `baseURL + "/"`, `waitUntil:"domcontentloaded"`. A0 auto-provisions a default context; capture its id via `page.evaluate(() => window.getContext?.())` (fallback `window.Alpine.store("chats").getSelectedChatId()`) — **closes C-2**. No project needed (plugin is per-chat).

- **E2E-1 — Top-bar button mounts at `chat-top-end`** *(BEH-1, UI-1, S-1/S-2)*
  Steps: load `/`.
  Assert (primary, hard): `.cc-toolbar-btn` is visible within 20 s (extension loads async). It renders a Material `comment` glyph (`.cc-toolbar-btn .material-symbols-outlined` `toHaveText("comment")` with trim — ligature text is literally `comment`, mount HTML line 17; m-2 acknowledged). `aria-label="Open comments"` present.
  Assert (secondary, fast-loop-verified first — closes m-1): the button's actual DOM nesting relative to `<x-extension id="chat-top-end">` is confirmed on the fast loop before this is hard-asserted; if the extension loader mounts the button as a sibling/replacement rather than a descendant, the ancestor check is dropped and only the primary `.cc-toolbar-btn` visibility is hard-asserted. **Hard.**

- **E2E-2 — Bootstrap ran & listeners installed (`_bootstrapped` / observer present)** *(BEH-1)* — **down-scoped per M-1**
  Steps: after E2E-1, `page.evaluate` reads `window.Alpine.store("chatComments")` (closes C-2).
  Assert: `_bootstrapped === true`; `_historyObserver !== null`; `getContext()` returns a non-empty string. **The "exactly once" wording is dropped** — it is not externally falsifiable without instrumenting a dev-build counter, and dressing the indirect highlight-stability proxy as the real assertion would be fake-green (M-1). Highlight non-multiplication under repeated DOM mutation is asserted as its own distinct property in E2E-12, not as a proxy for one-shot bootstrap. **Hard.**

- **E2E-3 — Load on bootstrap returns an array** *(BEH-2, S-4/S-6)*
  Steps: fresh chat; `page.evaluate` awaits `callJsonApi("/plugins/chat_comments/comments",{action:"load",context:<id>})` (success path; `callJsonApi` is fine here because the response is `ok`).
  Assert: response `{ok:true, context:<id>, comments:[...]}` with `Array.isArray(comments)`. On a clean install `comments.length === 0`. Store mirror `Alpine.store("chatComments").comments` is also an array. **Hard.**

`[coverage] Group A: 3/3 asserted, 0 skipped.`

---

## Group B — Context resolution & multi-chat isolation (BEH-3; G-1 gap)

**Fixtures (UI):** create a second chat via the sidebar new-chat control (real UI click), so two distinct context ids exist.

- **E2E-4 — Switching chats reloads the correct comment set** *(BEH-3)*
  Steps: in chat #1, add one general comment (via modal, Group F flow) → badge shows 1. Switch to chat #2 via the sidebar (a real click that mutates `#chat-history`).
  Assert: after the switch, `Alpine.store("chatComments").contextId` equals chat #2's id (closes C-2); `.comments.length === 0` (chat #2 is clean); badge hidden. Switch back to chat #1; assert comments reload to length 1 and badge shows 1 again. **Hard.** (The DOM mutation from the chat swap is what triggers the reanchor/reload — explicitly the mechanism under test.)

- **E2E-5 — `@skip` Context switch with NO `#chat-history` mutation leaves stale comments** *(BEH-3, G-1)*
  `@skip(reason="Source gap G-1: reload is piggy-backed on DOM mutation; a switch that yields no #chat-history mutation cannot be produced deterministically without flake. Tracked: <ISSUE-LINK chat-comments#G-1>")`
  Not asserted as pass — recorded as known gap. **Skip (tracked).**

`[coverage] Group B: 1/1 asserted, 1 tracked-skip.`

---

## Group C — Selection context menu vs native menu (BEH-5, EC-1, UI-2)

**Fixtures (LLM-less, Rule 4 — `type:"user"` per C-1):** render a deterministic message:
```js
await page.evaluate(async () => {
  const m = await import("/js/messages.js");
  await m.setMessage({ id:"e2e-msg-1", no:1, type:"user",
    content:"The quick brown fox jumps. The quick brown fox runs." });
});
await expect(page.locator("#message-e2e-msg-1 .message-text")).toBeVisible();
```
Selection helper (closes M-3): a single `page.evaluate` that builds a `Range` over the substring "quick brown fox" inside `#message-e2e-msg-1 .message-text`, applies it via `window.getSelection()`, **and in the same evaluate dispatches a synthetic `contextmenu` MouseEvent** at the range's client rect — so no intervening mousedown collapses the selection (a real `page.mouse` right-click can clear the selection, making `sel.isCollapsed` true and causing the plugin to bail at chat-comments-store.js:150). Clamp assertions are read after a `requestAnimationFrame`/visible wait so the menu has non-zero size.

- **E2E-6 — Right-click over selected message text shows the plugin menu & suppresses native** *(BEH-5)* — **M-2 applied**
  Steps: select "quick brown fox" in `#message-e2e-msg-1 .message-text`; dispatch `contextmenu` (helper above).
  Assert (primary, hard, observable consequence): `.cc-menu` is visible (`position:fixed`, `z-index:100000`) and is viewport-clamped (`getBoundingClientRect().right <= innerWidth`, `.bottom <= innerHeight`), read after a rAF.
  Assert (secondary, best-effort, NOT the gate): the `contextmenu` `defaultPrevented` check is demoted to best-effort because two `document`-level bubble listeners' ordering is registration-dependent and the probe may observe `false` before the plugin's listener runs (chat-comments-store.js:160). The deterministic signal is the presence of `.cc-menu`. **Hard (on menu presence/clamp); defaultPrevented is non-gating.**

- **E2E-7 — Menu offers exactly three actions** *(BEH-6, UI-2)*
  Assert: `.cc-menu .cc-menu-item` count === 3 with texts `["Comment","Copy text","Send to prompt"]` in order. **Hard.**

- **E2E-8 — Selection OUTSIDE a message preserves native menu (EC-1)** *(BEH-5)* — **M-2 applied**
  Steps: select text in a non-message element (e.g. a sidebar label) and dispatch `contextmenu` there.
  Assert (primary, hard): `.cc-menu` is NOT present. Also: collapsed/whitespace-only selection over a message → no `.cc-menu`.
  Assert (secondary, best-effort): native menu allowed (`defaultPrevented === false`) — non-gating for the same ordering reason as E2E-6; absence of `.cc-menu` is the deterministic gate. **Hard (on `.cc-menu` absence).**

`[coverage] Group C: 3/3 asserted, 0 skipped.`

---

## Group D — Menu actions: Copy & Send-to-prompt (BEH-6, BEH-13 append, EC-5)

**Fixtures:** message `#message-e2e-msg-1` rendered (`type:"user"`); selection "quick brown fox"; menu open. For clipboard, `context.grantPermissions(["clipboard-read","clipboard-write"])`.

- **E2E-9 — Copy text writes selection to clipboard + success toast** *(BEH-6)*
  Steps: open menu → click `.cc-menu-item` "Copy text".
  Assert: `navigator.clipboard.readText()` (via `page.evaluate`) === "quick brown fox"; success toast text "Copied to clipboard." in `.toast-item .toast-message` (closes m-3). **Hard** (clipboard granted → success path reachable, not the try/catch exception).

- **E2E-10 — Copy denied surfaces "Copy failed." toast (EC-5)** *(BEH-6, EC-5)* — **m-4 applied**
  Steps: `context.clearPermissions()` (revoke clipboard) → reopen menu → "Copy text".
  Assert: error toast text "Copy failed." in `.toast-item .toast-message`. The OS-denied rejection is the un-enableable env (Rule 6); only the bare `writeText` call may be try/caught. The test **fails (RED) if neither the success toast nor "Copy failed." appears** — the wrap may not mask a missing toast. **Hard assertion on the toast.**

- **E2E-11/(prereq for D) — Send to prompt appends quoted selection** → asserted as **E2E-23** in Group H to keep prompt-box assertions cohesive.

`[coverage] Group D: 2/2 asserted, 0 skipped (E2E-23 in Group H).`

---

## Group E — Create anchored comment, highlight render, overlap reject (BEH-7, BEH-8, BEH-9, UI-3, UI-5, EC-2)

**Fixtures:** `#message-e2e-msg-1` (`type:"user"`) with content containing a *repeated* phrase so occurrence-indexing is exercised: `"The quick brown fox jumps. The quick brown fox runs."` Selection of the **second** "quick brown fox", built over `#message-e2e-msg-1 .message-text`. **Group starts from a fresh chat** (sidebar new-chat) so no comment residue leaks in (closes m-5).

- **E2E-13 — Create comment via editor → highlight appears, occurrence-correct** *(BEH-8, UI-3, UI-5, BEH-7)*
  Steps: select 2nd "quick brown fox" → context menu → "Comment" → `.cc-editor` opens autofocused → type "second-fox note" in `.cc-editor-input` → click `.cc-btn-primary` "Save".
  Assert: a `<mark class="cc-highlight" data-comment-id=…>` wraps the **second** occurrence (assert wrapped text === "quick brown fox" AND it is the 2nd match in document order). Store (`Alpine.store("chatComments")`) now has 1 comment with `occurrence === 1`, `message_id === "e2e-msg-1"`, `quoted_text === "quick brown fox"`, `comment === "second-fox note"`, integer `created_at`. Badge → 1. **Hard.**

- **E2E-14 — Overlapping selection refused (BEH-9, EC-2)** *(BEH-9)* — **G-C applied**
  Steps: with the E2E-13 highlight present, build a second selection that **genuinely intersects** the existing `<mark>` — e.g. a range *starting inside* the highlighted phrase and extending past it — so `range.intersectsNode(mark)` (anchoring.js:99) is true → context menu → "Comment".
  Assert: error toast "That text already has a comment." in `.toast-item .toast-message`; NO `.cc-editor` opens; comment count unchanged (still 1). **Hard.**

- **E2E-25 — Empty comment in editor is a no-op (EC-6)** *(BEH-8)*
  Steps: select unhighlighted text → "Comment" → leave editor blank (or whitespace) → Save.
  Assert: no comment added (count unchanged), no highlight, no toast. **Hard.**

`[coverage] Group E: 3/3 asserted, 0 skipped.`

---

## Group F — General comment via modal + badge (BEH-12, UI-4, UI-1a)

**Fixtures:** fresh chat (clean modal, sidebar new-chat — m-5). This group is the existing `behaviour.mjs` enhanced.

- **E2E-21 — Add general comment renders row tagged "General"** *(BEH-12, UI-4)*
  Steps: click `.cc-toolbar-btn` → `.cc-modal-root` visible → `.cc-modal-empty` "No comments yet." present → fill `.cc-modal-add-input` with `"e2e general "+Date.now()` → `.cc-modal-add .cc-modal-add-btn` enables → click Add.
  Assert: `.cc-modal-item .cc-modal-note` contains the probe text; sibling `.cc-modal-general-tag` "General" is visible; no `.cc-modal-quote` on that item; `.cc-modal-empty` gone. **Hard.**

- **E2E-22 — Add button disabled while draft blank; Ctrl/Cmd+Enter also adds; badge bumps** *(BEH-12, UI-1a)* — **m-6 applied**
  Steps: assert the disabled state only after the modal body is fully mounted and the footer has been relocated to `.modal-footer-slot` on a `requestAnimationFrame` (modals.js:271-277). Clear input → assert `.cc-modal-add-btn` `toBeDisabled()`. Type → enabled. Clear, type a new draft, press `Control+Enter` in the textarea.
  Assert: a second row appears (count 2); `.cc-toolbar-btn .cc-badge` visible with `x-text === "2"`. Empty draft + Ctrl+Enter → no-op (count stays). **Hard.**

`[coverage] Group F: 2/2 asserted, 0 skipped.`

---

## Group G — View popover: view / edit / delete (BEH-10, UI-6, EC-6)

**Fixtures:** start from a fresh chat (m-5); create one anchored comment (reuse E2E-13 flow) so a single `.cc-highlight` exists.

- **E2E-15 — Click highlight opens view popover with note + Edit/Delete** *(BEH-10, UI-6)*
  Steps: click the `.cc-highlight` mark.
  Assert: `.cc-popover` visible; `.cc-popover-text` === the comment note; two actions Edit + Delete present; viewport-clamped. Click outside → `.cc-popover` removed. **Hard.**

- **E2E-16 — Edit prefilled, saving non-empty updates + persists** *(BEH-10 edit)*
  Steps: open popover → Edit → `.cc-editor` opens prefilled with current note → change to "edited note" → Save.
  Assert: store comment `.comment === "edited note"`; reopen popover shows updated `.cc-popover-text`; a subsequent `{action:"load"}` **after a full `page.reload()`** returns "edited note" (persisted through `save_tmp_chat`, per C-3). **Hard.**

- **E2E-17 — Empty edit is a no-op; Delete removes highlight & persists** *(BEH-10, EC-6)*
  Steps: open popover → Edit → clear field → Save → assert note unchanged (no-op). Then open popover → Delete.
  Assert: `.cc-highlight` for that id gone; store count decremented; badge updates; `{action:"load"}` **after reload** no longer returns it. **Hard.**

`[coverage] Group G: 3/3 asserted, 0 skipped.`

---

## Group H — Prompt-box emission: append, replace, send-all, no-submit (BEH-13, BEH-14, EC-7)

**Fixtures:** `#message-e2e-msg-1` (`type:"user"`); `#chat-input` present; fresh chat per group (m-5). Append tests seed the prompt box with a **known exact string** via UI typing.

- **E2E-23 — Selection → "Send to prompt" appends Markdown-blockquoted text (+ multi-line)** *(BEH-6 Send, BEH-13 append)* — **M-6 / G-E-adjacent applied**
  Steps: type the exact seed `"draft so far"` (no trailing space/newline) in `#chat-input`. Select "quick brown fox" → menu → "Send to prompt".
  Assert: `#chat-input.value === "draft so far\n\n> quick brown fox"`. The expected value documents that `insertIntoPrompt` append strips trailing whitespace from the existing value (`existing = (input.value||"").replace(/\s*$/, "")`, chat-comments-store.js:135-136) before joining with `"\n\n"`; the seed is chosen with no trailing whitespace so the equality is exact. `chatInputStore.message` mirrors it; caret at end; input event fired (textarea height adjusted).
  **Explicit multi-line sub-case (M-6):** render a second `type:"user"` message and select a span covering two lines (or use a selection spanning a `\n`); "Send to prompt" → assert each selected line is prefixed `> ` (quoteText splits on `\n`, chat-comments-store.js). **Hard.**

- **E2E-24 — Send-all uses REPLACE mode (overwrites existing prompt)** *(BEH-13 replace, BEH-14)*
  Steps: pre-seed `#chat-input` with "OLD CONTENT". Add 2 comments (1 anchored, 1 general) via earlier flows. Open modal → footer "Send to prompt".
  Assert: `#chat-input.value` does NOT contain "OLD CONTENT" (replaced); it starts with `"I've left comments on this conversation. Please address each:"`. **Hard.**

- **E2E-26 — Send-all numbered format: anchored vs general (full-string equality)** *(BEH-14)* — **G-E applied**
  With 1 anchored ("quick brown fox" / note "N1") + 1 general ("G1"):
  Assert the **entire** prompt value with full-string equality (not `toContain`, to catch formatting regressions). The expected string is the header `"I've left comments on this conversation. Please address each:\n"` (trailing `\n`), the blank line before item 1, then per-item blocks joined with the inter-item `\n` and a final `trimEnd()` (chat-comments-store.js:464-479):
  ```
  I've left comments on this conversation. Please address each:

  1. Referenced text:
  > quick brown fox
  Comment: N1
  2. General comment: G1
  ```
  The exact whitespace (leading `\n` per item, header trailing `\n`, final `trimEnd`) is pinned from the source. **Hard.**

- **E2E-27 — Send-all closes modal + success toast with count** *(BEH-14, S-5, S-8)*
  Assert: after footer "Send to prompt", `.cc-modal-root` is hidden (modal closed); toast "2 comment(s) sent to prompt." in `.toast-item .toast-message` (m-3). **Hard.**

- **E2E-28 — Send-all with 0 comments only toasts, no insertion; footer disabled** *(BEH-14)* — **M-5 applied**
  Steps: fresh chat, open modal (empty). Footer "Send to prompt" button is `:disabled` — assert via `getByRole("button",{name:"Send to prompt"})` or `.modal-footer-slot [data-modal-footer] .btn-ok` `toBeDisabled()` (the footer is relocated to `.modal-footer-slot`, m-6). Since the button is disabled and unclickable, force-invoke the guard via `window.Alpine.store("chatComments").sendAllToPrompt()` (correct handle per C-2).
  Assert: toast "No comments to send yet." asserted by **message text** in `.toast-item .toast-message` regardless of toast styling (the guard uses `toastFrontendSuccess`, chat-comments-store.js:461, so do NOT assume error styling — M-5); `#chat-input` unchanged (no insertion). **Hard.**

- **E2E-29 — created_at stored but never surfaced; order = insertion order; no auto-submit (EC-7, out-of-scope agent)** *(EC-7, BEH-14)* — **G-D applied**
  Assert: modal rows render in insertion order (add "G1" then "G2"; assert "G1" precedes "G2"). **No timestamp surfaced — real negative assertion (not a tautology):** scan each `.cc-modal-item` rendered text for digit-clusters resembling an epoch (`\b\d{9,}\b`) or a date and assert none are present, after the modal item has fully rendered. After Send-all, **no chat message is submitted** — assert message count under `#chat-history` is unchanged and `#chat-input` still holds the text (Send-to-prompt fills, never sends). **Hard.**

`[coverage] Group H: 6/6 asserted, 0 skipped.`

---

## Group I — Persistence round-trip & server sanitisation (BEH-11, BEH-4, BEH-7 re-anchor, EC-3, EC-4)

**Fixtures (Rule 4, C-3):** persistence is asserted via `{action:"load"}` issued **after a full `page.reload()`** — the only persistence probe. This proves the `save_tmp_chat` round-trip (load reads `context.data[DATA_KEY]`, comments.py:22), not in-memory state. **No `dump_live`/`A0_E2E_DUMP_LIVE` route is used.** Status-code pokes use `window.fetchApi` (C-4).

- **E2E-18 — Save round-trip survives reload** *(BEH-11, S-11)*
  Steps: add 1 general + 1 anchored comment. Full `page.reload()`.
  Assert: after reload, `{action:"load"}` returns both comments with canonical schema (`id` str, `message_id` str, `quoted_text` str, `occurrence` int, `comment` str, `created_at` int); badge restored to 2. **Hard.**

- **E2E-19 — Server sanitisation: drops empty- & whitespace-only-comment items, clips to 2000, coerces types** *(BEH-11)* — **M-4 applied**
  Steps: `page.evaluate` POST via `fetchApi` `{action:"save", context:<id>, comments:[ {comment:""}, {comment:"   "}, {comment:"x".repeat(2500), occurrence:"3", created_at:"99", id:7, message_id:42, quoted_text:5}, "not-a-dict" ]}`.
  Assert: response `{ok:true, count:1}`; subsequent load shows exactly 1 item; its `comment.length === 2000` (`str(...).strip()[:2000]`; the 2500-`x` input has no surrounding whitespace so `.strip()` is a no-op, comments.py); `occurrence === 3` (int), `created_at === 99` (int), `id === "7"`, `message_id === "42"`, `quoted_text === "5"` (all stringified). The empty `{comment:""}`, the **whitespace-only `{comment:"   "}`** (dropped by strip-then-empty — closes M-4), and the `"not-a-dict"` string are all dropped. **Hard.**

- **E2E-20 — API contract errors: missing/unknown/bad payload (BEH-11, EC-4)** *(BEH-11, EC-4)* — **C-4 applied**
  Steps via `page.evaluate` using `window.fetchApi(API_PATH, {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(...)})` (returns the raw `Response`, carries CSRF + same-origin creds — `callJsonApi` cannot be used because it throws on `!ok` and hides the status):
  - `{action:"load"}` no context → `res.status === 400`, `await res.text()` === "Missing context id".
  - `{action:"load", context:"does-not-exist"}` → `res.status === 404`, text === "Context not found".
  - `{action:"save", context:<id>, comments:"x"}` → `res.status === 400`, text === "comments must be a list".
  - `{action:"frobnicate", context:<id>}` → `res.status === 400`, text === "Unknown action".
  Assert: each status + body string exactly. **Hard.**

- **E2E-12 — Auto re-anchor on DOM mutation does not duplicate or lose highlights** *(BEH-4, BEH-7)*
  Steps: 1 anchored comment present (1 `.cc-highlight`). Append then remove a benign node under `#chat-history` (simulating a stream/render mutation) 3×.
  Assert: after mutations settle (`requestAnimationFrame`), `.cc-highlight[data-comment-id=<id>]` count === exactly 1 (observer disconnect/reconnect prevents loop; no listener pile-up). This is asserted as its **own** property (highlight stability), explicitly **not** as a proxy for one-shot bootstrap (M-1). **Hard.**

- **E2E-11 — Highlight mark shape (UI-5)** *(UI-5, BEH-7)*
  Assert: the rendered highlight is a `<mark>` with class `cc-highlight` and a `data-comment-id` matching the store id; computed `cursor:pointer`. **Hard.**

`[coverage] Group I: 5/5 asserted, 0 skipped.`

---

## Group J — Re-anchor miss is best-effort (EC-3) & out-of-scope assertions (§4/§6)

- **E2E-25b — Re-anchor miss: comment persists & shows in modal/send-all even when text no longer matches (EC-3)**
  Steps: create an anchored comment on `"quick brown fox"` (in `#message-e2e-msg-1 .message-text`, `type:"user"`). Then mutate the message text so the phrase no longer appears (`page.evaluate` rewrite the `.message-text > pre` textContent to "different text entirely"); trigger a re-anchor.
  Assert: NO `.cc-highlight` renders (silent skip — `findOccurrenceOffsets` returns null); BUT the comment still appears in the modal list (`.cc-modal-item`) and in Send-all output; `{action:"load"}` after reload still returns it. **Hard** (proves "data retained, highlight best-effort").

- **E2E-30 — Out-of-scope surfaces are absent (asserted N/A, §4/§6)** *(G-F applied)*
  Steps: open the **real** A0 Settings modal and **wait for it to fully render** before asserting absence (an absence assertion run before the panel mounts is a false pass — G-F).
  Assert (negative, hard, post-render): the plugin contributes **no** settings UI — the rendered Settings shows no "Chat Comments" section (`settings_sections: []`); there is no per-project config-panel open path for this plugin. The absence of any plugin settings entry is the real assertion satisfying Rule 2. **Hard.**

`[coverage] Group J: 2/2 asserted, 0 skipped.`

---

## Accepted gaps (documented, not silently omitted)

- **G-A — observer fallback to `document.body`** (`connectObserver`, chat-comments-store.js:56) is not exercised; `#chat-history` always exists at load. Accepted as untested, low priority.
- **G-B — client does NOT re-adopt the server's sanitised list** (behaviour spec G-2): both sides clip at 2000, so the divergence is near-nil; documented as an accepted gap rather than tested.

---

## Suite-level totals & exit criteria

- **Groups:** 10 (A–J), one `.webm` video each (Rule 5).
- **Scenarios:** 30 numbered cases (E2E-1…E2E-30, plus the in-group E2E-25b re-anchor-miss case); **29 hard-asserted, 1 tracked `@skip` (E2E-5 / G-1)**.
- **Green condition:** every group's `[coverage]` line shows `asserted == planned` and the only skip is the tracked G-1 with a live issue link. Any caught-and-ignored failure → RED (Rule 1). The clipboard try/catch (E2E-10) goes RED if neither expected toast appears (m-4).
- **Local fast-loop gate (Rule 7):** run end-to-end against a disposable A0 (`make e2e` against the local nested pod) before pushing; CI `plugin-e2e` (install → verify → uninstall, nested rootless A0) is the final gate. Fast-loop pre-flight specifically verifies: (a) `setMessage` `type:"user"` yields `#message-e2e-msg-1 .message-text` with the literal text and `getSelection()` returns the exact `quoted_text` (C-1); (b) `window.Alpine.store("chatComments")` / `window.getContext()` resolve (C-2); (c) the E2E-1 button↔`x-extension` nesting before hard-asserting the ancestor selector (m-1); (d) `.cc-menu` actually appears from the synthetic `contextmenu` dispatch (M-3).
- **Fixture honesty (Rule 3):** all chat/context state created by driving `/` + the sidebar new-chat UI; each stateful group starts from a fresh chat to avoid residue (m-5). The only API calls are the read-only `{action:"load"}` probe (post-reload for persistence) and the deliberate negative-contract pokes in E2E-19/E2E-20 (via `fetchApi`, C-4). The rendered-message fixture uses stock `/js/messages.js` `setMessage` user-path, the LLM-less substitute for an agent reply (Rule 4, C-1). No test-only plugin route is shipped (C-3).
```