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
