"use client";

import { useLayoutEffect, useRef, type KeyboardEvent } from "react";

type FormatAction = "bold" | "italic" | "underline" | "strike" | "link" | "list";

const toolbar: { action: FormatAction; label: string; title: string }[] = [
  { action: "bold", label: "B", title: "Negrita" },
  { action: "italic", label: "I", title: "Cursiva" },
  { action: "underline", label: "U", title: "Subrayado" },
  { action: "strike", label: "S", title: "Tachado" },
  { action: "link", label: "Enlace", title: "Insertar enlace" },
  { action: "list", label: "• Lista", title: "Lista con viñetas" },
];

function safeHref(href: string): boolean {
  const value = href.trim();
  return (value.startsWith("/") && !value.startsWith("//")) || /^(https:\/\/|mailto:|tel:)/i.test(value);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function markdownToHtml(value: string): string {
  return value.split(/\r?\n/).map((line) => {
    const listItem = line.match(/^\s*[-*]\s+(.+)$/);
    let html = escapeHtml(listItem ? listItem[1] : line);
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label: string, href: string) => safeHref(href) ? `<a href="${escapeHtml(href)}">${label}</a>` : match);
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__([^_]+)__/g, "<u>$1</u>");
    html = html.replace(/~~([^~]+)~~/g, "<s>$1</s>");
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    html = html.replace(/_([^_]+)_/g, "<em>$1</em>");
    return listItem ? `<ul><li>${html}</li></ul>` : html || "<br>";
  }).join("<br>");
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  const content = Array.from(node.childNodes).map(nodeToMarkdown).join("");
  switch (node.tagName) {
    case "B": case "STRONG": return `**${content}**`;
    case "I": case "EM": return `*${content}*`;
    case "U": return `__${content}__`;
    case "S": case "STRIKE": case "DEL": return `~~${content}~~`;
    case "A": {
      const href = node.getAttribute("href") ?? "";
      return safeHref(href) ? `[${content}](${href})` : content;
    }
    case "BR": return "\n";
    case "LI": return `- ${content.trim()}`;
    case "UL": case "OL": return Array.from(node.children).map(nodeToMarkdown).join("\n");
    case "DIV": case "P": return `${content}\n`;
    default: return content;
  }
}

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
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmittedValue = useRef<string | null>(null);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (lastEmittedValue.current === value) {
      lastEmittedValue.current = null;
      return;
    }
    editor.innerHTML = markdownToHtml(value);
  }, [value]);

  function emitChange() {
    const editor = editorRef.current;
    if (!editor) return;
    const next = nodeToMarkdown(editor).replace(/\n+$/, "");
    lastEmittedValue.current = next;
    onChange(next);
  }

  function apply(action: FormatAction) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    if (action === "link") {
      const href = window.prompt("Dirección del enlace (ruta interna o HTTPS):", "https://");
      if (!href || !safeHref(href)) return;
      document.execCommand("createLink", false, href.trim());
    } else if (action === "list") {
      document.execCommand("insertUnorderedList");
    } else {
      const commands: Record<Exclude<FormatAction, "link" | "list">, string> = {
        bold: "bold", italic: "italic", underline: "underline", strike: "strikeThrough",
      };
      document.execCommand(commands[action]);
    }
    emitChange();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    const action: FormatAction | null = key === "b" ? "bold" : key === "i" ? "italic" : key === "u" ? "underline" : null;
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
          <span className="self-center px-1 text-[11px] font-normal text-foreground-muted">Selecciona el texto y aplica formato</span>
        </div>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label={label}
          aria-multiline={multiline}
          onInput={emitChange}
          onKeyDown={onKeyDown}
          className={`min-h-10 w-full px-3 py-2 font-normal outline-none [&_a]:text-primary [&_a]:underline [&_li]:ml-5 [&_li]:list-disc ${multiline ? "min-h-24 whitespace-pre-wrap" : "whitespace-nowrap"}`}
        />
      </div>
      <p className="mt-1 text-xs font-normal text-foreground-muted">El texto se muestra con su formato. También puedes usar Ctrl+B y Ctrl+I.</p>
    </div>
  );
}
