# agent-zero-plugin-chat-comments

Source repo for the **Chat Comments** Agent Zero plugin.

Select text inside a chat message, right-click, and attach a comment to it —
Google-Docs style. Comments are highlighted inline, persist on the chat, and can
be edited or deleted from a popover. A button in the chat top bar opens a comments
manager and sends all comments to the prompt box as a single numbered instruction.

## Features

- **Right-click on selected message text** → custom context menu (overrides native):
  - **Comment** — attach a note to the selection (highlighted inline, occurrence-indexed).
  - **Copy text** — copy the selection to the clipboard.
  - **Send to prompt** — insert the selection, quoted, into the prompt box.
- **Inline highlights** re-anchor on reload (best-effort), one comment per span.
- **Popover** on each highlight: view / edit / delete.
- **Top-bar 💬 button** with a count badge → opens a modal listing every comment
  (referenced text trimmed), where you can delete entries, add a **general comment**
  not tied to any text, and **Send to prompt** (a numbered prompt of all comments).
- Comments persist per-chat on the `AgentContext` (`context.data["chat_comments"]`),
  saved via `save_tmp_chat` — the same mechanism the `chat_rename` plugin uses.

## Architecture

Pure WebUI plugin (`webui/` + `extensions/webui/chat-top-end/`) plus one thin
`load`/`save` API handler (`api/comments.py`). No agent-side code, no secrets.

| Path | Responsibility |
|---|---|
| `chat_comments/api/comments.py` | `load` / `save` the per-chat comment list |
| `chat_comments/webui/anchoring.js` | DOM offset ↔ occurrence ↔ highlight helpers |
| `chat_comments/webui/chat-comments-store.js` | Alpine store: menu, popovers, anchoring, send-all |
| `chat_comments/webui/comments-modal.html` | Comments manager modal |
| `chat_comments/extensions/webui/chat-top-end/chat-comments-mount.html` | Top-bar button + bootstrap + styles |

## Build

```bash
make plugin-info   # name + version + output path
make plugin-zip    # build dist/chat_comments-<version>.zip for gate submission
make test          # smoke tests (a0_plugin_testkit)
```

## Publishing

`make plugin-zip`, then PR `plugins/chat_comments.zip` + `plugins/chat_comments.meta.yaml`
into [`agent-zero-vendor-plugins`](https://github.com/agent-zero-plugins/agent-zero-vendor-plugins).
Merging publishes `ghcr.io/agent-zero-plugins/chat_comments:<version>`, consumable from any
`agent-zero-infra` env via `agent.plugins.oci[]`.

## License

See [LICENSE](LICENSE).
