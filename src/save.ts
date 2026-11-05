type FileHandle = {
  createWritable(): Promise<{
    write(blob: Blob): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
};
type SaveWindow = Window & {
  showSaveFilePicker?: (options: unknown) => Promise<FileHandle>;
};
export function choosePdfDestination(
  filename: string,
): Promise<FileHandle | null> {
  const picker = (window as SaveWindow).showSaveFilePicker;
  // 在用户点击的同步调用栈内打开，不能等待字体或 PDF 生成后才申请。
  return picker
    ? picker.call(window, {
        suggestedName: filename,
        types: [
          { description: "PDF 文档", accept: { "application/pdf": [".pdf"] } },
        ],
        excludeAcceptAllOption: true,
      })
    : Promise.resolve(null);
}
export async function savePdf(
  bytes: Uint8Array,
  filename: string,
  handle: FileHandle | null,
) {
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  if (handle) {
    const writer = await handle.createWritable();
    try {
      await writer.write(blob);
      await writer.close();
    } catch (e) {
      await writer.abort().catch(() => {});
      throw e;
    }
    return;
  }
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
