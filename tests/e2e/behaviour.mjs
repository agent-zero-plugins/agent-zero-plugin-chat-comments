// Behaviour test (SPEC DEC-056) — agent-zero-plugin-chat-comments.
// Asserts the plugin's injected chat-top-bar comments button, then its
// deterministic effects: clicking it opens the comments-manager modal, and
// adding a "general comment" inside that modal renders a comment row, bumps
// the top-bar count badge, and enables the modal's "Send to prompt" action.
//
// NOTE: this plugin ships NO config screen (plugin.yaml settings_sections: [],
// default_config.yaml intentionally empty, meta.yaml env: []) — comments live
// per-chat on the AgentContext. So there is no config-panel step to add; the
// enhancement instead exercises the plugin's real client-side feature surface.
export default async function behaviour({ page, expect, baseURL }) {
  await page.goto(baseURL + "/", { waitUntil: "domcontentloaded" });

  // 1. The injected top-bar button appears once the plugin's Alpine store
  //    (chatComments) hydrates the `x-if` template. Extensions load async via
  //    <x-extension> after page load, and the button itself is gated on the
  //    store module finishing its import chain -> generous timeout.
  const btn = page.locator(".cc-toolbar-btn");
  await expect(btn).toBeVisible({ timeout: 20_000 });

  // 2. Effect: clicking the button calls openCommentsModal(), which loads
  //    comments-modal.html and renders its root. .cc-modal-root is present
  //    whether or not any comments exist (a fresh chat shows .cc-modal-empty
  //    "No comments yet." inside it), so this is a clean-install-safe effect.
  await btn.click();
  const modalRoot = page.locator(".cc-modal-root");
  await expect(modalRoot).toBeVisible({ timeout: 10_000 });

  // The modal's "Add a general comment" textarea belongs to this plugin's
  // modal markup — the entry point for the add-comment flow exercised below.
  const addInput = page.locator(".cc-modal-add-input");
  await expect(addInput).toBeVisible({ timeout: 5_000 });

  // On a clean install / fresh chat the modal starts in its empty state.
  await expect(page.locator(".cc-modal-empty")).toBeVisible({ timeout: 5_000 });

  // 3. Enhanced effect: add a "general comment" (not tied to selected text).
  //    Typing + clicking "Add" calls addGeneralComment(), which pushes a
  //    comment into the store, persists it over the wire to
  //    /plugins/chat_comments/comments (action:save), and re-renders the modal.
  //    The Add button is :disabled until the draft is non-empty, so we type
  //    first. We scope the click to the .cc-modal-add row to hit the
  //    .cc-modal-add-btn specifically (there is also a footer "Add"-less
  //    "Send to prompt" button).
  const probe = "e2e probe comment " + Date.now();
  await addInput.fill(probe);

  const addBtn = page.locator(".cc-modal-add .cc-modal-add-btn");
  await expect(addBtn).toBeEnabled({ timeout: 5_000 });
  await addBtn.click();

  // 3a. The newly-added comment renders as a list item carrying our probe text
  //     in its .cc-modal-note. This proves the store mutated + the modal
  //     re-rendered (the list template is x-if'd on comments.length > 0).
  const noteRow = page.locator(".cc-modal-item .cc-modal-note", {
    hasText: probe,
  });
  await expect(noteRow).toBeVisible({ timeout: 10_000 });

  // 3b. A general comment (no quoted_text) is tagged "General".
  await expect(
    page.locator(".cc-modal-item .cc-modal-general-tag"),
  ).toBeVisible({ timeout: 5_000 });

  // 3c. With >= 1 comment, the footer "Send to prompt" action becomes enabled
  //     (it is :disabled while comments.length === 0). This is the gateway to
  //     the plugin's headline "send all comments to the prompt box" feature.
  const sendBtn = page.locator(".modal-footer .btn-ok", {
    hasText: "Send to prompt",
  });
  await expect(sendBtn).toBeEnabled({ timeout: 5_000 });

  // 3d. The top-bar count badge now reflects the comment count (>= 1). The
  //     badge is x-show'd on comments.length and x-text'd with the number.
  const badge = page.locator(".cc-toolbar-btn .cc-badge");
  await expect(badge).toBeVisible({ timeout: 10_000 });

  // 4. Clean up after ourselves so re-runs against the same chat stay in a
  //    predictable shape: delete the comment we just added via its row's
  //    delete button. Best-effort — the core assertions above already passed.
  const delBtn = page
    .locator(".cc-modal-item", { hasText: probe })
    .locator(".cc-modal-del");
  if (await delBtn.count()) {
    await delBtn.first().click();
    await expect(noteRow).toBeHidden({ timeout: 5_000 }).catch(() => {});
  }

  console.log(
    "[behaviour] chat_comments: top-bar button + modal open + add-general-comment " +
      "(row renders, badge bumps, Send-to-prompt enables) ✓",
  );
}
