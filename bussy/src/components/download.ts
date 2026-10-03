"use client";

/** Trigger a browser download for in-memory text. */
export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["\uFEFF" + text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
