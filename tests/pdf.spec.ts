import { test, expect, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { mkdirSync, writeFileSync } from "node:fs";

async function mockPicker(
  page: Page,
  mode: "save" | "cancel" | "fail" = "save",
) {
  await page.evaluate((mode) => {
    const state = window as unknown as {
      showSaveFilePicker: unknown;
      saved: string;
      pickerOptions: unknown;
      printed: boolean;
    };
    state.saved = "";
    state.printed = false;
    window.print = () => {
      state.printed = true;
    };
    state.showSaveFilePicker = async (options: unknown) => {
      state.pickerOptions = options;
      if (mode === "cancel") throw new DOMException("cancel", "AbortError");
      return {
        createWritable: async () => ({
          write: async (blob: Blob) => {
            if (mode === "fail") throw new Error("写入被拒绝");
            state.saved = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve((reader.result as string).split(",")[1]);
              reader.readAsDataURL(blob);
            });
          },
          close: async () => {},
          abort: async () => {},
        }),
      };
    };
  }, mode);
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
});
test("三套主题直接生成单页 PDF 并保存到所选文件，无打印调用", async ({
  page,
}) => {
  test.setTimeout(90000);
  await mockPicker(page);
  mkdirSync("artifacts", { recursive: true });
  await page.getByRole("tab", { name: "主题", exact: true }).click();
  for (const [name, key] of [
    ["商务蓝", "blue"],
    ["简洁黑白", "mono"],
    ["低饱和绿", "sage"],
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await page.getByRole("button", { name: /导出 PDF/ }).click();
    await expect(page.getByRole("alert")).toContainText(
      "PDF 已保存到你选择的位置",
      { timeout: 30000 },
    );
    const state = await page.evaluate(() => {
      const w = window as unknown as {
        saved: string;
        printed: boolean;
        pickerOptions: unknown;
      };
      return { saved: w.saved, printed: w.printed, options: w.pickerOptions };
    });
    expect(state.printed).toBe(false);
    expect(state.options).toMatchObject({ suggestedName: "你的姓名-简历.pdf" });
    const bytes = Buffer.from(state.saved, "base64"),
      pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28, 1);
    writeFileSync(`artifacts/direct-${key}.pdf`, bytes);
  }
  await page.getByLabel("正文字体").selectOption("serif");
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole("button", { name: /导出 PDF/ }).click();
  await expect(page.getByRole("alert")).toContainText(
    "PDF 已保存到你选择的位置",
    { timeout: 30000 },
  );
  writeFileSync(
    "artifacts/direct-serif.pdf",
    Buffer.from(
      await page.evaluate(() => (window as unknown as { saved: string }).saved),
      "base64",
    ),
  );
});
test("取消文件选择不生成、不覆盖文件", async ({ page }) => {
  await mockPicker(page, "cancel");
  await page.getByRole("button", { name: /导出 PDF/ }).click();
  await expect(page.getByRole("alert")).toContainText("已取消保存");
  expect(
    await page.evaluate(
      () => (window as unknown as { saved: string }).saved.length,
    ),
  ).toBe(0);
});
test("保存失败保持内容且恢复导出按钮", async ({ page }) => {
  await mockPicker(page, "fail");
  await page.getByRole("button", { name: /导出 PDF/ }).click();
  await expect(page.getByRole("alert")).toContainText("写入被拒绝", {
    timeout: 30000,
  });
  await expect(page.getByRole("button", { name: /导出 PDF/ })).toBeEnabled();
  await expect(page.locator(".paper h1")).toHaveText("你的姓名");
});
test("不支持文件选择器时下载 PDF 并说明兼容限制", async ({ page }) => {
  await page.evaluate(() =>
    Object.defineProperty(window, "showSaveFilePicker", {
      value: undefined,
      configurable: true,
    }),
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /导出 PDF/ }).click();
  expect((await download).suggestedFilename()).toBe("你的姓名-简历.pdf");
  await expect(page.getByRole("alert")).toContainText("不支持选择保存位置");
});
test("编辑、备份和生成 PDF 不发送简历到网络", async ({ page }) => {
  const external: string[] = [],
    mutations: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:5173/") &&
      !r.url().startsWith("data:") &&
      !r.url().startsWith("blob:")
    )
      external.push(r.url());
    if (["POST", "PUT", "PATCH"].includes(r.method())) mutations.push(r.url());
  });
  await mockPicker(page);
  await page.getByLabel("邮箱", { exact: true }).fill("local-only@example.com");
  await page.getByRole("button", { name: /导出 PDF/ }).click();
  await expect(page.getByRole("alert")).toContainText("PDF 已保存", {
    timeout: 30000,
  });
  expect(external).toEqual([]);
  expect(mutations).toEqual([]);
});
