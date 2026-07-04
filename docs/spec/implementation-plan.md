# chat-comments — Implementation plan

Product internals (counterpart to `e2e-steps-spec.md`).

## Components
| Component | Path | Responsibility |
|---|---|---|
| Toolbar button | `extensions/webui/chat-top-end/chat-comments-mount.html` | Mounts `.cc-toolbar-btn` (+ `.cc-badge` count); opens the comments modal. |
| Store | `webui/chat-comments-store.js` | Alpine store `chatComments`: load/persist, selection menu, anchored highlights, editor, and the comments modal + general comments. |
| Anchoring | `webui/anchoring.js` | Occurrence-correct range → highlight mapping. |
| Backend | `api/comments.py` | `POST /plugins/chat_comments/comments` with `action: load|save`, keyed by context. |

## Internals (behaviours the e2e drives)
- **Load/persist:** `loadForCurrentContext()` (`action: load`) and `persist()` (`action: save`) round-trip
  the comment set through the backend, keyed by the chat context — comments survive reloads.
- **General comment:** `addGeneralComment()` pushes `{id, comment, quoted_text:""}` from `newCommentDraft`
  and persists (a comment not tied to a text selection).
- **Send all:** `sendAllToPrompt()` composes a prompt summarising every comment and drops it into
  `#chat-input` (replace mode).
- **Anchored comments (selection flow):** `onContextMenu` → `showMenu` → `startComment` → `openEditor` →
  occurrence-correct highlight via `anchoring.js`. Covered in the design docs; the runnable suite exercises
  the non-selection core (mount, create, persist, send).

## Dependencies
Backend API + the `chat-top-end` extension point. No CDN, no fork seam.
