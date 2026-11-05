import {
  PDFDocument,
  PDFName,
  PDFString,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const PT = 72 / 96;
const WIDTH = (210 * 72) / 25.4,
  HEIGHT = (297 * 72) / 25.4;
const fontData = new Map<string, Promise<ArrayBuffer>>();
function loadFont(name: string) {
  if (!fontData.has(name))
    fontData.set(
      name,
      fetch(`${import.meta.env.BASE_URL}fonts/${name}.ttf`)
        .then((r) => {
          if (!r.ok)
            throw new Error("中文字体加载失败，请确认应用文件完整后重试。");
          return r.arrayBuffer();
        })
        .catch((e) => {
          fontData.delete(name);
          throw e;
        }),
    );
  return fontData.get(name)!;
}
/** 按浏览器已经完成的 A4 排版写入矢量文字，不截图、不调用打印服务。 */
export async function createResumePdf(
  source: HTMLElement,
  title: string,
): Promise<Uint8Array> {
  await document.fonts.ready;
  const clone = source.cloneNode(true) as HTMLElement;
  clone.style.cssText = `${source.style.cssText};position:fixed;left:-10000px;top:0;transform:none;visibility:visible;pointer-events:none;`;
  clone.setAttribute("aria-hidden", "true");
  document.body.appendChild(clone);
  try {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    pdf.setTitle(title);
    pdf.setCreator("one-page");
    pdf.setProducer("one-page / pdf-lib");
    const family = source.classList.contains("font-serif")
      ? "NotoSerifSC"
      : "NotoSansSC";
    const [regular, bold] = await Promise.all(
      ["Regular", "Bold"].map(async (weight) =>
        pdf.embedFont(await loadFont(`${family}-${weight}`), {
          subset: false,
          features: { tnum: false, liga: false },
        }),
      ),
    );
    const page = pdf.addPage([WIDTH, HEIGHT]);
    const origin = clone.getBoundingClientRect();
    const rectangle = (el: Element) => {
      const r = el.getBoundingClientRect();
      return {
        x: (r.left - origin.left) * PT,
        y: HEIGHT - (r.bottom - origin.top) * PT,
        width: r.width * PT,
        height: r.height * PT,
      };
    };
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    const color = (value: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const p = ctx.getImageData(0, 0, 1, 1).data;
      return {
        color: rgb(p[0] / 255, p[1] / 255, p[2] / 255),
        opacity: p[3] / 255,
      };
    };
    clone.querySelectorAll("h2").forEach((el) => {
      const style = getComputedStyle(el),
        r = rectangle(el);
      page.drawRectangle({ ...r, ...color(style.backgroundColor) });
      const left = parseFloat(style.borderLeftWidth) * PT,
        bottom = parseFloat(style.borderBottomWidth) * PT;
      if (left)
        page.drawRectangle({
          ...r,
          width: left,
          ...color(style.borderLeftColor),
        });
      if (bottom)
        page.drawRectangle({
          ...r,
          height: bottom,
          ...color(style.borderBottomColor),
        });
    });
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT),
      range = document.createRange();
    while (walker.nextNode()) {
      const node = walker.currentNode as Text,
        parent = node.parentElement!;
      const style = getComputedStyle(parent),
        size = parseFloat(style.fontSize) * PT;
      const font = Number(style.fontWeight) >= 600 ? bold : regular;
      const descent =
        font.heightAtSize(size) - font.heightAtSize(size, { descender: false });
      if (parent.tagName === "TIME") {
        let offset = 0;
        for (const character of node.data) {
          range.setStart(node, offset);
          offset += character.length;
          range.setEnd(node, offset);
          const r = range.getBoundingClientRect();
          if (r.width)
            page.drawText(character, {
              x: (r.left - origin.left) * PT,
              y: HEIGHT - (r.bottom - origin.top) * PT + descent,
              size,
              font,
              ...color(style.color),
            });
        }
        continue;
      }
      let offset = 0,
        line = "",
        first: DOMRect | null = null,
        right = 0;
      const flush = () => {
        if (first && line) {
          const width = font.widthOfTextAtSize(line, size);
          const scale = width ? ((right - first.left) * PT) / width : 1;
          page.pushOperators(
            pushGraphicsState(),
            concatTransformationMatrix(
              scale,
              0,
              0,
              1,
              (first.left - origin.left) * PT,
              HEIGHT - (first.bottom - origin.top) * PT + descent,
            ),
          );
          page.drawText(line, {
            x: 0,
            y: 0,
            size,
            font,
            ...color(style.color),
          });
          page.pushOperators(popGraphicsState());
        }
        line = "";
        first = null;
      };
      for (const character of node.data) {
        range.setStart(node, offset);
        offset += character.length;
        range.setEnd(node, offset);
        if (character === "\n" || character === "\r") {
          flush();
          continue;
        }
        const rect = range.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        if (first && Math.abs(first.top - rect.top) > 0.5) flush();
        if (!first) first = rect;
        line += character;
        right = rect.right;
      }
      flush();
    }
    clone.querySelectorAll("li").forEach((li) => {
      const style = getComputedStyle(li),
        r = rectangle(li),
        size = parseFloat(style.fontSize) * PT;
      page.drawCircle({
        x: r.x - 6 * PT,
        y: r.y + r.height - size * 0.63,
        size: 1,
        ...color(
          getComputedStyle(clone).getPropertyValue("--resume-accent") ||
            "#333333",
        ),
      });
    });
    for (const img of clone.querySelectorAll("img")) {
      await img.decode();
      const r = rectangle(img);
      const c = document.createElement("canvas");
      c.width = Math.round(r.width * 3);
      c.height = Math.round(r.height * 3);
      const draw = c.getContext("2d")!,
        factor = Math.max(
          c.width / img.naturalWidth,
          c.height / img.naturalHeight,
        );
      draw.drawImage(
        img,
        (c.width - img.naturalWidth * factor) / 2,
        (c.height - img.naturalHeight * factor) / 2,
        img.naturalWidth * factor,
        img.naturalHeight * factor,
      );
      const image = await pdf.embedPng(c.toDataURL("image/png"));
      page.drawImage(image, r);
    }
    const annotations = [];
    for (const a of clone.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      if (!/^(https:\/\/|mailto:|tel:)/i.test(a.href)) continue;
      for (const rect of a.getClientRects()) {
        const x = (rect.left - origin.left) * PT,
          y = HEIGHT - (rect.bottom - origin.top) * PT,
          w = rect.width * PT,
          h = rect.height * PT;
        annotations.push(
          pdf.context.register(
            pdf.context.obj({
              Type: "Annot",
              Subtype: "Link",
              Rect: [x, y, x + w, y + h],
              Border: [0, 0, 0],
              A: { Type: "Action", S: "URI", URI: PDFString.of(a.href) },
            }),
          ),
        );
        if (getComputedStyle(a).textDecorationLine.includes("underline"))
          page.drawLine({
            start: { x, y: y + 1 },
            end: { x: x + w, y: y + 1 },
            thickness: 0.4,
            ...color(getComputedStyle(a).color),
          });
      }
    }
    page.node.set(PDFName.of("Annots"), pdf.context.obj(annotations));
    return await pdf.save();
  } finally {
    clone.remove();
  }
}
