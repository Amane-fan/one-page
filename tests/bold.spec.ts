import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { splitBold, toggleBold } from "../src/bold";

test("粗体选区切换保持原文，支持局部取消、混合选区和空选区", () => {
  const wrapped = toggleBold("熟悉 Redis 缓存", 3, 8);
  expect(wrapped.value).toBe("熟悉 **Redis** 缓存");
  expect(toggleBold(wrapped.value, wrapped.start, wrapped.end).value).toBe(
    "熟悉 Redis 缓存",
  );
  expect(toggleBold("**abcdef**", 4, 6).value).toBe("**ab**cd**ef**");
  expect(toggleBold("ab**cd**ef", 1, 9).value).toBe("a**bcde**f");
  expect(toggleBold("文字", 1, 1).value).toBe("文字");
  expect(
    splitBold("未闭合 **内容")
      .map((p) => p.text)
      .join(""),
  ).toBe("未闭合 **内容");
});

test("按钮和 Ctrl+B 加粗、取消，撤销重做与本地保存保留格式", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.locator("summary").filter({ hasText: "专业技能" }).click();
  const input = page.getByRole("textbox", { name: "内容 1", exact: true });
  const button = page.getByRole("button", {
    name: "加粗 / 取消加粗：内容 1",
    exact: true,
  });
  await expect(button).toBeDisabled();
  await input.fill("熟悉 Redis 缓存");
  await input.press("Home");
  for (let i = 0; i < 3; i++) await input.press("ArrowRight");
  for (let i = 0; i < 5; i++) await input.press("Shift+ArrowRight");
  await button.click();
  await expect(input).toHaveValue("熟悉 **Redis** 缓存");
  await expect(page.locator(".paper strong")).toHaveText("Redis");
  expect(
    await page
      .locator(".paper strong")
      .evaluate((el) => getComputedStyle(el).fontWeight),
  ).toBe("700");
  await input.press("Control+b");
  await expect(input).toHaveValue("熟悉 Redis 缓存");
  await expect(page.locator(".paper strong")).toHaveCount(0);
  await input.press("Control+b");
  await expect(input).toHaveValue("熟悉 **Redis** 缓存");
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(page.locator(".paper strong")).toHaveCount(0);
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect(page.locator(".paper strong")).toHaveText("Redis");
  await expect(page.getByRole("status")).toHaveText("已保存到本机");
  await page.reload();
  await expect(page.locator(".paper strong")).toHaveText("Redis");
  await expect(page.locator(".paper")).not.toContainText("**");
});

test("加粗 JSON 往返、HTML 文字转义和直接 PDF 粗体导出", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.locator("summary").filter({ hasText: "专业技能" }).click();
  await page
    .getByRole("textbox", { name: "内容 1", exact: true })
    .fill("普通文字 **加粗示例** 后续说明");
  await page
    .getByRole("textbox", { name: "内容 2", exact: true })
    .fill("**<img src=x onerror=alert(1)>**");
  await expect(page.locator(".paper img")).toHaveCount(0);
  await expect(page.locator(".paper strong").last()).toHaveText(
    "<img src=x onerror=alert(1)>",
  );
  await page
    .getByRole("textbox", { name: "内容 2", exact: true })
    .fill("保持普通文字");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON" }).click();
  const file = await download;
  const data = JSON.parse(readFileSync((await file.path())!, "utf8"));
  expect(data.sections[0].items[0]).toBe("普通文字 **加粗示例** 后续说明");
  await page
    .getByRole("textbox", { name: "内容 1", exact: true })
    .fill("临时内容");
  await page
    .locator('input[type=file][accept="application/json,.json"]')
    .setInputFiles({
      name: "bold.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(data)),
    });
  await expect(page.locator(".paper strong")).toHaveText("加粗示例");
  await page.evaluate(() => {
    const w = window as unknown as {
      showSaveFilePicker: unknown;
      pdfBase64: string;
    };
    w.showSaveFilePicker = async () => ({
      createWritable: async () => ({
        write: async (blob: Blob) => {
          w.pdfBase64 = await new Promise<string>((resolve) => {
            const r = new FileReader();
            r.onload = () => resolve((r.result as string).split(",")[1]);
            r.readAsDataURL(blob);
          });
        },
        close: async () => {},
        abort: async () => {},
      }),
    });
  });
  await page.getByRole("button", { name: /导出 PDF/ }).click();
  await expect(page.getByRole("alert")).toContainText(
    "PDF 已保存到你选择的位置",
    { timeout: 30000 },
  );
  mkdirSync("artifacts", { recursive: true });
  writeFileSync(
    "artifacts/bold.pdf",
    Buffer.from(
      await page.evaluate(
        () => (window as unknown as { pdfBase64: string }).pdfBase64,
      ),
      "base64",
    ),
  );
  await page
    .locator(".paper")
    .screenshot({ path: "artifacts/bold-preview.png" });
});
