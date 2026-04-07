import { describe, it, expect } from "vitest";
import { buildRows } from "../src/options-summary-hud";

describe("buildRows", () => {
  it("returns empty string for empty array", () => {
    expect(buildRows([])).toBe("");
  });

  it("produces one row div for a single pair", () => {
    const html = buildRows([{ label: "Mode", value: "normal" }]);
    expect(html).toContain("Mode");
    expect(html).toContain("normal");
    // Should be exactly one row wrapper
    const matches = html.match(/<div/g);
    expect(matches).toHaveLength(1);
  });

  it("produces one div per pair", () => {
    const html = buildRows([
      { label: "Intensity", value: "hot" },
      { label: "Input", value: "mic" },
    ]);
    const matches = html.match(/<div/g);
    expect(matches).toHaveLength(2);
  });

  it("escapes HTML in label", () => {
    const html = buildRows([{ label: "<script>", value: "x" }]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes HTML in value", () => {
    const html = buildRows([{ label: "url", value: 'href="evil"' }]);
    expect(html).not.toContain('"evil"');
    expect(html).toContain("&quot;evil&quot;");
  });

  it("escapes ampersand in label and value", () => {
    const html = buildRows([{ label: "A & B", value: "C & D" }]);
    expect(html).toContain("A &amp; B");
    expect(html).toContain("C &amp; D");
  });

  it("concatenates rows without separator", () => {
    const html = buildRows([
      { label: "A", value: "1" },
      { label: "B", value: "2" },
    ]);
    // join("") means no gap between rows
    const firstEnd = html.indexOf("</div>");
    const secondStart = html.indexOf("<div", firstEnd);
    // second div immediately follows first closing div
    expect(secondStart).toBe(firstEnd + "</div>".length);
  });

  it("includes both label and value in the same row", () => {
    const html = buildRows([{ label: "Preset", value: "nebula-pearl" }]);
    expect(html).toContain("Preset");
    expect(html).toContain("nebula-pearl");
  });
});
