import { Given, When, Then } from "../../_testkit/e2e/bdd/bdd-fixtures";
import { expect } from "@playwright/test";

let ctx = "";
const NOTE = "Please clarify the second paragraph.";

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

Given("I am in a chat", async ({ loggedInPage }: any) => { await openChat(loggedInPage); });

Then("a comments control is available in the chat toolbar", async ({ loggedInPage }: any) => {
  await expect(loggedInPage.locator(".cc-toolbar-btn")).toBeVisible({ timeout: 12000 });
});

When("I add a comment to the chat", async ({ loggedInPage }: any) => {
  await loggedInPage.evaluate(async (note: string) => {
    const s = (window as any).Alpine.store("chatComments");
    s.newCommentDraft = note;
    s.addGeneralComment();
    // addGeneralComment fires persist() and-forgets; await it so the backend save
    // completes deterministically before any reload (the slow fork raced otherwise).
    if (typeof s.persist === "function") await s.persist();
  }, NOTE);
});

Then("the chat shows it has one comment", async ({ loggedInPage }: any) => {
  await expect(loggedInPage.locator(".cc-badge")).toHaveText("1", { timeout: 8000 });
});

Then("the comment is still there after a reload", async ({ loggedInPage }: any) => {
  await loggedInPage.waitForTimeout(1200); // let persist() round-trip to the backend
  await loggedInPage.goto("/", { waitUntil: "domcontentloaded" });
  await loggedInPage.waitForTimeout(1500);
  await loggedInPage.evaluate((c: string) => (globalThis as any).setContext(c), ctx);
  await waitStore(loggedInPage);
  await loggedInPage.evaluate(() => (window as any).Alpine.store("chatComments").bootstrap());
  await expect(loggedInPage.locator(".cc-badge")).toHaveText("1", { timeout: 10000 });
});

When("I send the comments to the prompt box", async ({ loggedInPage }: any) => {
  await loggedInPage.evaluate(() => (window as any).Alpine.store("chatComments").sendAllToPrompt());
});

Then("the prompt box contains my comment", async ({ loggedInPage }: any) => {
  const val = await loggedInPage.evaluate(() => (document.getElementById("chat-input") as HTMLTextAreaElement)?.value || "");
  expect(val).toContain(NOTE);
});
