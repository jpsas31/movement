function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function row(label: string, value: string): string {
  return `<div style="display:flex;gap:10px;justify-content:space-between;align-items:baseline;border-bottom:1px solid rgba(255,255,255,.08);padding:3px 0"><span style="opacity:.55">${escapeHtml(label)}</span><span style="text-align:right;max-width:68%">${escapeHtml(value)}</span></div>`;
}

export type OptionsSummaryHud = {
  root: HTMLElement;
  toggle: () => void;
  isVisible: () => boolean;
  repaint: () => void;
};

/**
 * Toggle with **O** in main / debug. Repaints on an interval while open.
 */
export function createOptionsSummaryHud(
  title: string,
  getBodyHtml: () => string,
): OptionsSummaryHud {
  const root = document.createElement("div");
  root.style.cssText = `
    position: fixed; top: 12px; right: 12px; z-index: 25;
    max-width: min(440px, 94vw); max-height: 78vh; overflow: auto;
    padding: 10px 12px 12px; border-radius: 10px;
    background: rgba(12,12,14,0.9); color: rgba(255,255,255,0.92);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
    font-size: 11px; line-height: 1.4;
    pointer-events: none; display: none;
    box-shadow: 0 8px 32px rgba(0,0,0,0.55);
    border: 1px solid rgba(255,255,255,0.1);
  `;
  document.body.appendChild(root);

  let visible = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  function stopInterval() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function paint() {
    root.innerHTML =
      `<div style="font-weight:600;letter-spacing:.02em;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.15)">${escapeHtml(title)}</div>` +
      `<div style="margin-bottom:10px">${getBodyHtml()}</div>` +
      `<div style="opacity:.45;font-size:10px;line-height:1.35">Press <strong>O</strong> to hide · updates while open</div>`;
  }

  return {
    root,
    toggle() {
      visible = !visible;
      root.style.display = visible ? "block" : "none";
      if (visible) {
        stopInterval();
        paint();
        intervalId = setInterval(paint, 450);
      } else {
        stopInterval();
      }
    },
    isVisible: () => visible,
    repaint: paint,
  };
}

export function buildRows(pairs: { label: string; value: string }[]): string {
  return pairs.map((p) => row(p.label, p.value)).join("");
}
