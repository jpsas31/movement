import { type WinampSkin, DEFAULT_SKIN, SKIN_REGISTRY } from "./skin";

export interface ToggleItem {
  label: string;
  shortcut: string;
  getValue: () => string;
  onToggle: () => void;
}

export interface SidePanelConfig {
  getPresetKeys: () => string[];
  getCurrentIndex: () => number;
  onPresetSelect: (index: number) => void;
  getToggles: () => ToggleItem[];
  formatPresetName: (key: string) => string;
}

export interface SidePanel {
  root: HTMLElement;
  toggle: () => void;
  isVisible: () => boolean;
  repaint: () => void;
  setSkin: (skin: WinampSkin) => void;
}

const PANEL_WIDTH = 290;

const SKIN_STORAGE_KEY = "movement.skin";

function loadStoredSkin(): WinampSkin {
  try {
    const name = localStorage.getItem(SKIN_STORAGE_KEY);
    if (!name) return DEFAULT_SKIN;
    return SKIN_REGISTRY.find((s) => s.name === name) ?? DEFAULT_SKIN;
  } catch {
    return DEFAULT_SKIN;
  }
}

export function createSidePanel(config: SidePanelConfig): SidePanel {
  let skin = loadStoredSkin();
  let visible = false;
  let effectsExpanded = true;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  // Collect all skin-dependent elements for reskinning
  const skinEls: {
    el: HTMLElement;
    apply: (s: WinampSkin, el: HTMLElement) => void;
  }[] = [];

  function skinned(el: HTMLElement, apply: (s: WinampSkin, el: HTMLElement) => void) {
    apply(skin, el);
    skinEls.push({ el, apply });
    return el;
  }

  // --- Root ---
  const root = document.createElement("div");
  root.style.cssText = `
    position: fixed; top: 0; left: 0; bottom: 0;
    width: ${PANEL_WIDTH}px; z-index: 30;
    display: flex; flex-direction: column;
    transform: translateX(-100%);
    transition: transform 0.18s ease;
    user-select: none;
  `;
  document.body.appendChild(root);

  // --- Toggle tab ---
  const tab = document.createElement("div");
  skinned(tab, (s, el) => {
    el.style.cssText = `
      position: fixed; top: 50%; left: 0;
      transform: translateY(-50%);
      width: 18px; height: 48px; z-index: 29;
      background: url(${s.sprites.left_tile}) repeat-y right top;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      color: ${s.colors.current}; font-family: ${s.colors.font}; opacity: 0.7;
    `;
    el.innerHTML = `<span style="writing-mode:vertical-lr;letter-spacing:2px;font-size:8px;text-shadow:0 1px 2px rgba(0,0,0,0.8)">PANEL</span>`;
  });
  tab.addEventListener("mouseenter", () => { tab.style.opacity = "1"; });
  tab.addEventListener("mouseleave", () => { tab.style.opacity = "0.7"; });
  document.body.appendChild(tab);

  // --- Top bar ---
  const topBar = document.createElement("div");
  topBar.style.cssText = `height:20px;min-height:20px;flex-shrink:0;display:flex;`;
  root.appendChild(topBar);

  const topLeft = skinned(document.createElement("div"), (s, el) => {
    el.style.cssText = `width:25px;min-width:25px;height:20px;background:url(${s.sprites.top_left}) no-repeat;`;
  });
  topBar.appendChild(topLeft);

  const titleBarCenter = skinned(document.createElement("div"), (s, el) => {
    el.style.cssText = `
      flex:1;height:20px;background:url(${s.sprites.top_tile}) repeat-x;
      display:flex;align-items:center;justify-content:center;position:relative;
    `;
    const tt = s.colors.titleText ?? s.colors.current;
    const ts = s.colors.titleShadow ?? "rgba(0,0,0,0.9)";
    el.innerHTML = `<span style="font-family:${s.colors.font};font-size:10px;font-weight:bold;letter-spacing:1.5px;color:${tt};text-shadow:0 1px 3px ${ts},0 0 8px ${ts}">MOVEMENT</span>`;
  });
  topBar.appendChild(titleBarCenter);

  const topRight = skinned(document.createElement("div"), (s, el) => {
    el.style.cssText = `width:25px;min-width:25px;height:20px;background:url(${s.sprites.top_right}) no-repeat;position:relative;cursor:pointer;`;
  });
  topRight.title = "Close panel";
  topRight.addEventListener("click", () => toggle());
  topBar.appendChild(topRight);

  // --- Sub-header ---
  const subHeader = document.createElement("div");
  subHeader.style.cssText = `height:20px;min-height:20px;flex-shrink:0;display:flex;`;
  root.appendChild(subHeader);

  for (const pos of ["left", "center", "right"] as const) {
    const el = skinned(document.createElement("div"), (s, el) => {
      const base = `height:20px;background:url(${s.sprites.top_tile}) repeat-x;`;
      if (pos === "center") {
        el.style.cssText = base + `flex:1;display:flex;align-items:center;justify-content:center;`;
        const tt = s.colors.titleText ?? s.colors.current;
        const ts = s.colors.titleShadow ?? "rgba(0,0,0,0.9)";
        el.innerHTML = `<span style="font-family:${s.colors.font};font-size:9px;font-weight:bold;letter-spacing:2px;color:${tt};text-shadow:0 1px 3px ${ts},0 0 8px ${ts};opacity:0.85">PRESETS</span>`;
      } else {
        el.style.cssText = base + `width:25px;min-width:25px;`;
      }
    });
    subHeader.appendChild(el);
  }

  // --- Playlist middle ---
  const middle = document.createElement("div");
  middle.style.cssText = `flex:1;display:flex;overflow:hidden;`;
  root.appendChild(middle);

  const mLeft = skinned(document.createElement("div"), (s, el) => {
    el.style.cssText = `width:12px;min-width:12px;background:url(${s.sprites.left_tile}) repeat-y;`;
  });
  middle.appendChild(mLeft);

  const presetList = skinned(document.createElement("div"), (s, el) => {
    el.style.cssText = `
      flex:1;overflow-y:auto;overflow-x:hidden;
      background:${s.colors.normalBg};color:${s.colors.normal};
      font-family:${s.colors.font};padding:3px 0;
      scrollbar-width:thin;scrollbar-color:${s.colors.normal} ${s.colors.normalBg};
    `;
  });
  middle.appendChild(presetList);

  const mRight = skinned(document.createElement("div"), (s, el) => {
    el.style.cssText = `width:20px;min-width:20px;background:url(${s.sprites.right_tile}) repeat-y;`;
  });
  middle.appendChild(mRight);

  // --- Effects section ---
  const effectsSection = document.createElement("div");
  effectsSection.style.cssText = `flex-shrink:0;max-height:45vh;overflow-y:auto;`;
  root.appendChild(effectsSection);

  const effectsHeader = skinned(document.createElement("div"), (s, el) => {
    el.style.cssText = `
      height:20px;min-height:20px;
      background:url(${s.sprites.top_tile}) repeat-x;
      display:flex;align-items:center;justify-content:center;cursor:pointer;gap:6px;
    `;
  });
  effectsHeader.addEventListener("click", () => { effectsExpanded = !effectsExpanded; repaint(); });
  effectsSection.appendChild(effectsHeader);

  const effectsMiddle = document.createElement("div");
  effectsMiddle.style.cssText = `display:flex;`;
  effectsSection.appendChild(effectsMiddle);

  const eLeft = skinned(document.createElement("div"), (s, el) => {
    el.style.cssText = `width:12px;min-width:12px;background:url(${s.sprites.left_tile}) repeat-y;`;
  });
  effectsMiddle.appendChild(eLeft);

  const effectsBody = skinned(document.createElement("div"), (s, el) => {
    el.style.cssText = `flex:1;background:${s.colors.normalBg};padding:3px 0;`;
  });
  effectsMiddle.appendChild(effectsBody);

  const eRight = skinned(document.createElement("div"), (s, el) => {
    el.style.cssText = `width:20px;min-width:20px;background:url(${s.sprites.right_tile}) repeat-y;`;
  });
  effectsMiddle.appendChild(eRight);

  // --- Skin selector section ---
  const skinSection = document.createElement("div");
  skinSection.style.cssText = `flex-shrink:0;`;
  root.appendChild(skinSection);

  const skinHeader = skinned(document.createElement("div"), (s, el) => {
    el.style.cssText = `
      height:20px;min-height:20px;
      background:url(${s.sprites.top_tile}) repeat-x;
      display:flex;align-items:center;justify-content:center;
    `;
    const tt = s.colors.titleText ?? s.colors.current;
    const ts = s.colors.titleShadow ?? "rgba(0,0,0,0.9)";
    el.innerHTML = `<span style="font-family:${s.colors.font};font-size:9px;font-weight:bold;letter-spacing:2px;color:${tt};text-shadow:0 1px 3px ${ts},0 0 8px ${ts};opacity:0.85">SKINS</span>`;
  });
  skinSection.appendChild(skinHeader);

  const skinMiddle = document.createElement("div");
  skinMiddle.style.cssText = `display:flex;`;
  skinSection.appendChild(skinMiddle);

  const sLeft = skinned(document.createElement("div"), (s, el) => {
    el.style.cssText = `width:12px;min-width:12px;background:url(${s.sprites.left_tile}) repeat-y;`;
  });
  skinMiddle.appendChild(sLeft);

  const skinList = skinned(document.createElement("div"), (s, el) => {
    el.style.cssText = `flex:1;background:${s.colors.normalBg};padding:3px 0;`;
  });
  skinMiddle.appendChild(skinList);

  const sRight = skinned(document.createElement("div"), (s, el) => {
    el.style.cssText = `width:20px;min-width:20px;background:url(${s.sprites.right_tile}) repeat-y;`;
  });
  skinMiddle.appendChild(sRight);

  // --- Bottom bar ---
  const bottomBar = document.createElement("div");
  bottomBar.style.cssText = `height:38px;min-height:38px;flex-shrink:0;display:flex;`;
  root.appendChild(bottomBar);

  const bLeft = skinned(document.createElement("div"), (s, el) => {
    el.style.cssText = `width:125px;min-width:125px;height:38px;background:url(${s.sprites.bottom_left}) no-repeat;`;
  });
  bottomBar.appendChild(bLeft);

  const bCenter = skinned(document.createElement("div"), (s, el) => {
    el.style.cssText = `flex:1;height:38px;background:url(${s.sprites.bottom_tile}) repeat-x;`;
  });
  bottomBar.appendChild(bCenter);

  const bRight = skinned(document.createElement("div"), (s, el) => {
    el.style.cssText = `width:150px;min-width:150px;height:38px;background:url(${s.sprites.bottom_right}) no-repeat right top;`;
  });
  bottomBar.appendChild(bRight);

  // --- Render ---

  function renderPresets() {
    const keys = config.getPresetKeys();
    const current = config.getCurrentIndex();
    const { colors: c } = skin;

    if (presetList.children.length !== keys.length) {
      presetList.innerHTML = "";
      for (let i = 0; i < keys.length; i++) {
        const item = document.createElement("div");
        item.addEventListener("click", () => config.onPresetSelect(i));
        presetList.appendChild(item);
      }
    }

    for (let i = 0; i < keys.length; i++) {
      const item = presetList.children[i] as HTMLElement;
      const isCurrent = i === current;
      const name = config.formatPresetName(keys[i]);

      item.style.cssText = `
        height:13px;line-height:13px;padding:0 3px;
        cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        color:${isCurrent ? c.current : c.normal};
        background:${isCurrent ? c.selectedBg : "transparent"};
        font-family:${c.font};font-size:9px;letter-spacing:0.5px;
      `;
      item.textContent = `${i + 1}. ${name}`;

      if (!isCurrent) {
        item.onmouseenter = () => { item.style.background = c.selectedBg; item.style.color = c.current; };
        item.onmouseleave = () => { item.style.background = "transparent"; item.style.color = c.normal; };
      } else {
        item.onmouseenter = null;
        item.onmouseleave = null;
      }
    }

    const currentEl = presetList.children[current] as HTMLElement | undefined;
    if (currentEl) {
      const lr = presetList.getBoundingClientRect();
      const ir = currentEl.getBoundingClientRect();
      if (ir.top < lr.top || ir.bottom > lr.bottom) {
        currentEl.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }

  function renderEffects() {
    const { colors: c } = skin;
    const arrow = effectsExpanded ? "\u25be" : "\u25b8";
    const tt = c.titleText ?? c.current;
    const ts = c.titleShadow ?? "rgba(0,0,0,0.9)";
    effectsHeader.innerHTML = `
      <span style="font-family:${c.font};font-size:9px;font-weight:bold;letter-spacing:2px;color:${tt};text-shadow:0 1px 3px ${ts}">EFFECTS</span>
      <span style="font-size:9px;color:${c.normal}">${arrow}</span>
    `;
    effectsBody.style.display = effectsExpanded ? "block" : "none";
    effectsMiddle.style.display = effectsExpanded ? "flex" : "none";
    if (!effectsExpanded) return;

    const toggles = config.getToggles();
    effectsBody.innerHTML = "";

    for (const t of toggles) {
      const val = t.getValue();
      const isOn = val === "on" || (val !== "off" && val !== "hidden" && val !== "fading");
      const row = document.createElement("div");
      row.style.cssText = `
        display:flex;justify-content:space-between;align-items:center;
        height:13px;line-height:13px;padding:0 3px;cursor:pointer;
        font-family:${c.font};font-size:9px;letter-spacing:0.5px;color:${c.normal};
      `;
      row.addEventListener("mouseenter", () => { row.style.background = c.selectedBg; row.style.color = c.current; });
      row.addEventListener("mouseleave", () => { row.style.background = ""; row.style.color = c.normal; });
      row.addEventListener("click", () => { t.onToggle(); repaint(); });

      const label = document.createElement("span");
      label.textContent = t.label;

      const right = document.createElement("span");
      right.style.cssText = "display:flex;align-items:center;gap:6px;";

      const shortcut = document.createElement("span");
      shortcut.style.cssText = `color:${c.normal};opacity:0.5;font-size:8px;`;
      shortcut.textContent = `[${t.shortcut}]`;

      const valText = document.createElement("span");
      valText.style.cssText = `color:${isOn ? c.current : c.normal};font-weight:${isOn ? "bold" : "normal"};min-width:24px;text-align:right;`;
      valText.textContent = val;

      right.appendChild(shortcut);
      right.appendChild(valText);
      row.appendChild(label);
      row.appendChild(right);
      effectsBody.appendChild(row);
    }
  }

  function renderSkins() {
    const { colors: c } = skin;
    skinList.innerHTML = "";

    for (const s of SKIN_REGISTRY) {
      const isCurrent = s.name === skin.name;
      const row = document.createElement("div");
      row.style.cssText = `
        height:13px;line-height:13px;padding:0 3px;
        cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        color:${isCurrent ? c.current : c.normal};
        background:${isCurrent ? c.selectedBg : "transparent"};
        font-family:${c.font};font-size:9px;letter-spacing:0.5px;
        font-weight:${isCurrent ? "bold" : "normal"};
      `;
      row.textContent = s.name;
      if (!isCurrent) {
        row.addEventListener("mouseenter", () => { row.style.background = c.selectedBg; row.style.color = c.current; });
        row.addEventListener("mouseleave", () => { row.style.background = "transparent"; row.style.color = c.normal; });
      }
      row.addEventListener("click", () => setSkin(s));
      skinList.appendChild(row);
    }
  }

  function repaint() {
    if (!visible) return;
    renderPresets();
    renderEffects();
    renderSkins();
  }

  function setSkin(newSkin: WinampSkin) {
    skin = newSkin;
    try { localStorage.setItem(SKIN_STORAGE_KEY, newSkin.name); } catch {}
    for (const { el, apply } of skinEls) apply(skin, el);
    presetList.innerHTML = "";
    repaint();
  }

  function toggle() {
    visible = !visible;
    root.style.transform = visible ? "translateX(0)" : "translateX(-100%)";
    tab.style.display = visible ? "none" : "flex";
    if (visible) {
      if (intervalId !== null) clearInterval(intervalId);
      repaint();
      intervalId = setInterval(repaint, 500);
    } else if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  tab.addEventListener("click", toggle);
  return { root, toggle, isVisible: () => visible, repaint, setSkin };
}
