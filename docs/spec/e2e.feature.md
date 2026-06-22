# chat-comments — E2E behaviour, in BDD

Generated from the final e2e spec for **`agent-zero-plugin-chat-comments`** v0.1.0.
Each `Scenario` is one falsifiable assertion run against a live Agent Zero instance (disposable
fast-loop pod for validation, CI nested-rootless A0 as the gate) with the plugin installed via the
standard `plugin-e2e` lifecycle (install → verify → uninstall). UI scenarios drive the real browser
through class selectors (core A0 ships no `data-testid`); the only API touches are the read-only
`{action:"load"}` probe and the deliberate negative-contract pokes. The rendered-message fixture is
the stock `/js/messages.js` `setMessage` user-path — the LLM-less substitute for an agent reply.
`<id>` is the active chat/context id, resolved via `window.getContext()` (fallback
`window.Alpine.store("chats").getSelectedChatId()`). The plugin store handle is
`window.Alpine.store("chatComments")`. This `.feature` IS the deliverable and the source
playwright-bdd executes from.

## Hard rules (binding — MUST appear verbatim as a preamble in the .feature spec)

> 1. **No silent swallow.** Every scenario is a real, falsifiable assertion. Failures are recorded and turn the group RED — never caught-and-ignored. Each group emits a `[coverage]` tally.
> 2. **No fake green.** A scenario is either genuinely asserted or an explicit `@skip` with a tracked reason (issue link) — never a bare pass for an untested case. Negative assertions must run only after the inspected surface has fully rendered (no absence-before-render). Exact-string assertions use full-string equality, not `toContain` partials, where a formatting regression must be caught.
> 3. **Self-provisioning fixtures, through the UI.** The suite creates whatever app state it needs (e.g. A0 chats/contexts) by driving the REAL UI, not backend/"magic" API calls. The only API touches are read-only probes (`{action:"load"}`) and the deliberate negative-contract pokes.
> 4. **LLM-less & hermetic.** Runtime/persistence-seam behaviours are exercised via a deterministic, stock rendering helper (`setMessage` user-path) and a real persistence round-trip (full `page.reload()` + `{action:"load"}`). No API key, no live MCP pod, no test-only debug routes added to the shipped plugin. A deterministic LLM stub is added only if the plugin truly needs an agent turn (it does not).
> 5. **≤10 grouped specs, one webm video each** (no GIF).
> 6. **Best-effort try/catch reserved** for genuinely un-enableable env only (a real agent turn, OS clipboard) — anything reachable via a seam MUST hard-assert. A try/catch may never mask a *missing* positive assertion.
> 7. **Validated on the local fast loop** (disposable A0) before pushing; CI is the final gate.

---

## Feature: Bootstrap, button mount & initial load  *(group 01)*

```gherkin
Background:
  Given a freshly booted Agent Zero with the chat_comments plugin installed
  And I navigate to "/" with waitUntil "domcontentloaded"
  And A0 auto-provisions a default context whose id I capture via window.getContext()
  And no project is needed because the plugin is per-chat

Scenario: Top-bar button mounts at chat-top-end (E2E-1)
  # BEH-1, UI-1
  When the chat-top extension finishes loading (within 20s)
  Then the ".cc-toolbar-btn" is visible
  And its ".material-symbols-outlined" glyph has trimmed text "comment"
  And it carries aria-label "Open comments"
  And — fast-loop-verified first — its nesting relative to <x-extension id="chat-top-end"> is asserted only if the loader mounts it as a descendant

Scenario: Bootstrap ran once and listeners are installed (E2E-2)
  # BEH-1 — down-scoped per M-1; "exactly once" wording dropped as not externally falsifiable
  When I read window.Alpine.store("chatComments")
  Then "_bootstrapped" is true
  And "_historyObserver" is not null
  And getContext() returns a non-empty string

Scenario: Load on bootstrap returns an array (E2E-3)
  # BEH-2
  When I await callJsonApi("/plugins/chat_comments/comments", {action:"load", context:<id>})
  Then the response is {ok:true, context:<id>, comments:[...]} with Array.isArray(comments)
  And on a clean install comments.length === 0
  And the store mirror Alpine.store("chatComments").comments is also an array
```

`[coverage] Group 01: 3/3 asserted, 0 skipped.`

---

## Feature: Context resolution & multi-chat isolation  *(group 02)*

```gherkin
Background:
  Given I create a second chat via the sidebar new-chat control (real UI click)
  And two distinct context ids now exist

Scenario: Switching chats reloads the correct comment set (E2E-4)
  # BEH-3 — the DOM mutation from the chat swap is the mechanism under test
  Given in chat #1 I added one general comment via the modal so the badge shows 1
  When I switch to chat #2 via the sidebar (a real click that mutates #chat-history)
  Then Alpine.store("chatComments").contextId equals chat #2's id
  And the store comments length is 0 and the badge is hidden
  When I switch back to chat #1
  Then the comments reload to length 1 and the badge shows 1 again

@skip
Scenario: Context switch with NO #chat-history mutation leaves stale comments (E2E-5)
  # BEH-3, G-1
  # @skip(reason="Source gap G-1: reload is piggy-backed on DOM mutation; a switch that yields no
  #   #chat-history mutation cannot be produced deterministically without flake.
  #   Tracked: <ISSUE-LINK chat-comments#G-1>")
  Given a context switch that produces no #chat-history mutation
  Then stale comments would remain — recorded as a known gap, not asserted as pass
```

`[coverage] Group 02: 1/1 asserted, 1 tracked-skip.`

---

## Feature: Selection context menu vs native menu  *(group 03)*

```gherkin
Background:
  Given I render a deterministic LLM-less message via setMessage({id:"e2e-msg-1", no:1, type:"user", content:"The quick brown fox jumps. The quick brown fox runs."})
  And "#message-e2e-msg-1 .message-text" is visible
  And the selection helper builds a Range over a substring inside it and dispatches a synthetic contextmenu MouseEvent in the same page.evaluate (so no intervening mousedown collapses the selection)
  And clamp assertions are read after a requestAnimationFrame

Scenario: Right-click over selected message text shows the plugin menu (E2E-6)
  # BEH-5 — M-2 applied
  When I select "quick brown fox" and dispatch contextmenu via the helper
  Then ".cc-menu" is visible with position:fixed and z-index:100000
  And it is viewport-clamped (getBoundingClientRect().right <= innerWidth and .bottom <= innerHeight)
  And the contextmenu defaultPrevented check is best-effort only (non-gating; listener ordering is registration-dependent)

Scenario: Menu offers exactly three actions in order (E2E-7)
  # BEH-6, UI-2
  When the ".cc-menu" is open
  Then ".cc-menu .cc-menu-item" count is 3 with texts ["Comment","Copy text","Send to prompt"] in order

Scenario: Selection OUTSIDE a message preserves native menu (E2E-8)
  # BEH-5, EC-1 — M-2 applied
  When I select text in a non-message element (e.g. a sidebar label) and dispatch contextmenu there
  Then ".cc-menu" is NOT present
  And a collapsed/whitespace-only selection over a message also yields no ".cc-menu"
  And native-menu-allowed (defaultPrevented === false) is best-effort only; ".cc-menu" absence is the gate
```

`[coverage] Group 03: 3/3 asserted, 0 skipped.`

---

## Feature: Menu actions — Copy & Send-to-prompt  *(group 04)*

```gherkin
Background:
  Given "#message-e2e-msg-1" rendered as type:"user"
  And the selection "quick brown fox" with the ".cc-menu" open

Scenario: Copy text writes selection to clipboard with success toast (E2E-9)
  # BEH-6 — clipboard granted, success path (not the try/catch exception)
  Given context.grantPermissions(["clipboard-read","clipboard-write"])
  When I click the ".cc-menu-item" labelled "Copy text"
  Then navigator.clipboard.readText() === "quick brown fox"
  And the success toast text "Copied to clipboard." appears in ".toast-item .toast-message"

Scenario: Copy denied surfaces "Copy failed." toast (E2E-10)
  # BEH-6, EC-5 — m-4 applied
  Given context.clearPermissions() to revoke clipboard
  When I reopen the menu and click "Copy text"
  Then the error toast text "Copy failed." appears in ".toast-item .toast-message"
  And the group goes RED if neither the success toast nor "Copy failed." appears (the wrap may not mask a missing toast)
```

`[coverage] Group 04: 2/2 asserted, 0 skipped (E2E-23 Send-to-prompt asserted in group 08).`

---

## Feature: Create anchored comment, highlight render & overlap reject  *(group 05)*

```gherkin
Background:
  Given a fresh chat (sidebar new-chat) so no comment residue leaks in
  And "#message-e2e-msg-1" type:"user" with content "The quick brown fox jumps. The quick brown fox runs."
  And selections are built over "#message-e2e-msg-1 .message-text"

Scenario: Create comment via editor — highlight appears, occurrence-correct (E2E-13)
  # BEH-7, BEH-8, UI-3, UI-5
  When I select the SECOND "quick brown fox" and choose menu "Comment"
  And the ".cc-editor" opens autofocused and I type "second-fox note" in ".cc-editor-input"
  And I click ".cc-btn-primary" "Save"
  Then a <mark class="cc-highlight" data-comment-id=...> wraps the second occurrence (wrapped text === "quick brown fox" AND it is the 2nd match in document order)
  And the store has 1 comment with occurrence===1, message_id==="e2e-msg-1", quoted_text==="quick brown fox", comment==="second-fox note", integer created_at
  And the badge shows 1

Scenario: Overlapping selection refused (E2E-14)
  # BEH-9, EC-2 — G-C applied
  Given the E2E-13 highlight is present
  When I build a second selection that genuinely intersects the existing <mark> (starting inside the phrase, extending past it) and choose menu "Comment"
  Then the error toast "That text already has a comment." appears in ".toast-item .toast-message"
  And no ".cc-editor" opens
  And the comment count is unchanged (still 1)

Scenario: Empty comment in editor is a no-op (E2E-25)
  # BEH-8, EC-6
  When I select unhighlighted text, choose "Comment", leave the editor blank or whitespace, and Save
  Then no comment is added (count unchanged), no highlight renders, and no toast appears
```

`[coverage] Group 05: 3/3 asserted, 0 skipped.`

---

## Feature: General comment via modal + badge  *(group 06)*

```gherkin
Background:
  Given a fresh chat (sidebar new-chat) for a clean modal

Scenario: Add general comment renders a row tagged "General" (E2E-21)
  # BEH-12, UI-4
  When I click ".cc-toolbar-btn" and the ".cc-modal-root" is visible
  And ".cc-modal-empty" "No comments yet." is present
  And I fill ".cc-modal-add-input" with "e2e general "+Date.now() so ".cc-modal-add .cc-modal-add-btn" enables, and click Add
  Then ".cc-modal-item .cc-modal-note" contains the probe text
  And the sibling ".cc-modal-general-tag" "General" is visible
  And that item has no ".cc-modal-quote"
  And ".cc-modal-empty" is gone

Scenario: Add disabled while blank; Ctrl/Cmd+Enter also adds; badge bumps (E2E-22)
  # BEH-12, UI-1a — m-6 applied
  Given the modal body is fully mounted and the footer relocated to ".modal-footer-slot" on a requestAnimationFrame
  When I clear the input
  Then ".cc-modal-add-btn" is disabled
  When I type a draft
  Then the button is enabled
  When I clear, type a new draft, and press Control+Enter in the textarea
  Then a second row appears (count 2) and ".cc-toolbar-btn .cc-badge" is visible with x-text "2"
  And an empty draft + Ctrl+Enter is a no-op (count stays)
```

`[coverage] Group 06: 2/2 asserted, 0 skipped.`

---

## Feature: View popover — view / edit / delete  *(group 07)*

```gherkin
Background:
  Given a fresh chat (m-5) with one anchored comment created via the E2E-13 flow so a single ".cc-highlight" exists

Scenario: Click highlight opens view popover with note + Edit/Delete (E2E-15)
  # BEH-10, UI-6
  When I click the ".cc-highlight" mark
  Then ".cc-popover" is visible, viewport-clamped
  And ".cc-popover-text" === the comment note
  And Edit and Delete actions are present
  When I click outside
  Then ".cc-popover" is removed

Scenario: Edit prefilled — saving non-empty updates and persists (E2E-16)
  # BEH-10 edit
  When I open the popover, click Edit so ".cc-editor" opens prefilled with the current note
  And I change it to "edited note" and Save
  Then the store comment.comment === "edited note"
  And reopening the popover shows the updated ".cc-popover-text"
  And a {action:"load"} after a full page.reload() returns "edited note" (persisted through save_tmp_chat)

Scenario: Empty edit is a no-op; Delete removes highlight and persists (E2E-17)
  # BEH-10, EC-6
  When I open the popover, Edit, clear the field, and Save
  Then the note is unchanged (no-op)
  When I open the popover and Delete
  Then the ".cc-highlight" for that id is gone, the store count decrements, the badge updates
  And a {action:"load"} after reload no longer returns it
```

`[coverage] Group 07: 3/3 asserted, 0 skipped.`

---

## Feature: Prompt-box emission — append, replace, send-all, no-submit  *(group 08)*

```gherkin
Background:
  Given "#message-e2e-msg-1" type:"user" and "#chat-input" present
  And a fresh chat per group (m-5)

Scenario: Selection → "Send to prompt" appends Markdown-blockquoted text + multi-line (E2E-23)
  # BEH-6 Send, BEH-13 append — M-6 applied
  Given I type the exact seed "draft so far" (no trailing space/newline) in "#chat-input"
  When I select "quick brown fox" and choose menu "Send to prompt"
  Then "#chat-input".value === "draft so far\n\n> quick brown fox" (append strips trailing whitespace then joins with "\n\n")
  And chatInputStore.message mirrors it, the caret is at the end, and an input event fired (textarea height adjusted)
  When (multi-line sub-case) I render a second type:"user" message, select a span covering two lines, and choose "Send to prompt"
  Then each selected line is prefixed "> "

Scenario: Send-all uses REPLACE mode, overwriting existing prompt (E2E-24)
  # BEH-13 replace, BEH-14
  Given I pre-seed "#chat-input" with "OLD CONTENT" and add 2 comments (1 anchored, 1 general)
  When I open the modal and click footer "Send to prompt"
  Then "#chat-input".value does NOT contain "OLD CONTENT" (replaced)
  And it starts with "I've left comments on this conversation. Please address each:"

Scenario: Send-all numbered format — anchored vs general, full-string equality (E2E-26)
  # BEH-14 — G-E applied
  Given 1 anchored ("quick brown fox" / note "N1") and 1 general ("G1")
  When I trigger Send-all
  Then "#chat-input".value equals, with full-string equality (not toContain):
    """
    I've left comments on this conversation. Please address each:

    1. Referenced text:
    > quick brown fox
    Comment: N1
    2. General comment: G1
    """
  And the exact whitespace (header trailing \n, leading \n per item, final trimEnd) is pinned from source

Scenario: Send-all closes modal + success toast with count (E2E-27)
  # BEH-14
  When I click footer "Send to prompt"
  Then ".cc-modal-root" is hidden (modal closed)
  And the toast "2 comment(s) sent to prompt." appears in ".toast-item .toast-message"

Scenario: Send-all with 0 comments only toasts, no insertion; footer disabled (E2E-28)
  # BEH-14 — M-5 applied
  Given a fresh chat with the modal open and empty
  Then the footer "Send to prompt" button is :disabled (assert via getByRole or ".modal-footer-slot [data-modal-footer] .btn-ok" toBeDisabled())
  When I force-invoke window.Alpine.store("chatComments").sendAllToPrompt() (the button is unclickable)
  Then the toast "No comments to send yet." appears by message text in ".toast-item .toast-message" regardless of toast styling (guard uses toastFrontendSuccess — do not assume error styling)
  And "#chat-input" is unchanged (no insertion)

Scenario: created_at stored but never surfaced; insertion order; no auto-submit (E2E-29)
  # EC-7, BEH-14 — G-D applied
  Given I add "G1" then "G2"
  Then the modal rows render in insertion order ("G1" precedes "G2")
  And after each ".cc-modal-item" has fully rendered, no digit-cluster resembling an epoch (\b\d{9,}\b) or a date is present (real negative, not a tautology)
  When I trigger Send-all
  Then no chat message is submitted — the message count under "#chat-history" is unchanged and "#chat-input" still holds the text
```

`[coverage] Group 08: 6/6 asserted, 0 skipped.`

---

## Feature: Persistence round-trip, sanitisation, re-anchor & contract errors  *(group 09)*

```gherkin
Background:
  Given persistence is asserted only via {action:"load"} issued after a full page.reload() (proving the save_tmp_chat round-trip, not in-memory state)
  And no dump_live / A0_E2E_DUMP_LIVE route is used
  And status-code pokes use window.fetchApi (returns raw Response, carries CSRF + same-origin creds)

Scenario: Save round-trip survives reload (E2E-18)
  # BEH-11
  Given I add 1 general + 1 anchored comment
  When I do a full page.reload()
  Then {action:"load"} returns both comments with canonical schema (id str, message_id str, quoted_text str, occurrence int, comment str, created_at int)
  And the badge is restored to 2

Scenario: Server sanitisation drops empty/whitespace items, clips to 2000, coerces types (E2E-19)
  # BEH-11 — M-4 applied
  When I POST via fetchApi {action:"save", context:<id>, comments:[{comment:""},{comment:"   "},{comment:"x"*2500, occurrence:"3", created_at:"99", id:7, message_id:42, quoted_text:5},"not-a-dict"]}
  Then the response is {ok:true, count:1}
  And a subsequent load shows exactly 1 item with comment.length===2000, occurrence===3 (int), created_at===99 (int), id==="7", message_id==="42", quoted_text==="5" (all stringified)
  And the empty {comment:""}, the whitespace-only {comment:"   "}, and the "not-a-dict" string are all dropped

Scenario: API contract errors — missing/unknown/bad payload (E2E-20)
  # BEH-11, EC-4 — C-4 applied; fetchApi used because callJsonApi throws on !ok and hides the status
  When I POST {action:"load"} with no context
  Then res.status === 400 and res.text() === "Missing context id"
  When I POST {action:"load", context:"does-not-exist"}
  Then res.status === 404 and text === "Context not found"
  When I POST {action:"save", context:<id>, comments:"x"}
  Then res.status === 400 and text === "comments must be a list"
  When I POST {action:"frobnicate", context:<id>}
  Then res.status === 400 and text === "Unknown action"

Scenario: Auto re-anchor on DOM mutation does not duplicate or lose highlights (E2E-12)
  # BEH-4, BEH-7 — asserted as its own property, NOT a proxy for one-shot bootstrap (M-1)
  Given 1 anchored comment present (1 ".cc-highlight")
  When I append then remove a benign node under "#chat-history" 3 times
  Then after mutations settle (requestAnimationFrame), ".cc-highlight[data-comment-id=<id>]" count === exactly 1

Scenario: Highlight mark shape (E2E-11)
  # UI-5, BEH-7
  Then the rendered highlight is a <mark> with class "cc-highlight" and a data-comment-id matching the store id
  And its computed cursor is "pointer"
```

`[coverage] Group 09: 5/5 asserted, 0 skipped.`

---

## Feature: Re-anchor miss (best-effort) & out-of-scope absences  *(group 10)*

```gherkin
Scenario: Re-anchor miss — comment retained in modal/send-all even when text no longer matches (E2E-25b)
  # EC-3 — proves "data retained, highlight best-effort"
  Given an anchored comment on "quick brown fox" in "#message-e2e-msg-1 .message-text" (type:"user")
  When I rewrite the ".message-text > pre" textContent to "different text entirely" and trigger a re-anchor
  Then NO ".cc-highlight" renders (silent skip — findOccurrenceOffsets returns null)
  But the comment still appears in the modal list (".cc-modal-item") and in Send-all output
  And {action:"load"} after reload still returns it

Scenario: Out-of-scope surfaces are absent — asserted N/A post-render (E2E-30)
  # §4/§6 — G-F applied
  When I open the REAL A0 Settings modal and wait for it to fully render
  Then the rendered Settings shows no "Chat Comments" section (settings_sections: [])
  And there is no per-project config-panel open path for this plugin
  # the absence assertion runs only after the panel mounts (no false pass from absence-before-render)
```

`[coverage] Group 10: 2/2 asserted, 0 skipped.`

---

## Tracked skips (explicitly not-covered, not silently passed)

```gherkin
@needs-source-fix  E2E-5  context switch with NO #chat-history mutation leaves stale comments
                          -> Source gap G-1: reload piggy-backs on DOM mutation; a no-mutation
                             switch cannot be produced deterministically without flake.
                             Tracked: <ISSUE-LINK chat-comments#G-1>

# Accepted gaps (documented, NOT scenarios — no fake-green pass):
#   G-A  observer fallback to document.body (connectObserver) — #chat-history always exists at load;
#        untested, low priority.
#   G-B  client does NOT re-adopt the server's sanitised list (spec G-2) — both sides clip at 2000,
#        divergence near-nil; accepted as untested rather than asserted.
```
