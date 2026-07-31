import { Given, When, Then } from "../../_testkit/e2e/bdd/bdd-fixtures";
import { expect } from "@playwright/test";

let ctx = "";
let otherCtx = "";
const NOTE = "Please clarify the second paragraph.";
const EDITED = "Actually, clarify the THIRD paragraph.";
const MSG_TEXT = "The quick brown fox jumps. The lazy dog sleeps nearby.";
const AGENT_TEXT = "Certainly, here is the answer you requested about foxes.";

const waitStore = (page: any) =>
  page.waitForFunction(
    () => !!((window as any).Alpine?.store && (window as any).Alpine.store("chatComments")),
    { timeout: 15000 },
  );

const openChat = async (page: any) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  ctx = await page.evaluate(async () => {
    const { callJsonApi } = await import("/js/api.js");
    const r = await callJsonApi("/chat_create", {});
    const id = (r && (r.ctxid || r.context)) || "";
    if (id) (globalThis as any).setContext(id);
    return id;
  });
  await waitStore(page);
  await page.evaluate(() => (window as any).Alpine.store("chatComments").bootstrap());
};

// Render a deterministic LLM-less message via A0's real renderer, then re-bootstrap
// observation. type: "user" | "agent". Returns the message container id.
const renderMessage = async (page: any, id: string, type: string, content: string) => {
  await page.evaluate(
    async ({ id, type, content }: any) => {
      const m = await import("/js/messages.js");
      await m.setMessage({ id, no: Date.now() % 100000, type, heading: "", content, temp: false, kvps: type === "agent" ? { thoughts: content } : null });
    },
    { id, type, content },
  );
  await page.waitForSelector(`#message-${id}`, { timeout: 10000 });
};

// Select `phrase` inside #message-<id> and create an anchored comment with `note`
// through the plugin's REAL selection pipeline: build the Range the way a user
// selection would, open the plugin's editor via its selection entry point, type, save.
const commentOnPhrase = async (page: any, msgId: string, phrase: string, note: string) => {
  const opened = await page.evaluate(
    ({ msgId, phrase }: any) => {
      const container = document.getElementById(`message-${msgId}`);
      if (!container) return "no-container";
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const idx = (node.textContent || "").indexOf(phrase);
        if (idx >= 0) {
          const range = document.createRange();
          range.setStart(node, idx);
          range.setEnd(node, idx + phrase.length);
          const sel = window.getSelection()!;
          sel.removeAllRanges();
          sel.addRange(range);
          // real trigger: the contextmenu event over the selection is what shows the menu
          const rect = range.getBoundingClientRect();
          const ev = new MouseEvent("contextmenu", {
            bubbles: true, cancelable: true,
            clientX: rect.left + 2, clientY: rect.top + 2,
          });
          (node.parentElement as HTMLElement).dispatchEvent(ev);
          return "ok";
        }
      }
      return "phrase-not-found";
    },
    { msgId, phrase },
  );
  expect(opened).toBe("ok");
  // the plugin menu must be visible — then click its real "Comment" item
  await page.waitForSelector(".cc-menu", { timeout: 5000 });
  await page.locator('.cc-menu .cc-menu-item', { hasText: "Comment" }).first().click();
  await page.waitForSelector(".cc-editor-input", { timeout: 5000 });
  await page.locator(".cc-editor-input").fill(note);
  await page.locator(".cc-editor .cc-btn-primary").click();
  // deterministic backend save before any reload
  await page.evaluate(async () => {
    const s = (window as any).Alpine.store("chatComments");
    if (typeof s.persist === "function") await s.persist();
  });
};

const reloadIntoChat = async (page: any, id: string) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.evaluate((c: string) => (globalThis as any).setContext(c), id);
  await waitStore(page);
  await page.evaluate(() => (window as any).Alpine.store("chatComments").bootstrap());
};

// Open the comments modal through the real toolbar control and wait for the
// add-input to be interactive. Idempotent: no-op when it is already open.
const openCommentsModal = async (page: any) => {
  const input = page.locator(".cc-modal-add-input");
  if (await input.isVisible().catch(() => false)) return;
  await page.locator(".cc-toolbar-btn").click();
  await input.waitFor({ state: "visible", timeout: 15000 });
};

const closeCommentsModal = async (page: any) => {
  await page.evaluate(() => (window as any).Alpine.store("chatComments").closeCommentsModal());
};

// What the user can actually see: rows rendered in the comments modal.
const visibleCommentCount = async (page: any) => {
  await openCommentsModal(page);
  return page.locator(".cc-modal-item").count();
};

// ── Givens ───────────────────────────────────────────────────────────────────

Given("I am in a chat", async ({ loggedInPage }: any) => { await openChat(loggedInPage); });

Given("the chat contains a message from me", async ({ loggedInPage }: any) => {
  await renderMessage(loggedInPage, "e2e-user-1", "user", MSG_TEXT);
});

Given("the chat contains a message from me and a reply from the agent", async ({ loggedInPage }: any) => {
  await renderMessage(loggedInPage, "e2e-user-1", "user", MSG_TEXT);
  // A0 taxonomy: the agent's visible reply is type "response" (renders a
  // message-<id> container). type "agent" is internal reasoning and renders
  // into process-group-<id>, which is not a commentable message surface.
  await renderMessage(loggedInPage, "e2e-agent-1", "response", AGENT_TEXT);
});

Given("I have commented on a phrase inside that message", async ({ loggedInPage }: any) => {
  await commentOnPhrase(loggedInPage, "e2e-user-1", "quick brown fox", NOTE);
});

// ── Whens ────────────────────────────────────────────────────────────────────

When("I add a comment to the chat", async ({ loggedInPage }: any) => {
  // real path: toolbar button → modal → type in the add input → click Add.
  // No store poking and no manual persist(): if the real flow does not save,
  // the reload assertions must catch it.
  await openCommentsModal(loggedInPage);
  const before = await loggedInPage.locator(".cc-modal-item").count();
  await loggedInPage.locator(".cc-modal-add-input").fill(NOTE);
  await loggedInPage.locator(".cc-modal-add-btn").click();
  // end state: the row is rendered in the list the user is looking at
  await expect(loggedInPage.locator(".cc-modal-item")).toHaveCount(before + 1);
});

When("I comment on a phrase inside that message", async ({ loggedInPage }: any) => {
  await commentOnPhrase(loggedInPage, "e2e-user-1", "quick brown fox", NOTE);
});

When("I comment on two different phrases inside that message", async ({ loggedInPage }: any) => {
  await commentOnPhrase(loggedInPage, "e2e-user-1", "quick brown fox", "first note");
  await commentOnPhrase(loggedInPage, "e2e-user-1", "lazy dog", "second note");
});

When("I comment on a phrase in each of them", async ({ loggedInPage }: any) => {
  await commentOnPhrase(loggedInPage, "e2e-user-1", "quick brown fox", "on my message");
  await commentOnPhrase(loggedInPage, "e2e-agent-1", "answer you requested", "on the agent reply");
});

When("I change the comment's note", async ({ loggedInPage }: any) => {
  // real path: click the highlight → popover → Edit → editor prefilled → save
  await loggedInPage.locator(".cc-highlight").first().click();
  await loggedInPage.waitForSelector(".cc-popover", { timeout: 5000 });
  await loggedInPage.locator(".cc-popover .cc-btn", { hasText: "Edit" }).click();
  await loggedInPage.waitForSelector(".cc-editor-input", { timeout: 5000 });
  await loggedInPage.locator(".cc-editor-input").fill(EDITED);
  await loggedInPage.locator(".cc-editor .cc-btn-primary").click();
  await loggedInPage.evaluate(async () => {
    const s = (window as any).Alpine.store("chatComments");
    if (typeof s.persist === "function") await s.persist();
  });
});

When("I delete that comment", async ({ loggedInPage }: any) => {
  // real path: the comments modal is already open from the add step; click the
  // row's delete control. No manual persist(): the real flow must save the
  // deletion by itself or the reload assertion has to catch it.
  await openCommentsModal(loggedInPage);
  const rows = loggedInPage.locator(".cc-modal-item");
  const before = await rows.count();
  expect(before).toBeGreaterThan(0);
  await loggedInPage.locator(".cc-modal-del").first().click();
  // end state: the row the user clicked is gone from the list
  await expect(rows).toHaveCount(before - 1);
  await closeCommentsModal(loggedInPage);
});

When("I switch to a different chat", async ({ loggedInPage }: any) => {
  otherCtx = await loggedInPage.evaluate(async () => {
    const { callJsonApi } = await import("/js/api.js");
    const r = await callJsonApi("/chat_create", {});
    const id = (r && (r.ctxid || r.context)) || "";
    if (id) (globalThis as any).setContext(id);
    return id;
  });
  expect(otherCtx).not.toBe("");
  // BEH-3: the reload piggybacks on a #chat-history mutation — provoke one, as a
  // real chat switch repaint would
  await loggedInPage.evaluate(() => {
    const h = document.getElementById("chat-history");
    if (h) { const d = document.createElement("div"); h.appendChild(d); d.remove(); }
  });
  await loggedInPage.waitForFunction(
    (c: string) => (window as any).Alpine.store("chatComments").contextId === c,
    otherCtx,
    { timeout: 10000 },
  );
});

When("I switch back to the first chat", async ({ loggedInPage }: any) => {
  await loggedInPage.evaluate((c: string) => (globalThis as any).setContext(c), ctx);
  await loggedInPage.evaluate(() => {
    const h = document.getElementById("chat-history");
    if (h) { const d = document.createElement("div"); h.appendChild(d); d.remove(); }
  });
  await loggedInPage.waitForFunction(
    (c: string) => (window as any).Alpine.store("chatComments").contextId === c,
    ctx,
    { timeout: 10000 },
  );
});

When("I try to add an empty comment", async ({ loggedInPage }: any) => {
  // real path: type whitespace into the add input and try to submit. The UI
  // guards this by disabling the button, so the attempt cannot land.
  await openCommentsModal(loggedInPage);
  await loggedInPage.locator(".cc-modal-add-input").fill("   ");
  await expect(loggedInPage.locator(".cc-modal-add-btn")).toBeDisabled();
  await loggedInPage.locator(".cc-modal-add-btn").click({ force: true });
  await closeCommentsModal(loggedInPage);
});

When("I send the comments to the prompt box", async ({ loggedInPage }: any) => {
  await loggedInPage.evaluate(() => (window as any).Alpine.store("chatComments").sendAllToPrompt());
});

// API negative pokes — raw fetchApi so status codes are observable
const poke = async (page: any, body: any) =>
  page.evaluate(async (b: any) => {
    const { fetchApi } = await import("/js/api.js");
    const res = await fetchApi("/plugins/chat_comments/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    });
    return { status: res.status, text: await res.text() };
  }, body);

let lastPoke: { status: number; text: string } = { status: 0, text: "" };

When("the comments service is asked without saying which chat", async ({ loggedInPage }: any) => {
  lastPoke = await poke(loggedInPage, { action: "load" });
});

When("the comments service is asked about a chat that does not exist", async ({ loggedInPage }: any) => {
  lastPoke = await poke(loggedInPage, { action: "load", context: "does-not-exist-e2e" });
});

When("the comments service is given comments that are not a list", async ({ loggedInPage }: any) => {
  lastPoke = await poke(loggedInPage, { action: "save", context: ctx, comments: "nope" });
});

// ── Thens ────────────────────────────────────────────────────────────────────

Then("a comments control is available in the chat toolbar", async ({ loggedInPage }: any) => {
  await expect(loggedInPage.locator(".cc-toolbar-btn")).toBeVisible({ timeout: 12000 });
});

Then("the chat shows it has one comment", async ({ loggedInPage }: any) => {
  await expect(loggedInPage.locator(".cc-badge")).toHaveText("1", { timeout: 8000 });
});

Then("the chat shows it has two comments", async ({ loggedInPage }: any) => {
  await expect(loggedInPage.locator(".cc-badge")).toHaveText("2", { timeout: 8000 });
});

Then("the chat shows it has no comments", async ({ loggedInPage }: any) => {
  // user-visible end state: badge hidden, and the modal says there are none
  await expect(loggedInPage.locator(".cc-badge")).toBeHidden({ timeout: 8000 });
  await openCommentsModal(loggedInPage);
  await expect(loggedInPage.locator(".cc-modal-item")).toHaveCount(0);
  await expect(loggedInPage.locator(".cc-modal-empty")).toBeVisible();
  await closeCommentsModal(loggedInPage);
});

Then("that chat shows no comments", async ({ loggedInPage }: any) => {
  // the freshly-switched-to chat carries none of the first chat's comments
  await expect(loggedInPage.locator(".cc-badge")).toBeHidden({ timeout: 10000 });
  await openCommentsModal(loggedInPage);
  await expect(loggedInPage.locator(".cc-modal-item")).toHaveCount(0);
  await closeCommentsModal(loggedInPage);
});

Then("the comment is still there after a reload", async ({ loggedInPage }: any) => {
  await loggedInPage.waitForTimeout(1200);
  await reloadIntoChat(loggedInPage, ctx);
  await expect(loggedInPage.locator(".cc-badge")).toHaveText("1", { timeout: 10000 });
});

Then("the comment is gone after a reload", async ({ loggedInPage }: any) => {
  await reloadIntoChat(loggedInPage, ctx);
  await expect(loggedInPage.locator(".cc-badge")).toBeHidden({ timeout: 10000 });
  expect(await visibleCommentCount(loggedInPage)).toBe(0);
  await closeCommentsModal(loggedInPage);
});

Then("the phrase is highlighted in the message", async ({ loggedInPage }: any) => {
  const mark = loggedInPage.locator("#message-e2e-user-1 mark.cc-highlight");
  await expect(mark).toHaveCount(1, { timeout: 8000 });
  await expect(mark).toHaveText("quick brown fox");
});

Then("both phrases are highlighted in the message", async ({ loggedInPage }: any) => {
  await expect(loggedInPage.locator("#message-e2e-user-1 mark.cc-highlight")).toHaveCount(2, { timeout: 8000 });
});

Then("each commented phrase is highlighted in its own message", async ({ loggedInPage }: any) => {
  await expect(loggedInPage.locator("#message-e2e-user-1 mark.cc-highlight")).toHaveCount(1, { timeout: 8000 });
  await expect(loggedInPage.locator("#message-e2e-agent-1 mark.cc-highlight")).toHaveCount(1, { timeout: 8000 });
});

Then("the comment records which text it refers to", async ({ loggedInPage }: any) => {
  const rec = await loggedInPage.evaluate(
    () => (window as any).Alpine.store("chatComments").comments[0],
  );
  expect(rec.quoted_text).toBe("quick brown fox");
  expect(rec.message_id).toBe("e2e-user-1");
});

Then("the comment list attributes the comment to the quoted text", async ({ loggedInPage }: any) => {
  await loggedInPage.locator(".cc-toolbar-btn").click();
  const quote = loggedInPage.locator(".cc-modal-item .cc-modal-quote");
  await expect(quote).toHaveCount(1, { timeout: 8000 });
  await expect(quote).toContainText("quick brown fox");
  await loggedInPage.evaluate(() => (window as any).Alpine.store("chatComments").closeCommentsModal());
});

Then("the stored comment carries a creation timestamp", async ({ loggedInPage }: any) => {
  // end state: created_at persisted as a plausible unix-seconds integer
  await loggedInPage.waitForTimeout(800);
  const rec = await loggedInPage.evaluate(async (c: string) => {
    const { callJsonApi } = await import("/js/api.js");
    const r = await callJsonApi("/plugins/chat_comments/comments", { action: "load", context: c });
    return r.comments[0];
  }, ctx);
  expect(Number.isInteger(rec.created_at)).toBe(true);
  expect(rec.created_at).toBeGreaterThan(1600000000);
});

Then("the comment shows the updated note", async ({ loggedInPage }: any) => {
  await loggedInPage.locator(".cc-highlight").first().click();
  await expect(loggedInPage.locator(".cc-popover-text")).toHaveText(EDITED, { timeout: 5000 });
  await loggedInPage.locator("body").click({ position: { x: 4, y: 4 } });
});

Then("the updated note survives a reload", async ({ loggedInPage }: any) => {
  await loggedInPage.waitForTimeout(1200);
  await reloadIntoChat(loggedInPage, ctx);
  const rec = await loggedInPage.evaluate(async (c: string) => {
    const { callJsonApi } = await import("/js/api.js");
    const r = await callJsonApi("/plugins/chat_comments/comments", { action: "load", context: c });
    return r.comments[0];
  }, ctx);
  expect(rec.comment).toBe(EDITED);
});

Then("it refuses the request as invalid", async () => {
  expect(lastPoke.status).toBe(400);
});

Then("it reports the chat as not found", async () => {
  expect(lastPoke.status).toBe(404);
});

Then("the prompt box contains my comment", async ({ loggedInPage }: any) => {
  const val = await loggedInPage.evaluate(
    () => (document.getElementById("chat-input") as HTMLTextAreaElement)?.value || "",
  );
  expect(val).toContain(NOTE);
});
