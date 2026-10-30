import { z } from "zod";

/**
 * Persisted design format.
 *
 * Each page stores its objects in Fabric.js serialized form (`toObject()`),
 * which keeps load/save lossless while the surrounding envelope stays typed.
 */

export const MIN_DIMENSION = 16;
export const MAX_DIMENSION = 8000;
export const MAX_PAGES = 100;
export const MAX_OBJECTS_PER_PAGE = 2000;

const color = z.string().max(64);

export const gradientBackgroundSchema = z.object({
  type: z.literal("linear"),
  angle: z.number().min(0).max(360),
  stops: z.array(z.object({ offset: z.number().min(0).max(1), color })).min(2).max(8),
});

export const backgroundSchema = z.union([color, gradientBackgroundSchema]);

export const pageSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(120).optional(),
  background: backgroundSchema,
  objects: z.array(z.record(z.string(), z.unknown())).max(MAX_OBJECTS_PER_PAGE),
});

export const designDocSchema = z.object({
  version: z.literal(1),
  width: z.number().int().min(MIN_DIMENSION).max(MAX_DIMENSION),
  height: z.number().int().min(MIN_DIMENSION).max(MAX_DIMENSION),
  pages: z.array(pageSchema).min(1).max(MAX_PAGES),
});

export type GradientBackground = z.infer<typeof gradientBackgroundSchema>;
export type PageBackground = z.infer<typeof backgroundSchema>;
export type PageData = z.infer<typeof pageSchema>;
export type DesignDoc = z.infer<typeof designDocSchema>;
export type SerializedObject = Record<string, unknown>;

/** Fabric classes a stored design may instantiate. */
export const ALLOWED_OBJECT_TYPES = new Set([
  "rect",
  "circle",
  "ellipse",
  "triangle",
  "line",
  "polygon",
  "polyline",
  "path",
  "textbox",
  "itext",
  "i-text",
  "text",
  "image",
  "group",
]);

const SAFE_IMAGE_SRC = /^(\/api\/uploads\/[A-Za-z0-9_-]{8,64}|data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+)$/;

export function isSafeImageSrc(src: unknown): boolean {
  return typeof src === "string" && SAFE_IMAGE_SRC.test(src);
}

/**
 * Validates every serialized object (recursively, including groups and clip
 * paths): only known shape classes, and images may only point at this app's
 * upload endpoint or inline raster data. Returns an error message or null.
 */
export function findUnsafeObject(objects: unknown[], depth = 0): string | null {
  if (depth > 20) return "Objects are nested too deeply";
  for (const raw of objects) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "Invalid object";
    const obj = raw as Record<string, unknown>;
    const type = typeof obj.type === "string" ? obj.type.toLowerCase() : "";
    if (!ALLOWED_OBJECT_TYPES.has(type)) return `Unsupported object type "${String(obj.type)}"`;
    if (type === "image" && !isSafeImageSrc(obj.src)) return "Image source is not allowed";
    if (Array.isArray(obj.objects)) {
      const nested = findUnsafeObject(obj.objects, depth + 1);
      if (nested) return nested;
    }
    if (obj.clipPath) {
      const nested = findUnsafeObject([obj.clipPath], depth + 1);
      if (nested) return nested;
    }
  }
  return null;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseDesignDoc(input: unknown): ParseResult<DesignDoc> {
  const parsed = designDocSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue.path.join(".") || "doc"}: ${issue.message}` };
  }
  for (const page of parsed.data.pages) {
    const unsafe = findUnsafeObject(page.objects);
    if (unsafe) return { ok: false, error: unsafe };
  }
  return { ok: true, value: parsed.data };
}

/** Visits upload-backed images, including those nested in groups and clip paths. */
export function mapDesignUploadUrls(doc: DesignDoc, map: (url: string) => string): DesignDoc {
  const copy = structuredClone(doc);
  const visit = (objects: SerializedObject[]) => {
    for (const obj of objects) {
      if (String(obj.type).toLowerCase() === "image" && typeof obj.src === "string" && obj.src.startsWith("/api/uploads/")) {
        obj.src = map(obj.src);
      }
      if (Array.isArray(obj.objects)) visit(obj.objects as SerializedObject[]);
      if (obj.clipPath && typeof obj.clipPath === "object" && !Array.isArray(obj.clipPath)) visit([obj.clipPath as SerializedObject]);
    }
  };
  for (const page of copy.pages) visit(page.objects);
  return copy;
}

export function newPageId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return "p_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function blankDoc(width: number, height: number, background: PageBackground = "#ffffff"): DesignDoc {
  return { version: 1, width, height, pages: [{ id: newPageId(), background, objects: [] }] };
}
