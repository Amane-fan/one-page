export type FitResult = {
  fontSize: number;
  lineHeight: number;
  sectionGap: number;
  itemGap: number;
  used: number;
  available: number;
  overflow: boolean;
  affected: string[];
  limited: boolean;
};
export const MM = 96 / 25.4;
export const PAGE_HEIGHT = 297 * MM;
export const CONTENT_HEIGHT = (297 - 18) * MM;
export function applyMetrics(el: HTMLElement, font: number, t: number) {
  const metrics = {
    fontSize: font,
    lineHeight: 1.25 + 0.3 * t,
    sectionGap: 5 + 13 * t,
    itemGap: 1.5 + 3.5 * t,
  };
  el.style.setProperty("--body-size", `${font}pt`);
  el.style.setProperty("--leading", String(metrics.lineHeight));
  el.style.setProperty("--section-gap", `${metrics.sectionGap}px`);
  el.style.setProperty("--item-gap", `${metrics.itemGap}px`);
  el.style.setProperty("--paragraph-gap", `${2 + 3 * t}px`);
  el.style.setProperty("--entry-gap", `${6 + 8 * t}px`);
  el.style.setProperty("--header-gap", `${7 + 7 * t}px`);
  return metrics;
}
/** 在真实 A4 宽度下测量；先收紧间距，再缩字号。预览缩放不参与内容尺寸计算。 */
export function fitPage(
  el: HTMLElement,
  fontSize: number,
  maxSpacing: number,
  autoFit: boolean,
): FitResult {
  const available = CONTENT_HEIGHT - 2; // 为打印的小数像素换算预留 2px。
  const height = () => el.offsetHeight;
  let font = fontSize,
    spacing = maxSpacing;
  applyMetrics(el, font, spacing);
  if (autoFit && height() > available) {
    spacing = 0;
    applyMetrics(el, font, spacing);
    if (height() > available) {
      let low = 9,
        high = fontSize;
      applyMetrics(el, low, 0);
      if (height() > available) font = 9;
      else {
        for (let i = 0; i < 12; i++) {
          const mid = (low + high) / 2;
          applyMetrics(el, mid, 0);
          if (height() <= available) low = mid;
          else high = mid;
        }
        font = Math.floor(low * 100) / 100;
      }
    }
    applyMetrics(el, font, 0);
    if (height() <= available) {
      let low = 0,
        high = maxSpacing;
      for (let i = 0; i < 12; i++) {
        const mid = (low + high) / 2;
        applyMetrics(el, font, mid);
        if (height() <= available) low = mid;
        else high = mid;
      }
      spacing = low;
    }
  }
  const metrics = applyMetrics(el, font, spacing);
  const used = height(),
    overflow = used > available;
  const affected = [...el.querySelectorAll<HTMLElement>("[data-section-title]")]
    .filter((s) => s.offsetTop + s.offsetHeight > available)
    .map((s) => s.dataset.sectionTitle!);
  return {
    ...metrics,
    used,
    available,
    overflow,
    affected,
    limited: !overflow && used < available * 0.86,
  };
}
