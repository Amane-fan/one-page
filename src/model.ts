import { z } from "zod";
import initial from "./data/resume.json";

const text = z.string().max(20000);
const entrySchema = z.object({
  id: z.string(),
  title: text,
  role: text,
  date: text,
  stack: text,
  description: text,
  bullets: z.array(text).max(100),
});
const sectionSchema = z.object({
  id: z.string(),
  title: text,
  kind: z.enum(["list", "experience"]),
  visible: z.boolean(),
  items: z.array(text).max(100),
  entries: z.array(entrySchema).max(30),
});
export const documentSchema = z
  .object({
    version: z.literal(1),
    profile: z.object({
      name: text,
      school: text,
      email: text,
      phone: text,
      github: text,
      photo: z
        .string()
        .max(4000000)
        .refine(
          (v) =>
            !v ||
            /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v),
          "照片格式无效",
        ),
    }),
    sections: z.array(sectionSchema).max(30),
    theme: z.object({
      preset: z.enum(["blue", "mono", "sage"]),
      accent: z.string().regex(/^#[0-9a-f]{6}$/i),
      font: z.enum(["sans", "serif"]),
      fontSize: z.number().min(9).max(12),
      photo: z.boolean(),
      autoFit: z.boolean(),
      spacing: z.enum(["compact", "balanced", "relaxed"]),
    }),
  })
  .superRefine((doc, ctx) => {
    const ids = doc.sections.flatMap((s) => [
      s.id,
      ...s.entries.map((e) => e.id),
    ]);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "模块或经历 ID 重复" });
  });
export type ResumeDocument = z.infer<typeof documentSchema>;
export type Section = ResumeDocument["sections"][number];
export type Entry = z.infer<typeof entrySchema>;
export const defaultDocument = documentSchema.parse(initial);
export const STORAGE_KEY = "onepage-resume-v1";
export const presets = {
  blue: { name: "商务蓝", accent: "#174a70" },
  mono: { name: "简洁黑白", accent: "#252525" },
  sage: { name: "低饱和绿", accent: "#386052" },
} as const;
export const uid = () => crypto.randomUUID();
export const move = <T>(items: T[], index: number, delta: number): T[] => {
  const next = items.slice();
  const target = index + delta;
  if (target >= 0 && target < next.length)
    [next[index], next[target]] = [next[target], next[index]];
  return next;
};
export function githubUrl(value: string) {
  try {
    const u = new URL(
      value.startsWith("https://") ? value : `https://${value}`,
    );
    return u.hostname === "github.com" ? u.href : undefined;
  } catch {
    return undefined;
  }
}
export function readDraft(): { doc: ResumeDocument; warning: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return {
      doc: raw ? documentSchema.parse(JSON.parse(raw)) : defaultDocument,
      warning: "",
    };
  } catch {
    return {
      doc: defaultDocument,
      warning:
        "本地草稿无法读取，已展示初始简历。原草稿未覆盖，请先导出或确认后保存。",
    };
  }
}
