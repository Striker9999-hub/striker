import { describe, expect, it } from "vitest";
import { OPT_OUT_LINE, hasOptOutLine, withOptOutLine } from "@/shared/optout";

describe("hasOptOutLine", () => {
  it("finds the line anywhere, ignoring whitespace differences", () => {
    expect(hasOptOutLine(`Hi Ana,\n\nBody.\n\n${OPT_OUT_LINE}\n\nBest,\nMe`)).toBe(true);
    expect(hasOptOutLine(`Hi\r\n  ${OPT_OUT_LINE.replace(/ /g, "   ")}  \r\nBye`)).toBe(true);
  });
  it("requires the whole line, not a fragment or a merged line", () => {
    expect(hasOptOutLine(`Hi. ${OPT_OUT_LINE}`)).toBe(false);
    expect(hasOptOutLine(OPT_OUT_LINE.slice(0, -1))).toBe(false);
    expect(hasOptOutLine("")).toBe(false);
    expect(hasOptOutLine(undefined)).toBe(false);
  });
});

describe("withOptOutLine", () => {
  it("appends once", () => {
    const once = withOptOutLine("Hello\n\n");
    expect(once).toBe(`Hello\n\n${OPT_OUT_LINE}`);
    expect(withOptOutLine(once)).toBe(once);
    expect(withOptOutLine("")).toBe(OPT_OUT_LINE);
  });
});
