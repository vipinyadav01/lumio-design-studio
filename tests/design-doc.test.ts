import { describe, expect, it } from "vitest";
import { blankDoc, findUnsafeObject, isSafeImageSrc, mapDesignUploadUrls, parseDesignDoc } from "@/lib/design/types";
import { TEMPLATES, templateToDoc } from "@/lib/design/templates";
import { scaleObjects } from "@/lib/design/scale";

describe("parseDesignDoc", () => {
  it("accepts a blank document", () => {
    expect(parseDesignDoc(blankDoc(1080, 1080)).ok).toBe(true);
  });

  it("accepts every built-in template", () => {
    for (const t of TEMPLATES) {
      const result = parseDesignDoc(templateToDoc(t));
      expect(result, t.id).toEqual(expect.objectContaining({ ok: true }));
    }
  });

  it("rejects out-of-range dimensions and empty page lists", () => {
    expect(parseDesignDoc({ ...blankDoc(100, 100), width: 5 }).ok).toBe(false);
    expect(parseDesignDoc({ ...blankDoc(100, 100), height: 9000 }).ok).toBe(false);
    expect(parseDesignDoc({ ...blankDoc(100, 100), pages: [] }).ok).toBe(false);
  });

  it("rejects external image sources, including inside groups and clip paths", () => {
    const external = { type: "Image", src: "https://evil.example/x.png" };
    const doc = (objects: unknown[]) => ({ ...blankDoc(100, 100), pages: [{ id: "p", background: "#fff", objects }] });
    expect(parseDesignDoc(doc([external])).ok).toBe(false);
    expect(parseDesignDoc(doc([{ type: "Group", objects: [external] }])).ok).toBe(false);
    expect(parseDesignDoc(doc([{ type: "Rect", clipPath: external }])).ok).toBe(false);
    expect(parseDesignDoc(doc([{ type: "Image", src: "/api/uploads/abcdefgh12345678" }])).ok).toBe(true);
  });

  it("rejects unknown object types", () => {
    expect(findUnsafeObject([{ type: "Script" }])).toMatch(/Unsupported/);
    expect(findUnsafeObject([{ type: "rect" }])).toBeNull();
  });
});

describe("isSafeImageSrc", () => {
  it("only allows upload URLs and raster data URLs", () => {
    expect(isSafeImageSrc("/api/uploads/abcdefgh1234")).toBe(true);
    expect(isSafeImageSrc("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(isSafeImageSrc("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isSafeImageSrc("/api/uploads/../designs")).toBe(false);
    expect(isSafeImageSrc("javascript:alert(1)")).toBe(false);
    expect(isSafeImageSrc(42)).toBe(false);
  });
});

describe("portable project image references", () => {
  it("rewrites nested images without changing the source design or inline images", () => {
    const doc = blankDoc(100, 100);
    const oldUrl = "/api/uploads/abcdefgh12345678";
    const newUrl = "/api/uploads/newimage12345678";
    doc.pages[0].objects = [
      { type: "Group", objects: [{ type: "Image", src: oldUrl }] },
      { type: "Rect", clipPath: { type: "Image", src: oldUrl } },
      { type: "Image", src: "data:image/png;base64,iVBORw0KGgo=" },
    ];
    const seen: string[] = [];
    const rewritten = mapDesignUploadUrls(doc, (url) => { seen.push(url); return newUrl; });
    expect(seen).toEqual([oldUrl, oldUrl]);
    expect(JSON.stringify(rewritten)).not.toContain(oldUrl);
    expect(JSON.stringify(doc)).toContain(oldUrl);
    expect(parseDesignDoc(rewritten).ok).toBe(true);
  });
});

describe("scaleObjects", () => {
  it("scales positions around the centre and multiplies scale", () => {
    const [o] = scaleObjects([{ left: 200, top: 100, scaleX: 1, scaleY: 2 }], { width: 400, height: 200 }, { width: 800, height: 800 });
    expect(o).toMatchObject({ left: 400, top: 400, scaleX: 2, scaleY: 4 });
    const [corner] = scaleObjects([{ left: 0, top: 0 }], { width: 400, height: 200 }, { width: 800, height: 800 });
    // Uniform factor min(2, 4) = 2, content stays centred on the new canvas.
    expect(corner).toMatchObject({ left: 0, top: 200 });
  });
});
