# Security Policy

## What this plugin stores and where

Chat Comments stores comment records **inside the Agent Zero chat they belong to**:

- In memory: `AgentContext.data["chat_comments"]` — a list of `{id, message_id, quoted_text, occurrence, comment, created_at}` records.
- On disk: persisted by A0's own chat persistence (`save_tmp_chat`) into `/a0/usr/chats/<context-id>/chat.json` on the machine running Agent Zero.

Comment text may quote fragments of your chat (`quoted_text`). Treat comment data with the same sensitivity as the chat itself.

## What leaves the machine

**Nothing.** The plugin makes no external network calls. All traffic is browser ↔ your own A0 instance (`POST /plugins/chat_comments/comments`). There is no telemetry, no third-party service, no CDN dependency at runtime.

## API surface & auth

The single API handler (`api/comments.py`) uses Agent Zero's default `ApiHandler` posture: it requires an authenticated A0 web session and CSRF token, and is scoped to contexts resolvable by your own instance. It does not accept an API key path.

## Reporting a vulnerability

Please open a **private security advisory** on this repository (GitHub → Security → Advisories → "Report a vulnerability"). Do not open public issues for security reports. We aim to respond within 7 days.
