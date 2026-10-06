"use client";

import { useRef, type KeyboardEvent } from "react";

type FormatAction = "bold" | "italic" | "underline" | "strike" | "link" | "list";

const toolbar: { action: FormatAction; label: string; title: string }[] = [
  { action: "bold", label: "B", title: "Negrita" },
  { action: "italic", label: "I", title: "Cursiva" },
  { action: "underline", label: "U", title: "Subrayado" },
  { action: "strike", label: "S", title: "Tachado" },
  { action: "link", label: "Enlace", title: "Insertar enlace" },
  { action: "list", label: "• Lista", title: "Lista con viñetas" },
];

export function RichTextInput({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  function apply(action: FormatAction) {
    const input = inputRef.current;
    if (!input) return;
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? start;
    const selected = value.slice(start, end);
    let before = "";
    let after = "";
    let replacement = selected;

    if (action === "link") {
      const href = window.prompt("Dirección del enlace (ruta interna o HTTPS):", "https://");
      if (!href) return;
      replacement = `[${selected || "texto del enlace"}](${href})`;
    } else if (action === "list") {
      const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
      onChange(`${value.slice(0, lineStart)}- ${value.slice(lineStart)}`);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(start + 2, end + 2);
      });
      return;
    } else {
      const marks: Record<Exclude<FormatAction, "link" | "list">, [string, string]> = {
        bold: ["**", "**"], italic: ["*", "*"], underline: ["__", "__"], strike: ["~~", "~~"],
      };
      [before, after] = marks[action];
      replacement = selected || "texto";
    }

    const next = `${value.slice(0, start)}${before}${replacement}${after}${value.slice(end)}`;
    onChange(next);
    const selectionStart = start + before.length;
    const selectionEnd = selectionStart + replacement.length;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (!(event.ctrlKey || event.metaKey)) return;
    const action = event.key.toLowerCase() === "b" ? "bold" : event.key.toLowerCase() === "i" ? "italic" : null;
    if (action) {
      event.preventDefault();
      apply(action);
    }
  }

  return (
    <div className="block min-w-0 text-sm font-medium text-foreground">
      <span>{label}</span>
      <div className="mt-1 overflow-hidden rounded-md border border-border bg-background focus-within:ring-2 focus-within:ring-primary/40">
        <div role="toolbar" aria-label={`Formato para ${label}`} className="flex flex-wrap gap-1 border-b border-border bg-surface-secondary/40 p-1">
          {toolbar.map((item) => (
            <button
              key={item.action}
              type="button"
              title={item.title}
              aria-label={item.title}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => apply(item.action)}
              className={`min-h-8 min-w-8 rounded px-2 text-xs text-foreground-secondary hover:bg-surface-hover ${item.action === "bold" ? "font-bold" : item.action === "italic" ? "italic" : item.action === "underline" ? "underline" : item.action === "strike" ? "line-through" : ""}`}
            >
              {item.label}
            </button>
          ))}
          <span className="self-center px-1 text-[11px] font-normal text-foreground-muted">Selecciona texto y aplica formato</span>
        </div>
        {multiline ? (
          <textarea ref={(element) => { inputRef.current = element; }} rows={value.length > 180 ? 5 : 3} maxLength={5000} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={onKeyDown} className="w-full resize-y bg-transparent px-3 py-2 font-normal outline-none" />
        ) : (
          <input ref={(element) => { inputRef.current = element; }} maxLength={500} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={onKeyDown} className="w-full bg-transparent px-3 py-2 font-normal outline-none" />
        )}
      </div>
      <p className="mt-1 text-xs font-normal text-foreground-muted">El formato se conserva al guardar. También puedes usar Ctrl+B y Ctrl+I.</p>
    </div>
  );
}
