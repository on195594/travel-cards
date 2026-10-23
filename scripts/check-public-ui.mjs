import assert from "node:assert/strict";

// Synthetic long-list regression; pass src/app/globals.css, no database or network needed.
export async function checkCardScrollStability(page, css) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(`<style>${css.replace(/@import[^;]+;/g, "")}</style>` +
    Array.from({ length: 40 }, () => '<article class="card"><div style="height:650px">Long guide fixture</div></article>').join(""));
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => document.documentElement.scrollHeight);
  assert.equal(after, before, "Scrolling must not change the total card-list height");
  return { before, after };
}

// Run with a Playwright page against the isolated preview, never the admin UI.
export async function checkPublicUi(page, origin = "http://127.0.0.1:3102") {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin);
  await page.getByRole("searchbox").waitFor();
  const firstGuide = await page.locator(".card-link").first().getAttribute("href");
  assert.ok(firstGuide, "Seed the preview with a published guide");
  const requests = [];
  const listener = request => {
    if (request.url().includes("/api/guides?q=")) requests.push(request.url());
  };
  page.on("request", listener);
  try {
    await page.getByRole("searchbox").pressSequentially("xian", { delay: 60 });
    await page.waitForTimeout(700);
    assert.equal(requests.length, 1, "Rapid input should make one search request");
    await page.getByRole("button", { name: "清除搜索关键词", exact: true }).first().click();
    assert.equal(await page.getByRole("searchbox").inputValue(), "");
    assert.ok(!new URL(page.url()).searchParams.has("q"));
    await page.getByRole("searchbox").fill("cancel-this-search");
    await page.getByRole("button", { name: "清除搜索关键词", exact: true }).first().click();
    await page.waitForTimeout(400);
    assert.equal(requests.length, 1, "Clearing should cancel the pending request");
    const firstImage = page.locator(".card-image").first();
    assert.equal(await firstImage.getAttribute("loading"), "eager");
    assert.equal(await firstImage.getAttribute("fetchpriority"), "high");
    const searchTerm = await page.locator(".card h3").first().textContent();
    const searchRoute = "**/api/guides?q=*";
    let failSearch = true;
    await page.route(searchRoute, route => failSearch
      ? route.fulfill({ status: 503, json: { error: { message: "test outage" } } })
      : route.continue());
    try {
      await page.getByRole("searchbox").fill(searchTerm);
      assert.equal(await page.locator(".section-count").textContent(), "正在搜索…");
      await page.locator('.error[role="alert"]').waitFor();
      assert.equal(await page.locator(".section-count").textContent(), "搜索暂时不可用");
      assert.ok(await page.getByText(/下方仅展示已加载攻略中的/).isVisible());
      assert.ok(await page.locator(".card").count() > 0);
      failSearch = false;
      await page.getByRole("button", { name: "重新搜索", exact: true }).click();
      await page.getByRole("button", { name: "重新搜索", exact: true }).waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.querySelector(".section-count")?.textContent?.startsWith("找到"));
      assert.equal(await page.locator('.error[role="alert"]').count(), 0);
      await page.getByRole("searchbox").fill("no-fixture-matches-this");
      await page.getByText("找到 0 篇攻略", { exact: true }).waitFor();
      assert.ok(await page.getByText(/未找到与/).isVisible());
      await page.getByRole("button", { name: "清除搜索关键词", exact: true }).first().click();
    } finally {
      await page.unroute(searchRoute);
    }
    const checks = [];
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/", firstGuide]) {
        await page.goto(origin + path);
        for (const theme of ["light", "dark"]) {
          await page.evaluate(value => document.documentElement.setAttribute("data-theme", value), theme);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${path} overflows at ${width}/${theme}`);
          checks.push(`${path} ${width}/${theme}`);
        }
        if (path !== "/") {
          assert.equal(await page.locator(".cover").evaluate(image => getComputedStyle(image).objectFit), "contain");
          assert.ok(await page.getByRole("link", { name: /查看封面原图/ }).getAttribute("href"));
          const jump = page.locator(".day-jump-pill").first();
          if (await jump.count()) {
            await jump.click();
            assert.ok(new URL(page.url()).hash.startsWith("#day-"));
          }
        }
      }
    }
    return { searchRequests: requests.length, layoutChecks: checks.length, checks };
  } finally {
    page.off("request", listener);
  }
}
