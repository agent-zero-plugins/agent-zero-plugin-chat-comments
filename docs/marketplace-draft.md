# Plugin Index submission draft — chat_comments

Staged assets for the eventual PR to `agent0ai/a0-plugins` (folder `plugins/chat_comments/`).
**Do not open the marketplace PR until the repo is flipped public.**

## index.yaml (staged)

```yaml
title: Chat Comments
description: >-
  Select text in any chat message and attach Google-Docs-style comments to it.
  Comments are highlighted inline, listed in a manager modal, persisted per chat
  (surviving reloads and chat switches), and can be sent to the prompt box as a
  single numbered review request for the agent to address. Zero-config; no data
  leaves your machine.
github: https://github.com/agent-zero-plugins/agent-zero-plugin-chat-comments
tags:
  - tools
  - workflow
  - ux
  - review
  - productivity
screenshots:
  - https://raw.githubusercontent.com/agent-zero-plugins/agent-zero-plugin-chat-comments/main/docs/screenshot-comment.png
  - https://raw.githubusercontent.com/agent-zero-plugins/agent-zero-plugin-chat-comments/main/docs/screenshot-modal.png
```

- **title**: `Chat Comments` (13 chars — within 50).
- **description**: 330 chars — within the 500-char limit.
- **tags**: 5 (max allowed). Confirm against `TAGS.md` at submission time; drop any not on the canonical
  list (candidates to keep if trimming: `tools`, `workflow`, `productivity`).
- **index.yaml total**: well within 2000 chars.

## Thumbnail

`usr/plugins/chat_comments/webui/thumbnail.png` — square 512×512, 2,751 bytes (< 20 KB). Ships inside
the plugin; copy to `plugins/chat_comments/thumbnail.png` in the index submission if a card image is
wanted there too.

## Screenshots — capture at flip time (TODO before/at public flip)

The two `screenshots:` URLs above will **404 until the repo is public** (raw.githubusercontent.com only
serves public repos). They are **not yet committed** — capture them against a live Agent Zero with the
plugin installed, because honest marketplace screenshots must be real UI, not mockups:

1. `docs/screenshot-comment.png` — a chat message with a highlighted phrase and the view popover
   (note + Edit/Delete) open, plus the toolbar badge showing a count.
2. `docs/screenshot-modal.png` — the comments manager modal listing one anchored comment (with its
   quoted text) and one **General** comment, with the *Send to prompt* footer.

Capture recipe (once a live A0 is reachable with credentials): log in → new chat → send a message →
select text → **Comment** → screenshot; open the comments button → screenshot the modal. The e2e BDD
suite already drives exactly these flows (`tests/e2e/features/10-comments.feature`), so the same steps
produce the screenshots.

## Pre-submission checklist (mirrors a0-contribute-plugin CI)

- [x] Remote `plugin.yaml` exists at repo root-of-plugin with `name: chat_comments`.
- [x] Remote `LICENSE` present (Apache-2.0, full canonical text).
- [x] Folder name `chat_comments` matches `^[a-z0-9_]+$`, no leading `_`.
- [ ] `github` URL public & unique in the index (verify at flip time).
- [ ] Screenshots committed and reachable (capture at flip time).
- [ ] `index.yaml` is the only file (plus optional thumbnail) in `plugins/chat_comments/`.
