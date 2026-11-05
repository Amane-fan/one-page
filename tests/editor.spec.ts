import { test, expect, type Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
const original = JSON.parse(readFileSync("src/data/resume.json", "utf8"));
async function load(page: Page, value: unknown) {
  await page
    .locator('input[type=file][accept="application/json,.json"]')
    .setInputFiles({
      name: "resume.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(value)),
    });
  await expect(page.getByRole("alert")).toContainText("已导入");
}
async function metrics(page: Page) {
  return page.locator(".resume-content").evaluate((el) => ({
    height: (el as HTMLElement).offsetHeight,
    font: parseFloat(getComputedStyle(el).fontSize),
    line: parseFloat(getComputedStyle(el).lineHeight),
  }));
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".fit-strip")).toContainText("已适配一页");
});

test("匿名模板与三套主题 A4 预览", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.locator(".paper h1")).toHaveText("你的姓名");
  await expect(page.locator(".paper .resume-section")).toHaveCount(4);
  await expect(
    page.locator('.paper a[href="https://github.com/example"]'),
  ).toBeVisible();
  mkdirSync("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/desktop.png", fullPage: true });
  await page.getByRole("tab", { name: "主题", exact: true }).click();
  for (const [name, id] of [
    ["简洁黑白", "mono"],
    ["低饱和绿", "sage"],
    ["商务蓝", "blue"],
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator(".paper")).toHaveClass(new RegExp(`theme-${id}`));
    expect((await metrics(page)).height).toBeLessThanOrEqual(1054);
  }
  expect(errors).toEqual([]);
});
test("修改自动保存、撤销重做、JSON 备份与导入校验", async ({ page }) => {
  await page.getByLabel("姓名", { exact: true }).fill("你的姓名 · 测试");
  await expect(page.getByRole("status")).toHaveText("已保存到本机");
  await page.reload();
  await expect(page.locator(".paper h1")).toHaveText("你的姓名 · 测试");
  await page.getByLabel("姓名", { exact: true }).fill("修改后的姓名");
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(page.locator(".paper h1")).toHaveText("你的姓名 · 测试");
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect(page.locator(".paper h1")).toHaveText("修改后的姓名");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON" }).click();
  const result = await download;
  const data = JSON.parse(readFileSync((await result.path())!, "utf8"));
  expect(data.profile.name).toBe("修改后的姓名");
  expect(data.profile.photo).toBe("");
  await load(page, original);
  await expect(page.locator(".paper h1")).toHaveText("你的姓名");
  await page
    .locator('input[type=file][accept="application/json,.json"]')
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":3}'),
    });
  await expect(page.getByRole("alert")).toContainText("导入失败");
  await expect(page.locator(".paper h1")).toHaveText("你的姓名");
});
test("模块增删、隐藏与排序", async ({ page }) => {
  await page.locator("summary").filter({ hasText: "专业技能" }).click();
  await page
    .getByRole("button", { name: "下移专业技能模块", exact: true })
    .click();
  await expect(page.locator(".paper .resume-section h2").first()).toHaveText(
    "实习经历",
  );
  await page.getByRole("checkbox", { name: "显示模块", exact: true }).uncheck();
  await expect(page.locator(".paper .resume-section")).toHaveCount(3);
  await page.getByRole("button", { name: "＋ 文字列表", exact: true }).click();
  await expect(page.locator(".paper h2").last()).toHaveText("自定义模块");
  await page.locator("summary").filter({ hasText: "自定义模块" }).click();
  await page
    .getByRole("button", { name: "删除自定义模块模块", exact: true })
    .click();
  await expect(page.locator(".paper .resume-section")).toHaveCount(3);
});
test("内容变化后调整间距，严重溢出保持 9pt 下限且不裁切", async ({ page }) => {
  const baseline = await metrics(page);
  const sparse = structuredClone(original);
  sparse.sections = sparse.sections.slice(0, 1);
  sparse.sections[0].items = sparse.sections[0].items.slice(0, 2);
  await load(page, sparse);
  await expect(page.locator(".fit-strip")).toContainText("保留自然留白");
  expect((await metrics(page)).height).toBeLessThan(baseline.height);
  const dense = structuredClone(original);
  dense.sections[0].items.push(
    ...Array(4).fill(
      "熟悉业务接口与数据处理，使用类型校验与测试保证接口行为。",
    ),
  );
  await load(page, dense);
  expect((await metrics(page)).line).toBeLessThanOrEqual(baseline.line);
  const huge = structuredClone(original);
  huge.sections[0].items = Array(100).fill(
    "熟悉业务接口与数据处理，使用类型校验与测试保证接口行为。",
  );
  await load(page, huge);
  await expect(page.locator(".fit-strip")).toContainText("超出一页");
  expect((await metrics(page)).font).toBeCloseTo(12, 1);
  await expect(page.getByRole("button", { name: /导出 PDF/ })).toBeDisabled();
  await expect(
    page.locator(".paper .resume-list").first().locator("p"),
  ).toHaveCount(100);
  await expect(page.locator(".page-boundary")).toBeVisible();
});
test("手机和窄屏无页面横向溢出，预览不改变 A4 排版", async ({ page }) => {
  const baseline = await metrics(page);
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    if (width === 390)
      await page.getByRole("button", { name: "A4 预览", exact: true }).click();
    await expect(page.locator(".paper")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await metrics(page)).height).toBe(baseline.height);
    await page.screenshot({
      path: `artifacts/${width === 390 ? "mobile" : "tablet"}.png`,
      fullPage: true,
    });
  }
});
test("字号、自动适配、照片和主题随备份恢复", async ({ page }) => {
  await page.getByRole("tab", { name: "主题", exact: true }).click();
  await page.getByLabel("显示证件照").uncheck();
  await expect(page.locator(".paper .portrait")).toHaveCount(0);
  await page.getByLabel("正文字体").selectOption("serif");
  await expect(page.locator(".paper")).toHaveClass(/font-serif/);
  await page.getByRole("tab", { name: "排版", exact: true }).click();
  await page.getByLabel("基础字号").fill("12");
  await expect(page.locator(".fit-strip")).toContainText("已适配");
  expect((await metrics(page)).font).toBeGreaterThanOrEqual(12);
  await page.getByLabel("自动适配一页 A4").uncheck();
  expect((await metrics(page)).font).toBeCloseTo(16, 1);
  await load(page, original);
  await expect(page.locator(".paper .portrait")).toHaveCount(0);
});
test("手机首次打开和编辑隐藏预览时仍按 A4 测量", async ({ page }) => {
  const desktop = await metrics(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "编辑简历", exact: true }),
  ).toBeVisible();
  expect((await metrics(page)).height).toBe(desktop.height);
  await page.getByLabel("姓名", { exact: true }).fill("你的姓名");
  await page.getByRole("button", { name: "A4 预览", exact: true }).click();
  await expect(page.locator(".fit-strip")).toContainText("已适配一页");
  expect((await metrics(page)).height).toBe(desktop.height);
  await page.getByRole("button", { name: "编辑简历", exact: true }).click();
  await page.screenshot({
    path: "artifacts/mobile-editor.png",
    fullPage: true,
  });
});
test("本地草稿损坏时不覆盖原始草稿", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("onepage-resume-v1", "invalid-json"),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("原草稿未覆盖");
  await expect(page.locator(".paper h1")).toHaveText("你的姓名");
  expect(
    await page.evaluate(() => localStorage.getItem("onepage-resume-v1")),
  ).toBe("invalid-json");
  await page.getByRole("button", { name: "使用当前内容并保存" }).click();
  await expect(page.getByRole("status")).toHaveText("已保存到本机");
});
