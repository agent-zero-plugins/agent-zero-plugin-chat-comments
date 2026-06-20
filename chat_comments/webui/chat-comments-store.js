import { createStore } from "/js/AlpineStore.js";
import { callJsonApi } from "/js/api.js";
import { store as chatsStore } from "/components/sidebar/chats/chats-store.js";
import { store as chatInputStore } from "/components/chat/input/input-store.js";
import {
  toastFrontendError,
  toastFrontendSuccess,
} from "/components/notifications/notification-store.js";
import { openModal, closeModal } from "/js/modals.js";
import {
  getMessageContainer,
  rangeStartOffset,
  occurrenceForStart,
  findOccurrenceOffsets,
  wrapOffsets,
  clearHighlights,
  rangeIntersectsHighlights,
} from "/plugins/chat_comments/webui/anchoring.js";

const API_PATH = "/plugins/chat_comments/comments";
const COMMENTS_MODAL_PATH = "/plugins/chat_comments/webui/comments-modal.html";
const HIGHLIGHT_CLASS = "cc-highlight";
const MAX_COMMENT_LENGTH = 2000;

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "cc-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function quoteText(text) {
  return String(text || "")
    .split("\n")
    .map((line) => "> " + line)
    .join("\n");
}

const model = {
  comments: [],
  contextId: "",
  newCommentDraft: "",
  _bootstrapped: false,
  _historyObserver: null,
  _reanchorScheduled: false,

  bootstrap() {
    if (this._bootstrapped) return;
    this._bootstrapped = true;
    document.addEventListener("contextmenu", (e) => this.onContextMenu(e));
    document.addEventListener("click", (e) => this.onDocumentClick(e));
    this._historyObserver = new MutationObserver(() => this.scheduleReanchor());
    this.connectObserver();
    void this.loadForCurrentContext();
  },

  connectObserver() {
    const hist = document.getElementById("chat-history") || document.body;
    this._historyObserver?.observe(hist, { childList: true, subtree: true });
  },

  getContextId() {
    return chatsStore?.getSelectedChatId?.() || globalThis.getContext?.() || "";
  },

  async loadForCurrentContext() {
    const ctx = this.getContextId();
    if (!ctx) return;
    this.contextId = ctx;
    try {
      const res = await callJsonApi(API_PATH, { action: "load", context: ctx });
      this.comments = Array.isArray(res?.comments) ? res.comments : [];
    } catch (e) {
      this.comments = [];
    }
    this.scheduleReanchor();
  },

  async persist() {
    const ctx = this.contextId || this.getContextId();
    if (!ctx) return;
    try {
      await callJsonApi(API_PATH, {
        action: "save",
        context: ctx,
        comments: this.comments,
      });
    } catch (e) {
      await toastFrontendError(
        e?.message || "Failed to save comment.",
        "Chat Comments",
      );
    }
  },

  scheduleReanchor() {
    if (this._reanchorScheduled) return;
    this._reanchorScheduled = true;
    globalThis.requestAnimationFrame(() => {
      this._reanchorScheduled = false;
      const ctx = this.getContextId();
      if (ctx && ctx !== this.contextId) {
        void this.loadForCurrentContext();
        return;
      }
      this.reanchorAll();
    });
  },

  reanchorAll() {
    // Disconnect so our own DOM writes don't retrigger the observer.
    this._historyObserver?.disconnect();
    try {
      clearHighlights(document, HIGHLIGHT_CLASS);
      for (const c of this.comments) {
        const container = document.getElementById("message-" + c.message_id);
        if (!container) continue;
        const text = container.textContent || "";
        const off = findOccurrenceOffsets(text, c.quoted_text, c.occurrence || 0);
        if (!off) continue;
        wrapOffsets(container, off.start, off.end, c.id, HIGHLIGHT_CLASS);
      }
    } catch (e) {
      console.error("chat_comments reanchor failed", e);
    } finally {
      this.connectObserver();
    }
  },

  insertIntoPrompt(text, mode = "append") {
    const input = document.getElementById("chat-input");
    if (!input) return;
    let next;
    if (mode === "replace") {
      next = text;
    } else {
      const existing = (input.value || "").replace(/\s*$/, "");
      next = existing ? existing + "\n\n" + text : text;
    }
    input.value = next;
    chatInputStore.message = next;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    chatInputStore.adjustTextareaHeight?.();
    input.focus();
    input.setSelectionRange(next.length, next.length);
  },

  // ---- context menu ----

  onContextMenu(e) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      this.hideMenu();
      return; // let the native menu show
    }
    const range = sel.getRangeAt(0);
    const container = getMessageContainer(range.startContainer);
    if (!container) {
      this.hideMenu();
      return; // selection not inside a message: native menu
    }
    e.preventDefault();
    this._savedRange = range.cloneRange();
    this._savedText = sel.toString();
    this._savedContainer = container;
    this.showMenu(e.clientX, e.clientY);
  },

  onDocumentClick(e) {
    if (this._menuEl && !this._menuEl.contains(e.target)) this.hideMenu();

    const mark = e.target.closest && e.target.closest("." + HIGHLIGHT_CLASS);
    if (mark) {
      e.stopPropagation();
      this.openViewPopover(mark);
      return;
    }
    if (this._popoverEl && !this._popoverEl.contains(e.target)) {
      this.closePopover();
    }
  },

  showMenu(x, y) {
    this.hideMenu();
    const menu = document.createElement("div");
    menu.className = "cc-menu";
    const items = [
      { label: "Comment", fn: () => this.startComment() },
      { label: "Copy text", fn: () => this.copySelection() },
      { label: "Send to prompt", fn: () => this.sendSelectionToPrompt() },
    ];
    for (const it of items) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cc-menu-item";
      b.textContent = it.label;
      b.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.hideMenu();
        it.fn();
      });
      menu.appendChild(b);
    }
    document.body.appendChild(menu);
    this._menuEl = menu;
    // Clamp within viewport.
    const rect = menu.getBoundingClientRect();
    const px = Math.min(x, window.innerWidth - rect.width - 8);
    const py = Math.min(y, window.innerHeight - rect.height - 8);
    menu.style.left = px + "px";
    menu.style.top = py + "px";
  },

  hideMenu() {
    if (this._menuEl) {
      this._menuEl.remove();
      this._menuEl = null;
    }
  },

  async copySelection() {
    try {
      await navigator.clipboard.writeText(this._savedText || "");
      await toastFrontendSuccess("Copied to clipboard.", "Chat Comments");
    } catch (e) {
      await toastFrontendError("Copy failed.", "Chat Comments");
    }
  },

  sendSelectionToPrompt() {
    const text = this._savedText || "";
    if (!text.trim()) return;
    this.insertIntoPrompt(quoteText(text), "append");
  },

  // ---- create comment ----

  startComment() {
    const range = this._savedRange;
    const container = this._savedContainer;
    const text = this._savedText;
    if (!range || !container || !text || !text.trim()) return;

    if (rangeIntersectsHighlights(range, container, HIGHLIGHT_CLASS)) {
      void toastFrontendError(
        "That text already has a comment.",
        "Chat Comments",
      );
      return;
    }

    const messageId = container.id.replace(/^message-/, "");
    const startOffset = rangeStartOffset(container, range);
    const occurrence = occurrenceForStart(
      container.textContent || "",
      text,
      startOffset,
    );

    const rect = range.getBoundingClientRect();
    this.openEditor(rect, "", (value) => {
      const note = value.trim().slice(0, MAX_COMMENT_LENGTH);
      if (!note) return;
      this.comments.push({
        id: uuid(),
        message_id: messageId,
        quoted_text: text,
        occurrence,
        comment: note,
        created_at: Math.floor(Date.now() / 1000),
      });
      void this.persist();
      this.scheduleReanchor();
    });
  },

  openEditor(anchorRect, initialValue, onSave) {
    this.closeEditor();
    const box = document.createElement("div");
    box.className = "cc-editor";

    const ta = document.createElement("textarea");
    ta.className = "cc-editor-input";
    ta.value = initialValue || "";
    ta.placeholder = "Add a comment…";
    box.appendChild(ta);

    const row = document.createElement("div");
    row.className = "cc-editor-actions";

    const save = document.createElement("button");
    save.type = "button";
    save.className = "cc-btn cc-btn-primary";
    save.textContent = "Save";
    save.addEventListener("click", (e) => {
      e.stopPropagation();
      const v = ta.value;
      this.closeEditor();
      onSave(v);
    });

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "cc-btn";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", (e) => {
      e.stopPropagation();
      this.closeEditor();
    });

    row.appendChild(save);
    row.appendChild(cancel);
    box.appendChild(row);

    box.addEventListener("click", (e) => e.stopPropagation());
    document.body.appendChild(box);
    this._editorEl = box;

    const rect = box.getBoundingClientRect();
    const left = Math.min(
      Math.max(8, anchorRect.left),
      window.innerWidth - rect.width - 8,
    );
    const top = Math.min(
      anchorRect.bottom + 6,
      window.innerHeight - rect.height - 8,
    );
    box.style.left = left + "px";
    box.style.top = top + "px";
    ta.focus();
  },

  closeEditor() {
    if (this._editorEl) {
      this._editorEl.remove();
      this._editorEl = null;
    }
  },

  // ---- view / edit / delete ----

  openViewPopover(mark) {
    this.closePopover();
    const id = mark.dataset.commentId;
    const comment = this.comments.find((c) => c.id === id);
    if (!comment) return;

    const box = document.createElement("div");
    box.className = "cc-popover";
    box.addEventListener("click", (e) => e.stopPropagation());

    const body = document.createElement("div");
    body.className = "cc-popover-text";
    body.textContent = comment.comment;
    box.appendChild(body);

    const row = document.createElement("div");
    row.className = "cc-popover-actions";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "cc-btn";
    edit.textContent = "Edit";
    edit.addEventListener("click", (e) => {
      e.stopPropagation();
      const rect = mark.getBoundingClientRect();
      this.closePopover();
      this.openEditor(rect, comment.comment, (value) => {
        this.editComment(id, value);
      });
    });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "cc-btn cc-btn-danger";
    del.textContent = "Delete";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      this.closePopover();
      this.deleteComment(id);
    });

    row.appendChild(edit);
    row.appendChild(del);
    box.appendChild(row);

    document.body.appendChild(box);
    this._popoverEl = box;

    const anchor = mark.getBoundingClientRect();
    const rect = box.getBoundingClientRect();
    const left = Math.min(
      Math.max(8, anchor.left),
      window.innerWidth - rect.width - 8,
    );
    const top = Math.min(
      anchor.bottom + 6,
      window.innerHeight - rect.height - 8,
    );
    box.style.left = left + "px";
    box.style.top = top + "px";
  },

  closePopover() {
    if (this._popoverEl) {
      this._popoverEl.remove();
      this._popoverEl = null;
    }
  },

  editComment(id, value) {
    const note = (value || "").trim().slice(0, MAX_COMMENT_LENGTH);
    const comment = this.comments.find((c) => c.id === id);
    if (!comment) return;
    if (!note) return; // empty edit is a no-op (delete is explicit)
    comment.comment = note;
    void this.persist();
  },

  deleteComment(id) {
    this.comments = this.comments.filter((c) => c.id !== id);
    void this.persist();
    this.scheduleReanchor();
  },

  // ---- comments manager modal ----

  openCommentsModal() {
    void openModal(COMMENTS_MODAL_PATH);
  },

  closeCommentsModal() {
    closeModal(COMMENTS_MODAL_PATH);
  },

  // Collapse whitespace and clip to `n` chars for compact display in the modal.
  truncate(text, n) {
    const s = String(text || "").replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n) + "…" : s;
  },

  // Add a general comment not tied to any selected text.
  addGeneralComment() {
    const note = (this.newCommentDraft || "").trim().slice(0, MAX_COMMENT_LENGTH);
    if (!note) return;
    this.comments.push({
      id: uuid(),
      message_id: "",
      quoted_text: "",
      occurrence: 0,
      comment: note,
      created_at: Math.floor(Date.now() / 1000),
    });
    this.newCommentDraft = "";
    void this.persist();
  },

  // ---- send all ----

  sendAllToPrompt() {
    if (!this.comments.length) {
      void toastFrontendSuccess("No comments to send yet.", "Chat Comments");
      return;
    }
    let out = "I've left comments on this conversation. Please address each:\n";
    this.comments.forEach((c, i) => {
      if (c.quoted_text) {
        out +=
          "\n" +
          (i + 1) +
          ". Referenced text:\n" +
          quoteText(c.quoted_text) +
          "\nComment: " +
          c.comment +
          "\n";
      } else {
        out += "\n" + (i + 1) + ". General comment: " + c.comment + "\n";
      }
    });
    this.insertIntoPrompt(out.trimEnd(), "replace");
    this.closeCommentsModal();
    void toastFrontendSuccess(
      this.comments.length + " comment(s) sent to prompt.",
      "Chat Comments",
    );
  },
};

export const store = createStore("chatComments", model);
