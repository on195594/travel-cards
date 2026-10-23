import assert from "node:assert/strict";

// Requires a logged-in Playwright page in Asia/Shanghai and a two-day synthetic guide.
export async function checkEditorUi(page, origin, guideId) {
  assert.equal(new URL(origin).hostname, "127.0.0.1", "Use an isolated local preview");
  const unexpectedDialogs = [];
  const dismissUnexpected = async dialog => { unexpectedDialogs.push(dialog.type()); await dialog.dismiss(); };
  page.on("dialog", dismissUnexpected);
  async function confirmAction(action, type, accept = false) {
    page.off("dialog", dismissUnexpected);
    const waiting = page.waitForEvent("dialog");
    const navigating = action().catch(() => {}); // Cancelling a document navigation may reject Playwright's wait.
    try {
      const dialog = await waiting;
      assert.equal(dialog.type(), type);
      if (accept) await dialog.accept();
      else await dialog.dismiss();
      await navigating;
    } finally {
      page.on("dialog", dismissUnexpected);
    }
  }
  const editorUrl = `${origin}/admin/guides/${guideId}`;
  try {
    await page.goto(`${origin}/admin/guides`);
    await page.locator(`a[aria-label][href="/admin/guides/${guideId}"]`).click();
    await page.waitForURL(editorUrl);
    await page.getByLabel("访问时间", { exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('input[type="datetime-local"]')?.disabled);
    const title = page.getByLabel("标题", { exact: true }).first();
    const originalTitle = await title.inputValue();
    const secondDay = await page.getByLabel("当日标题", { exact: true }).nth(1).inputValue();
    const days = page.getByLabel("天数", { exact: true });
    await days.fill("");
    await days.pressSequentially("12");
    await days.press("Tab");
    assert.equal(await page.getByLabel("当日标题", { exact: true }).count(), 12);
    assert.equal(await page.getByLabel("当日标题", { exact: true }).nth(1).inputValue(), secondDay);
    await days.fill("2");
    await days.press("Tab");
    await confirmAction(async () => { await days.fill("1"); await days.press("Tab"); }, "confirm");
    assert.equal(await page.getByLabel("天数", { exact: true }).inputValue(), "2");
    assert.equal(await page.getByLabel("当日标题", { exact: true }).nth(1).inputValue(), secondDay);
    await title.fill(`${originalTitle} 未保存`);
    for (const leave of [
      () => page.getByRole("link", { name: "← 攻略列表", exact: true }).click({ timeout: 2000 }),
      () => page.goBack({ timeout: 2000 }),
      () => page.reload({ timeout: 2000 }),
    ]) {
      await confirmAction(leave, "beforeunload");
      assert.equal(page.url(), editorUrl);
      assert.equal(await title.inputValue(), `${originalTitle} 未保存`);
    }
    const time = page.getByLabel("访问时间", { exact: true });
    assert.equal(await time.inputValue(), "2026-10-23T08:00");
    await time.fill("2026-10-23T08:01");
    assert.equal(await time.inputValue(), "2026-10-23T08:01");
    const saved = page.waitForResponse(response => response.url() === `${origin}/api/guides/${guideId}` && response.request().method() === "PATCH");
    await page.getByRole("button", { name: "保存攻略", exact: true }).first().click();
    const savedResponse = await saved;
    assert.equal(savedResponse.status(), 200);
    assert.equal((await savedResponse.json()).guide.sources[0].accessedAt, "2026-10-23T00:01:00.000Z");
    await page.getByText("已保存。", { exact: true }).waitFor();
    assert.equal(await page.getByText("有未保存的修改", { exact: true }).count(), 0);
    await page.reload();
    assert.equal(await time.inputValue(), "2026-10-23T08:01");
    await confirmAction(async () => { await days.fill("1"); await days.press("Tab"); }, "confirm", true);
    assert.equal(await page.getByLabel("当日标题", { exact: true }).count(), 1);
    await confirmAction(() => page.getByRole("link", { name: "← 攻略列表", exact: true }).click(), "beforeunload", true);
    await page.waitForURL(`${origin}/admin/guides`);
    await page.getByRole("link", { name: "新建攻略", exact: true }).click();
    await page.waitForURL(`${origin}/admin/guides/new`);
    await page.getByLabel("标题", { exact: true }).first().fill("只填写标题的合成草稿");
    await page.getByRole("button", { name: "保存攻略", exact: true }).first().click();
    const error = page.locator('.error[role="alert"]');
    await error.waitFor();
    assert.ok((await error.getAttribute("class")).includes("error"));
    for (const text of ["第 1 天 · 标题", "第 1 项 · 地点", "第 1 项 · 说明"]) assert.ok((await error.textContent()).includes(text));
    assert.equal(await error.evaluate(element => element === document.activeElement), true);
    assert.equal(await page.getByLabel("标题", { exact: true }).first().inputValue(), "只填写标题的合成草稿");
    const layouts = [];
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ["light", "dark"]) {
        await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        layouts.push(`${width}/${theme}`);
      }
    }
    await page.getByLabel("当日标题", { exact: true }).fill("第一天");
    await page.getByLabel("地点", { exact: true }).fill("合成地点");
    await page.getByLabel("说明", { exact: true }).fill("合成行程");
    const writeRoute = url => /^\/api\/guides(?:\/[a-f\d]{24})?$/.test(url.pathname);
    for (const method of ["POST", "PATCH"]) {
      const editingTitle = page.getByLabel("标题", { exact: true }).first();
      await editingTitle.fill(`${method} 发送时标题`);
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      await page.route(writeRoute, async route => {
        if (route.request().method() !== method) return route.continue();
        const response = await route.fetch();
        await gate;
        await route.fulfill({ response });
      });
      try {
        const posted = page.waitForRequest(request => request.method() === method && writeRoute(new URL(request.url())));
        await page.getByRole("button", { name: "保存攻略", exact: true }).first().click();
        await posted;
        await editingTitle.fill(`${method} 等待响应期间继续输入`);
        release();
        await page.getByText("已保存。", { exact: true }).waitFor();
        await page.waitForURL(/\/admin\/guides\/[a-f\d]{24}$/);
        await page.waitForLoadState("networkidle");
        assert.equal(await editingTitle.inputValue(), `${method} 等待响应期间继续输入`);
        assert.equal(await page.getByText("有未保存的修改", { exact: true }).count(), 1);
      } finally {
        release();
        await page.unroute(writeRoute);
      }
    }
    await page.getByRole("button", { name: "保存攻略", exact: true }).first().click();
    await page.getByText("已保存。", { exact: true }).waitFor();
    await page.getByText("有未保存的修改", { exact: true }).waitFor({ state: "hidden" });
    await page.getByRole("link", { name: "← 攻略列表", exact: true }).click();
    await page.waitForURL(`${origin}/admin/guides`);
    assert.deepEqual(unexpectedDialogs, [], "Saved forms must not warn on navigation");
    return { guards: ["shrink cancel/accept", "list", "back", "reload"], validation: "field errors with preserved input", saves: "POST/PATCH preserve concurrent input", time: "UTC+8 round-trip", layouts };
  } finally {
    page.off("dialog", dismissUnexpected);
  }
}
