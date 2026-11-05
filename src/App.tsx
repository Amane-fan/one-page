import { choosePdfDestination, savePdf } from "./save";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  defaultDocument,
  documentSchema,
  move,
  presets,
  readDraft,
  STORAGE_KEY,
  uid,
  type Entry,
  type ResumeDocument,
  type Section,
} from "./model";
import {
  CONTENT_HEIGHT,
  fitPage,
  MM,
  PAGE_HEIGHT,
  type FitResult,
} from "./fit";
import { Resume } from "./Resume";

function Field({
  label,
  value,
  onChange,
  multiline = false,
  ...props
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
          {...props}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          {...props}
        />
      )}
    </label>
  );
}
function OrderButtons({
  index,
  count,
  onMove,
  onDelete,
  label,
}: {
  index: number;
  count: number;
  onMove: (d: number) => void;
  onDelete: () => void;
  label: string;
}) {
  return (
    <div className="order-buttons">
      <button
        aria-label={`上移${label}`}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        ↑
      </button>
      <button
        aria-label={`下移${label}`}
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      >
        ↓
      </button>
      <button className="delete" aria-label={`删除${label}`} onClick={onDelete}>
        删除
      </button>
    </div>
  );
}
function TextItems({
  items,
  onChange,
  label,
}: {
  items: string[];
  onChange: (v: string[]) => void;
  label: string;
}) {
  return (
    <div className="text-items">
      {items.map((item, i) => (
        <div className="text-item" key={i}>
          <Field
            label={`${label} ${i + 1}`}
            value={item}
            multiline
            onChange={(value) =>
              onChange(items.map((x, j) => (j === i ? value : x)))
            }
          />
          <OrderButtons
            index={i}
            count={items.length}
            label={`${label} ${i + 1}`}
            onMove={(d) => onChange(move(items, i, d))}
            onDelete={() => onChange(items.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      <button className="add-button" onClick={() => onChange([...items, ""])}>
        ＋ 添加{label}
      </button>
    </div>
  );
}
function EntryEditor({
  entry,
  onChange,
}: {
  entry: Entry;
  onChange: (e: Entry) => void;
}) {
  const field = (key: keyof Entry, value: string | string[]) =>
    onChange({ ...entry, [key]: value });
  return (
    <div className="entry-editor">
      <Field
        label="公司 / 项目名称"
        value={entry.title}
        onChange={(v) => field("title", v)}
      />
      <div className="field-pair">
        <Field
          label="岗位"
          value={entry.role}
          onChange={(v) => field("role", v)}
        />
        <Field
          label="日期"
          value={entry.date}
          onChange={(v) => field("date", v)}
        />
      </div>
      <Field
        label="相关技术"
        value={entry.stack}
        multiline
        onChange={(v) => field("stack", v)}
      />
      <Field
        label="项目描述"
        value={entry.description}
        multiline
        onChange={(v) => field("description", v)}
      />
      <TextItems
        items={entry.bullets}
        label="主要工作"
        onChange={(v) => field("bullets", v)}
      />
    </div>
  );
}
const spacingValues = { compact: 0.45, balanced: 0.78, relaxed: 1 };

export default function App() {
  const [initial] = useState(readDraft);
  const [exporting, setExporting] = useState(false);
  const [doc, setDoc] = useState(initial.doc);
  const [past, setPast] = useState<ResumeDocument[]>([]),
    [future, setFuture] = useState<ResumeDocument[]>([]);
  const [tab, setTab] = useState<"content" | "theme" | "layout">("content");
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [notice, setNotice] = useState(initial.warning);
  const [saveBlocked, setSaveBlocked] = useState(!!initial.warning);
  const [saveState, setSaveState] = useState("本地草稿");
  const [fit, setFit] = useState<FitResult | null>(null);
  const [scale, setScale] = useState(1);
  const [zoom, setZoom] = useState("fit");
  const contentRef = useRef<HTMLDivElement>(null),
    stageRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null),
    photoRef = useRef<HTMLInputElement>(null);
  const latest = useRef(doc);
  latest.current = doc;
  const change = useCallback((next: ResumeDocument) => {
    setPast((p) => [...p.slice(-39), latest.current]);
    setFuture([]);
    setDoc(next);
  }, []);
  const updateProfile = (key: keyof ResumeDocument["profile"], value: string) =>
    change({ ...doc, profile: { ...doc.profile, [key]: value } });
  const updateTheme = (patch: Partial<ResumeDocument["theme"]>) =>
    change({ ...doc, theme: { ...doc.theme, ...patch } });
  const updateSection = (section: Section) =>
    change({
      ...doc,
      sections: doc.sections.map((s) => (s.id === section.id ? section : s)),
    });
  const undo = () => {
    if (past.length) {
      setFuture((f) => [doc, ...f]);
      setDoc(past[past.length - 1]);
      setPast((p) => p.slice(0, -1));
    }
  };
  const redo = () => {
    if (future.length) {
      setPast((p) => [...p, doc]);
      setDoc(future[0]);
      setFuture((f) => f.slice(1));
    }
  };
  const save = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(latest.current));
      setSaveState("已保存到本机");
      return true;
    } catch {
      setSaveState("保存失败");
      setNotice(
        "本地存储空间不足或浏览器禁止保存。请导出 JSON 备份，避免关闭后丢失修改。",
      );
      return false;
    }
  }, []);
  useEffect(() => {
    if (saveBlocked) return;
    setSaveState("保存中…");
    const timer = window.setTimeout(save, 450);
    return () => clearTimeout(timer);
  }, [doc, save, saveBlocked]);
  useEffect(() => {
    const flush = () => {
      if (!saveBlocked) save();
    };
    const leave = (e: BeforeUnloadEvent) => {
      if (saveBlocked || !save()) e.preventDefault();
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", leave);
    };
  }, [save, saveBlocked]);
  const measure = useCallback(() => {
    if (!contentRef.current) return null;
    const result = fitPage(
      contentRef.current,
      doc.theme.fontSize,
      spacingValues[doc.theme.spacing],
      doc.theme.autoFit,
    );
    setFit(result);
    return result;
  }, [doc]);
  useLayoutEffect(() => {
    measure();
    let active = true;
    document.fonts.ready.then(() => {
      if (active) measure();
    });
    return () => {
      active = false;
    };
  }, [measure, mobileView]);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const resize = () =>
      setScale(
        zoom === "fit"
          ? Math.min(1, Math.max(0.15, (el.clientWidth - 48) / (210 * MM)))
          : Number(zoom),
      );
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    return () => observer.disconnect();
  }, [zoom, mobileView]);
  useEffect(() => {
    window.addEventListener("beforeprint", measure);
    return () => window.removeEventListener("beforeprint", measure);
  }, [measure, mobileView]);

  function exportJson() {
    const blob = new Blob([JSON.stringify(doc, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `${doc.profile.name || "我的"}-简历.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("JSON 备份已下载，包含全部内容、照片和主题，可随时导入恢复。");
  }
  async function importJson(file?: File) {
    if (!file) return;
    try {
      if (file.size > 6 * 1024 * 1024) throw new Error("文件超过 6 MB");
      const next = documentSchema.parse(JSON.parse(await file.text()));
      change(next);
      setSaveBlocked(false);
      setNotice("已导入简历。可用“撤销”恢复导入前的内容。");
    } catch {
      setNotice(
        "导入失败：请选择本工具导出的有效 JSON 文件（最大 6 MB）。当前内容未改变。",
      );
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }
  async function uploadPhoto(file?: File) {
    if (!file) return;
    try {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 2 * 1024 * 1024
      )
        throw new Error();
      const result = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const img = new Image();
      img.src = result;
      await img.decode();
      change({
        ...latest.current,
        profile: { ...latest.current.profile, photo: result },
        theme: { ...latest.current.theme, photo: true },
      });
    } catch {
      setNotice("照片读取失败，请选择 2 MB 以内的 JPG、PNG 或 WebP 图片。");
    } finally {
      if (photoRef.current) photoRef.current.value = "";
    }
  }
  async function exportPdf() {
    if (exporting || !contentRef.current || fit?.overflow) return;
    const filename = `${doc.profile.name || "我的"}-简历.pdf`.replace(
      /[\\/:*?"<>|]/g,
      "_",
    );
    setNotice("");
    setExporting(true);
    try {
      const handle = await choosePdfDestination(filename);
      await document.fonts.ready;
      const result = measure();
      if (!result || result.overflow)
        throw new Error("内容超出一页，请精简提示的模块后重试。");
      const { createResumePdf } = await import("./pdf");
      const bytes = await createResumePdf(
        contentRef.current.closest(".paper") as HTMLElement,
        filename.replace(/\.pdf$/, ""),
      );
      await savePdf(bytes, filename, handle);
      setNotice(
        handle
          ? "PDF 已保存到你选择的位置。"
          : "PDF 已下载。当前浏览器不支持选择保存位置；可在下载设置中开启“每次询问保存位置”，或使用桌面 Chrome / Edge。",
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError")
        setNotice("已取消保存，简历内容未改变。");
      else
        setNotice(
          `PDF 导出失败：${error instanceof Error ? error.message : "请重试"}。简历内容未改变。`,
        );
    } finally {
      setExporting(false);
    }
  }
  const addSection = (kind: Section["kind"]) =>
    change({
      ...doc,
      sections: [
        ...doc.sections,
        {
          id: uid(),
          title: kind === "list" ? "自定义模块" : "新增经历",
          kind,
          visible: true,
          items: kind === "list" ? [""] : [],
          entries: [],
        },
      ],
    });
  const visibleCount = doc.sections.filter((s) => s.visible).length;
  const previewHeight = Math.max(PAGE_HEIGHT, (fit?.used || 0) + 18 * MM);

  return (
    <div className={`app mobile-${mobileView}`}>
      <header className="app-header">
        <div className="brand">
          <svg
            width="24"
            height="28"
            viewBox="0 0 24 28"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3 1h12l6 6v20H3zM15 1v7h6M7 14h10M7 19h7"
              stroke="currentColor"
              strokeWidth="1.6"
            />
          </svg>
          <div>
            <strong>一页</strong>
            <span>简历工作台</span>
          </div>
        </div>
        <span className="document-name">
          {doc.profile.name || "我的简历"}
          <span className="save-status" role="status">
            {saveState}
          </span>
        </span>
        <div className="header-actions">
          <button onClick={undo} disabled={!past.length}>
            撤销
          </button>
          <button onClick={redo} disabled={!future.length}>
            重做
          </button>
          <button onClick={() => importRef.current?.click()}>导入</button>
          <button onClick={exportJson}>导出 JSON</button>
          <button
            className="primary"
            onClick={exportPdf}
            disabled={!!fit?.overflow || exporting}
          >
            {exporting ? "正在生成…" : "导出 PDF"}{" "}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </header>
      {notice && (
        <div className="notice" role="alert">
          <span>{notice}</span>
          {saveBlocked && (
            <button
              onClick={() => {
                setSaveBlocked(false);
                setNotice("");
              }}
            >
              使用当前内容并保存
            </button>
          )}
          <button aria-label="关闭提示" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      <div className="mobile-switch">
        <button
          className={mobileView === "edit" ? "selected" : ""}
          onClick={() => setMobileView("edit")}
        >
          编辑简历
        </button>
        <button
          className={mobileView === "preview" ? "selected" : ""}
          onClick={() => setMobileView("preview")}
        >
          A4 预览
        </button>
      </div>
      <main className="workspace">
        <aside className="editor-panel" aria-label="简历编辑器">
          <div className="editor-heading">
            <h1>编辑简历</h1>
            <span>{visibleCount} 个显示模块</span>
          </div>
          <div className="tabs" role="tablist" aria-label="编辑面板">
            {(["content", "theme", "layout"] as const).map((t, i) => (
              <button
                role="tab"
                aria-selected={tab === t}
                key={t}
                onClick={() => setTab(t)}
              >
                {["内容", "主题", "排版"][i]}
              </button>
            ))}
          </div>
          <div className="editor-body" role="tabpanel">
            {tab === "content" && (
              <>
                <details className="editor-section" open>
                  <summary>
                    个人信息<span>姓名与联系方式</span>
                  </summary>
                  <div className="section-fields">
                    <Field
                      label="姓名"
                      value={doc.profile.name}
                      onChange={(v) => updateProfile("name", v)}
                    />
                    <Field
                      label="学校 / 专业 / 学历 / 时间"
                      value={doc.profile.school}
                      multiline
                      onChange={(v) => updateProfile("school", v)}
                    />
                    <div className="field-pair">
                      <Field
                        label="邮箱"
                        value={doc.profile.email}
                        onChange={(v) => updateProfile("email", v)}
                      />
                      <Field
                        label="电话"
                        value={doc.profile.phone}
                        onChange={(v) => updateProfile("phone", v)}
                      />
                    </div>
                    <Field
                      label="GitHub 网址"
                      value={doc.profile.github}
                      onChange={(v) => updateProfile("github", v)}
                    />
                    <div className="photo-editor">
                      {doc.profile.photo && (
                        <img src={doc.profile.photo} alt="当前证件照" />
                      )}
                      <div>
                        <button onClick={() => photoRef.current?.click()}>
                          更换照片
                        </button>
                        <p>JPG、PNG、WebP · 最大 2 MB</p>
                      </div>
                    </div>
                  </div>
                </details>
                {doc.sections.map((s, i) => (
                  <details className="editor-section" key={s.id}>
                    <summary>
                      {s.title || "未命名模块"}
                      <span>
                        {s.visible
                          ? s.kind === "list"
                            ? `${s.items.length} 条内容`
                            : `${s.entries.length} 段经历`
                          : "已隐藏"}
                      </span>
                    </summary>
                    <div className="section-fields">
                      <div className="section-tools">
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={s.visible}
                            onChange={(e) =>
                              updateSection({ ...s, visible: e.target.checked })
                            }
                          />
                          显示模块
                        </label>
                        <OrderButtons
                          index={i}
                          count={doc.sections.length}
                          label={`${s.title}模块`}
                          onMove={(d) =>
                            change({
                              ...doc,
                              sections: move(doc.sections, i, d),
                            })
                          }
                          onDelete={() =>
                            change({
                              ...doc,
                              sections: doc.sections.filter(
                                (x) => x.id !== s.id,
                              ),
                            })
                          }
                        />
                      </div>
                      <Field
                        label="模块名称"
                        value={s.title}
                        onChange={(v) => updateSection({ ...s, title: v })}
                      />
                      {s.kind === "list" ? (
                        <TextItems
                          items={s.items}
                          label="内容"
                          onChange={(v) => updateSection({ ...s, items: v })}
                        />
                      ) : (
                        <>
                          {s.entries.map((e, j) => (
                            <div className="entry-box" key={e.id}>
                              <div className="entry-box-heading">
                                <span>经历 {j + 1}</span>
                                <OrderButtons
                                  index={j}
                                  count={s.entries.length}
                                  label={`经历 ${j + 1}`}
                                  onMove={(d) =>
                                    updateSection({
                                      ...s,
                                      entries: move(s.entries, j, d),
                                    })
                                  }
                                  onDelete={() =>
                                    updateSection({
                                      ...s,
                                      entries: s.entries.filter(
                                        (x) => x.id !== e.id,
                                      ),
                                    })
                                  }
                                />
                              </div>
                              <EntryEditor
                                entry={e}
                                onChange={(v) =>
                                  updateSection({
                                    ...s,
                                    entries: s.entries.map((x) =>
                                      x.id === v.id ? v : x,
                                    ),
                                  })
                                }
                              />
                            </div>
                          ))}
                          <button
                            className="add-button"
                            onClick={() =>
                              updateSection({
                                ...s,
                                entries: [
                                  ...s.entries,
                                  {
                                    id: uid(),
                                    title: "",
                                    role: "",
                                    date: "",
                                    stack: "",
                                    description: "",
                                    bullets: [],
                                  },
                                ],
                              })
                            }
                          >
                            ＋ 添加经历
                          </button>
                        </>
                      )}
                    </div>
                  </details>
                ))}
                <div className="add-module">
                  <span>添加模块</span>
                  <button onClick={() => addSection("list")}>
                    ＋ 文字列表
                  </button>
                  <button onClick={() => addSection("experience")}>
                    ＋ 项目 / 经历
                  </button>
                </div>
              </>
            )}
            {tab === "theme" && (
              <div className="settings-panel">
                <h3>选择主题</h3>
                <p className="muted">同一份内容，不同的表达方式。</p>
                <div className="theme-options">
                  {Object.entries(presets).map(([key, p]) => (
                    <button
                      key={key}
                      className={`theme-option ${doc.theme.preset === key ? "selected" : ""}`}
                      aria-pressed={doc.theme.preset === key}
                      onClick={() =>
                        updateTheme({
                          preset: key as keyof typeof presets,
                          accent: p.accent,
                        })
                      }
                    >
                      <span
                        className={`theme-sample sample-${key}`}
                        style={
                          { "--sample-color": p.accent } as React.CSSProperties
                        }
                      >
                        <i />
                        <b />
                        <i />
                        <i />
                        <b />
                        <i />
                      </span>
                      <span>{p.name}</span>
                    </button>
                  ))}
                </div>
                <label className="color-setting">
                  <span>自定义主题色</span>
                  <input
                    type="color"
                    value={doc.theme.accent}
                    onChange={(e) => updateTheme({ accent: e.target.value })}
                  />
                  <code>{doc.theme.accent}</code>
                </label>
                <label className="field">
                  <span>正文字体</span>
                  <select
                    value={doc.theme.font}
                    onChange={(e) =>
                      updateTheme({ font: e.target.value as "sans" | "serif" })
                    }
                  >
                    <option value="sans">微软雅黑 / 系统黑体</option>
                    <option value="serif">宋体 / 系统衬线</option>
                  </select>
                </label>
                <label className="check setting-row">
                  <input
                    type="checkbox"
                    checked={doc.theme.photo}
                    onChange={(e) => updateTheme({ photo: e.target.checked })}
                  />
                  显示证件照
                </label>
                <p className="setting-note">
                  主题只改变视觉样式，简历内容独立保存。照片和主题会一同包含在
                  JSON 备份中。
                </p>
              </div>
            )}
            {tab === "layout" && (
              <div className="settings-panel">
                <h3>让内容恰好落在一页</h3>
                <p className="muted">固定 A4 纸张，自动寻找舒适的间距。</p>
                <label className="check setting-row">
                  <input
                    type="checkbox"
                    checked={doc.theme.autoFit}
                    onChange={(e) => updateTheme({ autoFit: e.target.checked })}
                  />
                  自动适配一页 A4
                </label>
                <label className="field">
                  <span>
                    基础字号 <span>{doc.theme.fontSize.toFixed(1)} pt</span>
                  </span>
                  <input
                    type="range"
                    min="9"
                    max="12"
                    step="0.1"
                    value={doc.theme.fontSize}
                    onChange={(e) =>
                      updateTheme({ fontSize: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="field">
                  <span>间距偏好</span>
                  <select
                    value={doc.theme.spacing}
                    onChange={(e) =>
                      updateTheme({
                        spacing: e.target
                          .value as ResumeDocument["theme"]["spacing"],
                      })
                    }
                  >
                    <option value="compact">紧凑</option>
                    <option value="balanced">均衡</option>
                    <option value="relaxed">舒展</option>
                  </select>
                </label>
                <div className="layout-facts">
                  <div>
                    <span>纸张</span>
                    <strong>210 × 297 mm</strong>
                  </div>
                  <div>
                    <span>页边距</span>
                    <strong>上下 9 / 左右 10 mm</strong>
                  </div>
                  <div>
                    <span>当前字号</span>
                    <strong>{fit?.fontSize.toFixed(2)} pt</strong>
                  </div>
                  <div>
                    <span>当前行距</span>
                    <strong>{fit?.lineHeight.toFixed(2)} 倍</strong>
                  </div>
                  <div>
                    <span>模块间距</span>
                    <strong>{fit?.sectionGap.toFixed(1)} px</strong>
                  </div>
                </div>
                <p className="setting-note">
                  先调整间距，再缩小字号，最低
                  9pt。内容较少时保留自然留白；内容过多时提示精简，不自动删除或截断。
                </p>
                <p className="setting-note">
                  点击导出直接生成 PDF 并选择保存位置，不打开打印窗口。桌面
                  Chrome / Edge 支持位置选择；其他浏览器使用普通下载。
                </p>
              </div>
            )}
          </div>
          <footer className="editor-footer">
            <span>本地编辑 · 自动保存</span>
            <button
              onClick={() => {
                if (
                  window.confirm(
                    "恢复匿名初始模板和主题？当前内容可以通过撤销恢复。",
                  )
                ) {
                  change(defaultDocument);
                  setSaveBlocked(false);
                }
              }}
            >
              恢复初始模板
            </button>
          </footer>
        </aside>
        <section className="preview-panel" aria-label="实时预览">
          <div className="preview-toolbar">
            <div>
              <strong>纸张预览</strong>
              <span>A4 · 210 × 297 mm</span>
            </div>
            <label className="zoom-label">
              缩放{" "}
              <select
                aria-label="预览缩放"
                value={zoom}
                onChange={(e) => setZoom(e.target.value)}
              >
                <option value="fit">适合宽度</option>
                <option value="0.75">75%</option>
                <option value="1">100%</option>
              </select>
            </label>
          </div>
          <div
            className={`fit-strip ${fit?.overflow ? "overflow" : ""}`}
            aria-live="polite"
          >
            <span className="status-dot" />
            <span>
              {!fit
                ? "正在排版…"
                : fit.overflow
                  ? `超出一页 ${((fit.used - fit.available) / MM).toFixed(1)} mm · 请精简：${fit.affected.join("、") || "个人信息"}`
                  : fit.limited
                    ? "已适配一页 · 保留自然留白"
                    : "已适配一页 · 内容完整"}
            </span>
            <span className="fit-caption">
              {fit?.fontSize.toFixed(2)} pt / 行距 {fit?.lineHeight.toFixed(2)}
            </span>
          </div>
          <div className="preview-stage" ref={stageRef}>
            <div
              className="paper-frame"
              style={{ width: 210 * MM * scale, height: previewHeight * scale }}
            >
              <div
                className="paper-scaler"
                style={{ transform: `scale(${scale})` }}
              >
                <Resume ref={contentRef} doc={doc} />
                {fit?.overflow && (
                  <div
                    className="page-boundary"
                    style={{ top: 9 * MM + CONTENT_HEIGHT }}
                  >
                    一页内容边界
                  </div>
                )}
              </div>
            </div>
          </div>
          <footer className="preview-footer">
            <span>预览与 PDF 共用同一版式</span>
            <span>仅保存在当前浏览器，跨设备请导出 JSON</span>
          </footer>
        </section>
      </main>
      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => importJson(e.target.files?.[0])}
      />
      <input
        ref={photoRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => uploadPhoto(e.target.files?.[0])}
      />
    </div>
  );
}
