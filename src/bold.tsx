type Part = {
  text: string;
  bold: boolean;
  from: number;
  contentFrom: number;
  to: number;
};

/** 只识别成对的 ** 标记。普通文字由 React 转义，不接受 HTML。 */
export function splitBold(value: string): Part[] {
  const parts: Part[] = [];
  const pattern = /\*\*([\s\S]+?)\*\*/g;
  let last = 0;
  for (const match of value.matchAll(pattern)) {
    const from = match.index!;
    if (from > last)
      parts.push({
        text: value.slice(last, from),
        bold: false,
        from: last,
        contentFrom: last,
        to: from,
      });
    parts.push({
      text: match[1],
      bold: true,
      from,
      contentFrom: from + 2,
      to: from + match[0].length,
    });
    last = from + match[0].length;
  }
  if (last < value.length)
    parts.push({
      text: value.slice(last),
      bold: false,
      from: last,
      contentFrom: last,
      to: value.length,
    });
  return parts;
}

export function BoldText({ text }: { text: string }) {
  return (
    <>
      {splitBold(text).map((part, i) =>
        part.bold ? <strong key={i}>{part.text}</strong> : part.text,
      )}
    </>
  );
}

/** 选区使用 textarea 的 UTF-16 偏移；支持重复取消和在粗体片段中局部取消。 */
export function toggleBold(value: string, start: number, end: number) {
  const unchanged = { value, start, end };
  if (start === end) return unchanged;
  const parts = splitBold(value);
  const plainIndex = (index: number) => {
    let count = 0;
    for (const part of parts) {
      if (index <= part.to)
        return (
          count +
          Math.max(0, Math.min(part.text.length, index - part.contentFrom))
        );
      count += part.text.length;
    }
    return count;
  };
  const a = plainIndex(start),
    b = plainIndex(end);
  if (a === b) return unchanged;
  const chars = parts.flatMap((p) =>
    p.text.split("").map((text) => ({ text, bold: p.bold })),
  );
  const bold = !chars.slice(a, b).every((c) => c.bold);
  for (let i = a; i < b; i++) chars[i].bold = bold;
  const runs: {
    text: string;
    bold: boolean;
    plainFrom: number;
    rawFrom: number;
  }[] = [];
  chars.forEach((c, i) => {
    const last = runs[runs.length - 1];
    if (last && last.bold === c.bold) last.text += c.text;
    else runs.push({ text: c.text, bold: c.bold, plainFrom: i, rawFrom: 0 });
  });
  let result = "";
  for (const run of runs) {
    run.rawFrom = result.length;
    result += run.bold ? `**${run.text}**` : run.text;
  }
  const rawIndex = (index: number, isEnd: boolean) => {
    for (const run of runs) {
      const limit = run.plainFrom + run.text.length;
      if (index < limit || (isEnd && index === limit))
        return run.rawFrom + (run.bold ? 2 : 0) + index - run.plainFrom;
    }
    return result.length;
  };
  return { value: result, start: rawIndex(a, false), end: rawIndex(b, true) };
}
