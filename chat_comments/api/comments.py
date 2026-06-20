from __future__ import annotations

from agent import AgentContext
from helpers.api import ApiHandler, Input, Output, Request, Response
from helpers.persist_chat import save_tmp_chat
from usr.plugins.chat_comments.helpers.constants import DATA_KEY, MAX_COMMENT_LENGTH


class Comments(ApiHandler):
    async def process(self, input: Input, request: Request) -> Output:
        action = str(input.get("action", "")).strip().lower()
        ctxid = str(input.get("context", "")).strip()

        if not ctxid:
            return Response("Missing context id", 400)

        context = AgentContext.get(ctxid)
        if not context:
            return Response("Context not found", 404)

        if action == "load":
            comments = context.data.get(DATA_KEY, [])
            if not isinstance(comments, list):
                comments = []
            return {"ok": True, "context": context.id, "comments": comments}

        if action == "save":
            raw = input.get("comments")
            if not isinstance(raw, list):
                return Response("comments must be a list", 400)

            cleaned = []
            for item in raw:
                if not isinstance(item, dict):
                    continue
                comment_text = str(item.get("comment", "")).strip()[:MAX_COMMENT_LENGTH]
                quoted_text = str(item.get("quoted_text", ""))
                message_id = str(item.get("message_id", ""))
                # Only the comment text is required. Anchored comments also carry
                # quoted_text + message_id; general comments leave them empty.
                if not comment_text:
                    continue
                cleaned.append(
                    {
                        "id": str(item.get("id", "")),
                        "message_id": message_id,
                        "quoted_text": quoted_text,
                        "occurrence": int(item.get("occurrence", 0) or 0),
                        "comment": comment_text,
                        "created_at": int(item.get("created_at", 0) or 0),
                    }
                )

            context.data[DATA_KEY] = cleaned
            save_tmp_chat(context)
            return {"ok": True, "context": context.id, "count": len(cleaned)}

        return Response("Unknown action", 400)
