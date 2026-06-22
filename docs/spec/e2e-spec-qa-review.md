# QA Review — E2E Test Spec for `agent-zero-plugin-chat-comments`

**Reviewer:** Senior QA / E2E expert
**Artifacts:** behaviour spec + e2e spec (both supplied), plugin source at `/tmp/fan-chat-comments/usr/plugins/chat_comments/`, live A0 at `/a0`.
**Verdict line:** see bottom. **Headline:** the e2e spec is well-structured and rule-disciplined, but it is built on a **wrong hermetic fixture** (`type:"agent"`) and **wrong store/probe selectors** (`window.$store`, `window.chatsStore`) that will make most anchoring and store-introspection scenarios fail or silently mis-assert. These must be fixed before the suite can be trusted.

---

## CRITICAL

### C-1 — The LLM-less message fixture uses the wrong `setMessage` type; it will not render a clean `#message-<id>` text body
The spec's load-bearing fixture (Rule 4, Group C/E/H/I/J) is:
```js
await m.setMessage({ id:"e2e-msg-1", no:1, type:"agent", content:"The quick brown fox..." });
await expect(page.locator("#message-e2e-msg-1")).toBeVisible();
```
In live A0 (`/a0/webui/js/messages.js`), `type:"agent"` → `getMessageHandler` (line 93) → `drawMessageAgent` (line 812) → `drawProcessStep` (line 332). That path builds `process-group-<id>` / `process-step-<id>` collapsible step containers and routes the text into step KVPs / `.process-step-detail` — it does **not** create a plain `#message-<id>` whose `textContent` is the literal sentence. The content is also subject to step collapse (`detailMode`) and markdown. Consequences:
- `page.locator("#message-e2e-msg-1")` may not resolve at all (the id created is `process-step-e2e-msg-1` / a process-group container, depending on grouping).
- Even if a `#message-…` exists, `container.textContent` will contain step chrome, not just "The quick brown fox…", so `findOccurrenceOffsets` / `occurrenceForStart` offsets used by BEH-7/BEH-8 (and every selection scenario) will be wrong or the phrase won't be found → highlights silently won't render → E2E-13/14/15/16/17/23/26 fail or mis-assert.

The behaviour spec compounds this by independently asserting `type:"agent"` is the hermetic fixture — it is not. **The plugin anchors to `getElementById("message-"+id)` and selects from a plain text body; the only stock type that deterministically produces that is `type:"user"`** (`drawMessageUser`, line 965): it calls `getOrCreateMessageContainer(id,"right",…)` directly (id = `message-<id>`, line 230-233) and writes `content` into `.message-text > pre` as plain text — no markdown mangling, no process-group dependency.

**Fix:** change every fixture to `setMessage({ id:"e2e-msg-1", no:1, type:"user", content:"…" })`, and assert the anchor on `#message-e2e-msg-1 .message-text`. Verify in the fast loop that `getSelection()` over the substring yields the exact `quoted_text` the plugin will store. (Note `setMessage` line 209 sets `id: id || String(no)`, so always pass `id` explicitly.) If a non-user "assistant-looking" bubble is desired, `type:"response"` with `agentno:0` also yields `#message-<id>` with a markdown `.message-text` — but markdown means the source text must be markdown-inert (no `.`-lists, no `>`); `type:"user"` is the safer hermetic choice.

### C-2 — Store introspection uses `window.$store` / `window.chatsStore`, which do not exist
E2E-2 (`window.$store?.chatComments?._bootstrapped`), E2E-3 (`$store.chatComments.comments`), E2E-4 (`$store.chatComments.contextId`), and the preconditions (`window.chatsStore?.getSelectedChatId?.()`) read globals that A0 never sets.
- `$store` is an **Alpine template magic**, available only inside an Alpine-scoped expression — it is **not** a `window` property. `page.evaluate(() => window.$store…)` returns `undefined`, so `_bootstrapped === true` etc. either throw or assert against `undefined` (a false RED, or worse a swallowed pass).
- The chats store is registered as `createStore("chats", …)` (chats-store.js:373) and is **not** exposed as `window.chatsStore`.

Verified live: stores are reachable via `globalThis.Alpine.store(name)`; `globalThis.getContext()` **is** exposed (index.js:602).

**Fix:** replace all store probes with `window.Alpine.store("chatComments")` (e.g. `Alpine.store("chatComments")._bootstrapped`) and resolve the context id via `window.getContext()` (the plugin's own fallback) or `window.Alpine.store("chats").getSelectedChatId()`. Audit every `page.evaluate` in the spec for `$store`/`chatsStore` and convert. Without this, Groups A and B are non-functional.

### C-3 — `dump_live` route + `.devkit.yml e2e_pod_env` are invented; the plugin ships no such route and the testkit support is unverified
Rule 4 mandates a deterministic probe; the spec proposes a **test-only debug route behind `A0_E2E_DUMP_LIVE`** added via `.devkit.yml e2e_pod_env`. Problems:
- The plugin has exactly one API handler (`api/comments.py`, actions `load`/`save`); there is **no** dump route, and adding a debug route to a *shipped* plugin (it lands in the OCI artifact) violates the "ship only what's needed" hygiene the behaviour spec itself praises.
- This repo has **no `.devkit.yml`** (confirmed: only `plugin_dir` is referenced by the CI template's comment). Whether the reusable `plugin-e2e.yml` honors an `e2e_pod_env` key that injects pod env AND that the plugin then conditionally registers a route is **unverified** against the testkit. The spec hand-waves "If the devkit cannot host a custom route…".

The good news: the plugin's own `{action:"load"}` after a full `page.reload()` is a genuine round-trip through `save_tmp_chat` (the load handler reads `context.data[DATA_KEY]`, comments.py:22) and is fully sufficient. 

**Fix:** make the **reload + `{action:"load"}`** path the *primary, only* persistence probe (E2E-18). Delete the `dump_live`/`A0_E2E_DUMP_LIVE`/`.devkit.yml e2e_pod_env` machinery from the spec, or demote it to an explicitly-tracked future enhancement — do not present an unbuilt, unverified route as a hard-assertion path.

### C-4 — API contract assertions (E2E-20) must use raw `fetch`, not `callJsonApi`; status codes are otherwise unobservable
E2E-20 asserts "HTTP 400 … HTTP 404 … exact status + body". Live `callJsonApi` (`/a0/webui/js/api.js`) **throws** on `!response.ok` — it does `error = await response.text(); throw new Error(error)` and never surfaces the numeric status. So you cannot read `400`/`404` from `callJsonApi`. The spec text says "via `page.evaluate` fetch", which is correct — but E2E-3 awaits `callJsonApi(...load...)` and the persistence probes lean on `{action:"load"}` via the plugin path, so the boundary is easy to blur.

**Fix:** in E2E-20, use raw `fetch(API_PATH, {method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json"}, body: JSON.stringify(...)})` and assert `res.status` (400/404) and `await res.text()` against the exact strings from comments.py (`"Missing context id"`, `"Context not found"`, `"comments must be a list"`, `"Unknown action"`). Note same-origin creds + CSRF: A0's `ApiHandler` enforces CSRF (api.py:161) — confirm the test page's fetch carries whatever CSRF header `fetchApi` injects, or call `fetchApi` instead of bare `fetch` (it adds the token but still returns the raw `Response`).

---

## MAJOR

### M-1 — E2E-2's "exactly once" claim is asserted indirectly and weakly
The spec concedes "Re-render the button is not separately triggerable, so one-shot is asserted indirectly" and then leans on highlight-count stability (cross-ref E2E-12). That does not actually prove `bootstrap()` ran once; it proves the observer doesn't multiply highlights, which is a *different* property. With C-2 fixed you can assert `_bootstrapped === true` directly, but the "exactly once" guarantee is structurally hard to falsify from outside.
**Fix:** down-scope E2E-2 to what is verifiable: `Alpine.store("chatComments")._bootstrapped === true` and `_historyObserver !== null`. Drop the "exactly once" wording or assert it by instrumenting a counter in a dev build — don't dress an indirect proxy as the real assertion (borderline Rule-2 fake-green).

### M-2 — `defaultPrevented` probe (E2E-6, E2E-8) is racy / likely unobservable
E2E-6 asserts the native menu is suppressed by checking `contextmenu` was `defaultPrevented`, "listen via `page.evaluate` hook before dispatch." The plugin calls `e.preventDefault()` inside its own `document`-level listener (chat-comments-store.js:160). To observe `defaultPrevented`, your probe listener must run **after** the plugin's listener in the same phase on the same target — ordering between two `document` bubble-phase listeners is registration-order-dependent and fragile. If your probe is added first, it sees `defaultPrevented === false` even though the plugin later prevents it.
**Fix:** assert the *observable consequence* instead: after a real right-click over selected message text, `.cc-menu` is present and visible (positive), and over a non-message selection `.cc-menu` is absent (E2E-8 negative). The presence/absence of the plugin menu is the deterministic signal; `defaultPrevented` is implementation-internal and flaky. If you keep the prevention check, register the probe listener with `{capture:false}` AFTER load and accept it as best-effort, not the primary assertion.

### M-3 — Right-click dispatch mechanics under-specified; `getBoundingClientRect` of a Range vs real mouse
The selection helper "builds a Range … applies it via `getSelection()`, then a real `mouse` right-click at the selection's client rect." Two issues: (a) Playwright `page.mouse.click(x,y,{button:"right"})` fires `contextmenu` at that point, but the plugin reads `window.getSelection()` at event time — if the synthetic mouse interaction collapses/clears the selection (clicking can clear a selection), `sel.isCollapsed` becomes true and the plugin bails (chat-comments-store.js:150). (b) The clamp assertions (`rect.right <= innerWidth`) need the menu to have non-zero size *after* append; fine, but assert after a `requestAnimationFrame`/visible wait.
**Fix:** instead of a real mouse click (which can clear selection), dispatch a `contextmenu` MouseEvent programmatically on the selected node at the range's client coordinates **without** an intervening mousedown that collapses selection, or set the selection and dispatch `contextmenu` in the same `page.evaluate`. Verify on the fast loop that `.cc-menu` actually appears.

### M-4 — E2E-19 sanitisation expectations partially contradict the code
E2E-19 posts a mixed array and asserts the cleaned item has `id === "7"`, `message_id === "42"`, `quoted_text === "5"`, `comment.length === 2000`, `occurrence === 3`, `created_at === 99`. Cross-checking comments.py:
- `comment_text = str(item.get("comment","")).strip()[:2000]` — input `"x"*2500` has no surrounding whitespace, so `.strip()` is a no-op and length is exactly 2000. ✓
- `id`, `message_id`, `quoted_text` are stringified. ✓ (`"7"`, `"42"`, `"5"`).
- `occurrence = int(item.get("occurrence",0) or 0)` with input `"3"` → `int("3") == 3`. ✓
- `created_at` `"99"` → `99`. ✓
- The empty-comment item and the `"not-a-dict"` string are dropped → `count == 1`. ✓

So E2E-19 is actually **correct** against the code — good. One gap: it doesn't assert that a `comment` consisting only of whitespace is dropped (BEH-11 "drops empty-comment items" includes whitespace-only because of `.strip()`). 
**Fix (minor):** add a whitespace-only `{comment:"   "}` item to the payload and assert it is dropped, closing the strip-then-empty branch.

### M-5 — E2E-28 "force-invoke `sendAllToPrompt()` via page.evaluate" needs the correct store handle and is partly redundant with the disabled-button assertion
With 0 comments the footer button is `:disabled`, so you can't click it — the spec force-invokes the method to hit the guard. That requires `window.Alpine.store("chatComments").sendAllToPrompt()` (per C-2), and the guard toasts "No comments to send yet." via `toastFrontendSuccess` (chat-comments-store.js:461) — note it is a **success** toast, not error, so assert on `.toast-message` text regardless of type. Also the assertion "`#chat-input` unchanged" is good and falsifiable.
**Fix:** correct the invocation handle; assert the toast by message text in `.toast-message` (don't assume error styling).

### M-6 — No coverage of the `replace(/\s*$/,"")` append edge and multi-line blockquote claim is untested
E2E-23 asserts `"draft so far\n\n> quick brown fox"`. `insertIntoPrompt` append does `existing = (input.value||"").replace(/\s*$/, "")` then `existing + "\n\n" + text` (chat-comments-store.js:135-136). So trailing whitespace in the seeded prompt is stripped before joining — if the test seeds `"draft so far "` (trailing space) the expected value is still `"draft so far\n\n> …"`. The spec's exact-equality assertion is correct only if the seed has no trailing newline/space the test doesn't account for. The "multi-line selection → each line prefixed `> `" claim (BEH-6/quoteText) is asserted in prose but has no dedicated step.
**Fix:** seed with a known exact string and document the strip behaviour in the expected value; add an explicit multi-line-selection sub-case asserting each line is `> `-prefixed (quoteText splits on `\n`).

---

## MINOR

### m-1 — E2E-1 ancestor assertion selector
`page.locator("x-extension#chat-top-end .cc-toolbar-btn")` — verified `<x-extension id="chat-top-end">` is a real custom element in chat-top.html:26, so the selector resolves. But the button is injected by the extension loader which may mount it as a sibling/replacement rather than a descendant of the `<x-extension>` node depending on A0's extension mount semantics. Keep the primary assertion as plain `.cc-toolbar-btn` visible; treat the ancestor check as secondary and verify the actual DOM nesting on the fast loop before hard-asserting it.

### m-2 — Material glyph assertion is brittle
E2E-1 asserts `.cc-toolbar-btn .material-symbols-outlined` text `=== "comment"`. The ligature text content is literally `comment` (mount HTML line 17), so this works, but it's coupled to the icon font being loaded. Use `toHaveText("comment")` with trim; acceptable.

### m-3 — Toast text selectors not pinned
Multiple scenarios assert toast strings ("Copied to clipboard.", "Copy failed.", "N comment(s) sent to prompt.", "That text already has a comment."). Live toast text renders in `.toast-message` (and title in `.toast-title`) inside `.toast-item` (notification-toast-stack.html). Pin assertions to `.toast-item .toast-message` hasText to avoid matching arbitrary page text. Verify the exact string the plugin passes is the `message` arg (it is: `frontendSuccess(message, title)` — chat-comments-store.js passes message first, "Chat Comments" as title).

### m-4 — E2E-10 clipboard-denied determinism
Revoking permission via `context.clearPermissions()` then expecting `writeText` to reject is browser-version-dependent in headless Chromium (it sometimes resolves). The spec already allows wrapping only the clipboard call but still hard-asserting the toast — acceptable under Rule 6. Make explicit that the *toast* assertion is the gate and the rejection is the un-enableable env; ensure the wrap does not swallow a *missing* toast (i.e. fail if neither success nor "Copy failed." appears).

### m-5 — Order-dependence across groups sharing one chat/context
Groups E/G/H/I reuse "the E2E-13 flow" highlight and accumulate comments on the same context. Because comments persist to chat JSON, residue from one scenario leaks into the next (badge counts, send-all output). The spec's cleanup is best-effort (`behaviour.mjs` deletes via row trash with `.catch(()=>{})`). 
**Fix:** start each group from a fresh chat (drive the sidebar new-chat control — already the Rule-3 fixture) OR delete all comments deterministically at group setup and assert count 0 before proceeding. Don't rely on best-effort teardown for state isolation between hard assertions.

### m-6 — `:disabled` assertions vs Alpine timing
E2E-22/E2E-28 assert `toBeDisabled()` on `.cc-modal-add-btn` / footer `.btn-ok`. These are `:disabled` bound to `!draft.trim()` / `!comments.length` via Alpine. Assert after the modal body is fully mounted (footer is **moved** to `.modal-footer-slot` by `openModal` on a `requestAnimationFrame`, modals.js:271-277), so the footer `.btn-ok` lives under `.modal-footer-slot`, **not** under `.cc-modal-root`. The spec's `.modal-footer .btn-ok` selector matches the `data-modal-footer` div (which has class `modal-footer`) after relocation — verify the locator still resolves post-move; prefer `.modal-footer-slot [data-modal-footer] .btn-ok` or text-scoped `getByRole("button",{name:"Send to prompt"})`.

---

## GAPS (missing coverage)

### G-A — No test for the observer fallback to `document.body`
`connectObserver` falls back to `document.body` when `#chat-history` is absent (chat-comments-store.js:56). Not exercised. Low priority (chat-history always exists at load) — acceptable to leave untested, but note it.

### G-B — No assertion that the client does NOT re-adopt the server's sanitised list (behaviour spec G-2)
The behaviour spec flags that after save, `store.comments` keeps the client copy (no re-adopt). The e2e suite never asserts this divergence boundary. Since both sides clip at 2000, it's near-nil — but a test posting client data that the server would alter (e.g. a non-dict slipped in client-side) would prove the boundary. Optional; document as accepted gap, not silently omitted.

### G-C — `rangeIntersectsHighlights` / overlap (E2E-14) depends on `range.intersectsNode`
The overlap reject (BEH-9) uses `range.intersectsNode(mark)` (anchoring.js:99). E2E-14 must construct a selection that genuinely intersects the existing `<mark>` — given C-1's fixture fix, ensure the second selection's range actually overlaps the highlighted node (e.g. select a span starting inside the highlighted phrase). Add an explicit assertion that the editor did NOT open AND count is unchanged AND the exact toast fired — the spec lists these; just ensure the intersecting range is built correctly post-C-1.

### G-D — No test that `created_at` is an integer end-to-end (only E2E-29 checks it's not displayed)
E2E-13 asserts "integer `created_at`" in the store, but the store value is `Math.floor(Date.now()/1000)` (already int) — the meaningful assertion is server-side coercion, covered by E2E-19. Fine; ensure E2E-29's "no timestamp text anywhere in `.cc-modal-item`" is a real negative assertion (search the rendered item text for digit-clusters resembling epoch/date) rather than a tautology.

### G-E — Send-all numbering/format brittle to comment ordering and trimEnd
E2E-26 asserts exact `"1. Referenced text:\n> quick brown fox\nComment: N1"` and `"2. General comment: G1"`. The output is built with leading `\n` per item and a final `trimEnd()` (chat-comments-store.js:464-479), and the header has a trailing `\n`. The exact string includes a blank line between header and item 1. Pin the full expected string (header + items) rather than `toContain` fragments that could pass on partial matches, and account for the inter-item `\n`. This is the one place a `toContain` could fake-green a formatting regression.

### G-F — E2E-30 (out-of-scope/no-settings) is a weak negative
Asserting "Settings shows no 'Chat Comments' section" is reasonable, but the locator must open the real Settings modal and assert absence by text — ensure it waits for Settings to fully render before asserting absence (absence-before-render is a false pass). This is a classic fake-green trap: a negative assertion that runs before the panel mounts always passes.

---

## HARD-RULES COMPLIANCE

- **No silent swallow:** Mostly honored. Risks: E2E-2's indirect "exactly once" (M-1) and the clipboard wrap (m-4) and any `.catch(()=>{})` teardown (m-5) must not mask a missing positive assertion. The `dump_live` "If the devkit cannot host a custom route … equivalent hard assertion" phrasing (C-3) is a swallow-shaped escape hatch — remove it.
- **No fake green:** Threatened by C-1/C-2 (assertions against `undefined`/non-rendered DOM can pass vacuously), G-F (negative-before-render), G-E (`toContain` partials), M-1. All fixable.
- **UI-only fixtures:** Honored in principle — chats provisioned via `/` + sidebar new-chat; only read-only `{action:"load"}` and deliberate negative pokes touch the API. The `setMessage` fixture is a *rendering* helper, not backend state minting — acceptable under Rule 4. Good.
- **LLM-less / hermetic:** Intent is right, execution is broken by C-1 (wrong type) and C-3 (unbuilt dump route). Fix the fixture type and drop the invented route → genuinely hermetic via reload + load.
- **`openModal`/`closeModal` fire-and-forget:** The plugin already calls `void openModal(...)` and `closeModal(path)` non-awaited (chat-comments-store.js:428, 432) — no awaited-promise hang in the code. The spec does not instruct the test to `await openModal` directly (it clicks the UI), so no hang introduced. ✓ But note `openModal` returns a Promise that resolves only on modal close (modals.js:236) — any test that *does* `await page.evaluate(()=>openModal(...))` would hang; ensure no scenario does this. Currently none do; keep it that way.
- **Chat-context assumptions:** The spec correctly treats context as per-chat and provisions via UI. The context-id probe must use `window.getContext()` / `Alpine.store("chats")` not `window.chatsStore` (C-2).

---

## VERDICT

**REJECT — revise and resubmit.** The spec's structure, grouping, coverage map, hard-rule preamble, and `@skip` discipline (single tracked G-1 skip) are strong and largely faithful to the behaviour spec. But it cannot be implemented as written: it is grounded on a **wrong hermetic fixture** (C-1: `type:"agent"` does not render the `#message-<id>` plain-text body the plugin anchors to — must be `type:"user"`), **non-existent store/context globals** (C-2: `window.$store`/`window.chatsStore` → use `Alpine.store(...)` / `getContext()`), an **invented unverified persistence route** (C-3: drop `dump_live`/`A0_E2E_DUMP_LIVE`, make reload+`{action:"load"}` primary), and a **status-code assertion that `callJsonApi` cannot produce** (C-4: use raw `fetch`/`fetchApi`). The four Criticals are concentrated and mechanical to fix; once corrected and re-validated on the fast loop (per the spec's own Rule 7), the suite should be sound. The sanitisation scenario (E2E-19) and the bulk of the assertions are correct against the actual code. Address C-1…C-4 and M-1…M-6, then it is approvable.