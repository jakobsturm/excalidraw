import {
  applyTextStyle,
  getRenderedLineOffsets,
  getStyledTextSegments,
  getTextStylesAfterEdit,
  isTextStyleFlagActive,
  normalizeTextStyles,
  updateTextStyle,
} from "../src/textStyles";

describe("textStyles", () => {
  describe("applyTextStyle", () => {
    it("styles a range and merges adjacent equal ranges", () => {
      let ranges = applyTextStyle(null, 11, 0, 5, { bold: true });
      expect(ranges).toEqual([{ start: 0, end: 5, bold: true }]);

      ranges = applyTextStyle(ranges, 11, 5, 8, { bold: true });
      expect(ranges).toEqual([{ start: 0, end: 8, bold: true }]);
    });

    it("splits ranges on partial updates", () => {
      const ranges = applyTextStyle(
        [{ start: 0, end: 10, bold: true }],
        10,
        3,
        6,
        { italic: true },
      );
      expect(ranges).toEqual([
        { start: 0, end: 3, bold: true },
        { start: 3, end: 6, bold: true, italic: true },
        { start: 6, end: 10, bold: true },
      ]);
    });

    it("removes styles and drops empty ranges", () => {
      expect(
        applyTextStyle([{ start: 0, end: 4, bold: true }], 4, 0, 4, {
          bold: false,
        }),
      ).toBe(null);
      expect(
        applyTextStyle([{ start: 0, end: 4, strokeColor: "red" }], 4, 0, 2, {
          strokeColor: null,
        }),
      ).toEqual([{ start: 2, end: 4, strokeColor: "red" }]);
    });

    it("clamps to the text", () => {
      expect(applyTextStyle(null, 3, -2, 10, { underline: true })).toEqual([
        { start: 0, end: 3, underline: true },
      ]);
    });
  });

  it("updateTextStyle drops a range's offsets", () => {
    const range = {
      start: 2,
      end: 5,
      bold: true as const,
      italic: true as const,
    };
    expect(updateTextStyle(range, { bold: false })).toEqual({ italic: true });
    expect(updateTextStyle(range, { bold: false, italic: false })).toBe(null);
  });

  it("isTextStyleFlagActive", () => {
    const ranges = [{ start: 2, end: 5, bold: true as const }];
    expect(isTextStyleFlagActive(ranges, 8, 2, 5, "bold")).toBe(true);
    expect(isTextStyleFlagActive(ranges, 8, 1, 5, "bold")).toBe(false);
    // collapsed: the style the next typed character gets
    expect(isTextStyleFlagActive(ranges, 8, 5, 5, "bold")).toBe(true);
    expect(isTextStyleFlagActive(ranges, 8, 2, 2, "bold")).toBe(false);
  });

  describe("getTextStylesAfterEdit", () => {
    const bold = [{ start: 6, end: 11, bold: true as const }]; // "hello world"

    it("shifts ranges after an insertion before them", () => {
      expect(
        getTextStylesAfterEdit(bold, "hello world", "oh hello world"),
      ).toEqual([{ start: 9, end: 14, bold: true }]);
    });

    it("extends a range typed into at its end", () => {
      expect(
        getTextStylesAfterEdit(bold, "hello world", "hello world!", {
          selection: { start: 11, end: 11 },
        }),
      ).toEqual([{ start: 6, end: 12, bold: true }]);
    });

    it("doesn't extend a range typed into at its start", () => {
      expect(
        getTextStylesAfterEdit(bold, "hello world", "hello  world", {
          selection: { start: 6, end: 6 },
        }),
      ).toEqual([{ start: 7, end: 12, bold: true }]);
    });

    it("shrinks a range on deletion", () => {
      expect(
        getTextStylesAfterEdit(bold, "hello world", "hello wd", {
          selection: { start: 7, end: 10 },
        }),
      ).toEqual([{ start: 6, end: 8, bold: true }]);
    });

    it("uses the selection to place edits in repeated characters", () => {
      // "aaaa" with the 2nd and 3rd bold; typing "a" at offset 1 (plain)
      const ranges = [{ start: 1, end: 3, bold: true as const }];
      expect(
        getTextStylesAfterEdit(ranges, "aaaa", "aaaaa", {
          selection: { start: 1, end: 1 },
        }),
      ).toEqual([{ start: 2, end: 4, bold: true }]);
    });

    it("applies the insert style", () => {
      expect(
        getTextStylesAfterEdit(null, "ab", "aXb", {
          selection: { start: 1, end: 1 },
          insertStyle: { italic: true },
        }),
      ).toEqual([{ start: 1, end: 2, italic: true }]);
      expect(
        getTextStylesAfterEdit(bold, "hello world", "hello world!", {
          selection: { start: 11, end: 11 },
          insertStyle: null,
        }),
      ).toEqual(bold);
    });
  });

  it("normalizeTextStyles sanitizes untrusted ranges", () => {
    expect(
      normalizeTextStyles(
        [
          { start: 0, end: 3, bold: true, evil: "x" },
          { start: 2, end: 1, bold: true },
          { start: 1.5, end: 2, bold: true },
          { start: 2, end: 99, italic: "yes" },
          null,
        ],
        5,
      ),
    ).toEqual([{ start: 0, end: 3, bold: true }]);
    expect(normalizeTextStyles("nope", 5)).toBe(null);
  });

  it("maps wrapped lines to segments of the original text", () => {
    const originalText = "hello big world";
    const lines = ["hello big", "world"];
    const offsets = getRenderedLineOffsets(lines, originalText);
    expect(offsets).toEqual([0, 10]);

    const ranges = [{ start: 6, end: 13, bold: true as const }];
    expect(getStyledTextSegments(lines[0], offsets[0], ranges)).toEqual([
      { text: "hello ", offset: 0, style: null },
      { text: "big", offset: 6, style: ranges[0] },
    ]);
    expect(getStyledTextSegments(lines[1], offsets[1], ranges)).toEqual([
      { text: "wor", offset: 0, style: ranges[0] },
      { text: "ld", offset: 3, style: null },
    ]);
  });
});
