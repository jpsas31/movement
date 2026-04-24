export function bumpElementOpacity(el: HTMLElement, delta: number): void {
  const next = Math.min(
    1,
    Math.max(0, parseFloat(el.style.opacity || "1") + delta),
  );
  el.style.opacity = next.toFixed(1);
}

export type SharedMovementKeyHandlers = {
  toggleAudioInput: () => void | Promise<void>;
  toggleLabels?: () => void;
  butterchurnOpacityEl: HTMLElement;
};

/** @returns true if the event was handled (caller should not run other shortcuts). */
export function handleSharedMovementKeys(
  e: KeyboardEvent,
  h: SharedMovementKeyHandlers,
): boolean {
  if (e.key === "a" || e.key === "A") {
    e.preventDefault();
    void h.toggleAudioInput();
    return true;
  }
  if (e.key === "i") {
    if (!h.toggleLabels) return false;
    h.toggleLabels();
    return true;
  }
  if (e.key === ".") {
    bumpElementOpacity(h.butterchurnOpacityEl, 0.1);
    return true;
  }
  if (e.key === ",") {
    bumpElementOpacity(h.butterchurnOpacityEl, -0.1);
    return true;
  }
  return false;
}
