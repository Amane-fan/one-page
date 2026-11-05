import { test, expect, type Page } from "@playwright/test";
import {
  PDFDocument,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";
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

test("数字、联系方式和加粗边界的 PDF 字符位置与预览一致", async ({ page }) => {
  test.setTimeout(90000);
  await mockPicker(page);
  for (const family of ["sans", "serif"]) {
    const expected = await page.evaluate(async (family) => {
      const paper = document.querySelector<HTMLElement>(".paper")!;
      paper.classList.remove("font-sans", "font-serif");
      paper.classList.add("font-" + family);
      paper.querySelector(".contact")!.innerHTML =
        '<span>邮箱：<a href="mailto:202601234@example.com">202601234@example.com</a></span><span>电话：<a href="tel:000-0000-0000">000-0000-0000</a></span>';
      paper.querySelector(".resume-list")!.innerHTML =
        "<p>2026 ACM-ICPC 全国邀请赛（武汉）<strong>铜奖</strong>（2026.05）</p><p>" +
        "测试数字 2026 和普通文字<strong>加粗文字</strong>衔接。".repeat(10) +
        "</p>";
      await document.fonts.ready;
      const clone = paper.cloneNode(true) as HTMLElement;
      clone.style.cssText =
        paper.style.cssText +
        ";position:fixed;left:-10000px;top:0;transform:none;";
      document.body.appendChild(clone);
      const origin = clone.getBoundingClientRect();
      const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      const positions: number[] = [];
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        let offset = 0;
        for (const char of node.data) {
          range.setStart(node, offset);
          offset += char.length;
          range.setEnd(node, offset);
          const r = range.getBoundingClientRect();
          if (r.width && r.height && char !== "\n" && char !== "\r")
            positions.push(((r.left - origin.left) * 72) / 96);
        }
      }
      clone.remove();
      return positions;
    }, family);
    await page.getByRole("button", { name: /导出 PDF/ }).click();
    await expect(page.getByRole("alert")).toContainText("PDF 已保存", {
      timeout: 30000,
    });
    const bytes = Buffer.from(
      await page.evaluate(() => (window as unknown as { saved: string }).saved),
      "base64",
    );
    const pdf = await PDFDocument.load(bytes);
    const streams = pdf.getPage(0).node.Contents() as PDFArray;
    let content = "";
    for (let i = 0; i < streams.size(); i++) {
      const stream = streams.lookup(i, PDFRawStream);
      content += Buffer.from(decodePDFRawStream(stream).decode()).toString();
    }
    const actual = [...content.matchAll(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/g)].map(
      (m) => Number(m[1]),
    );
    expect(actual).toHaveLength(expected.length);
    actual.forEach((x, i) =>
      expect(Math.abs(x - expected[i])).toBeLessThan(0.02),
    );
    mkdirSync("artifacts", { recursive: true });
    writeFileSync(`artifacts/spacing-${family}.pdf`, bytes);
    await page
      .locator(".paper")
      .screenshot({ path: `artifacts/spacing-${family}-preview.png` });
  }
});
