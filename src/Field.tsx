import { useId, useLayoutEffect, useRef, useState } from "react";
import { toggleBold } from "./bold";

export function Field({
  label,
  value,
  onChange,
  multiline = false,
  ...props
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const id = useId(),
    input = useRef<HTMLTextAreaElement>(null);
  const pending = useRef<{ start: number; end: number } | null>(null);
  const [selected, setSelected] = useState(false);
  const apply = () => {
    const el = input.current;
    if (!el || el.selectionStart === el.selectionEnd) return;
    const next = toggleBold(value, el.selectionStart, el.selectionEnd);
    if (next.value === value) return;
    pending.current = next;
    onChange(next.value);
  };
  useLayoutEffect(() => {
    if (!pending.current || !input.current) return;
    const { start, end } = pending.current;
    pending.current = null;
    input.current.focus();
    input.current.setSelectionRange(start, end);
    setSelected(start !== end);
  }, [value]);
  return (
    <div className="field">
      <div className="field-heading">
        <label htmlFor={id}>{label}</label>
        {multiline && (
          <button
            type="button"
            className="bold-button"
            aria-label={`加粗 / 取消加粗：${label}`}
            title="选中文字后加粗或取消（Ctrl+B / ⌘B）"
            disabled={!selected}
            onMouseDown={(e) => e.preventDefault()}
            onClick={apply}
          >
            <b>B</b> 加粗
          </button>
        )}
      </div>
      {multiline ? (
        <>
          <textarea
            id={id}
            ref={input}
            value={value}
            rows={3}
            onChange={(e) => onChange(e.target.value)}
            onSelect={(e) =>
              setSelected(
                e.currentTarget.selectionStart !== e.currentTarget.selectionEnd,
              )
            }
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
                e.preventDefault();
                if (!e.nativeEvent.isComposing) apply();
              }
            }}
            aria-describedby={`${id}-hint`}
            {...props}
          />
          <span id={`${id}-hint`} className="format-hint">
            选中文字加粗，再次操作可取消；支持 **文字**
          </span>
        </>
      ) : (
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          {...props}
        />
      )}
    </div>
  );
}
