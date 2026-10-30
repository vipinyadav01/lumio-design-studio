"use client";

import { api } from "@/lib/api-client";
import { mapDesignUploadUrls, parseDesignDoc, type DesignDoc } from "@/lib/design/types";
import { ACCEPTED_IMAGE_TYPES, uploadImage } from "./uploads";
import { renderPage, renderPageSvg } from "./fabric-setup";

export type ExportFormat = "png" | "jpeg" | "svg" | "pdf";

function slug(title: string): string {
  return title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "design";
}

function download(href: string, filename: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const MAX_PROJECT_BYTES = 64 * 1024 * 1024;
const MAX_PROJECT_ASSETS = 100;
const MAX_PROJECT_ASSET_BYTES = 10 * 1024 * 1024;

type ProjectAsset = { mime: string; data: string };

/** A portable, editable document with every referenced upload embedded. */
export async function exportPortableProject(doc: DesignDoc, title: string): Promise<void> {
  const urls = new Set<string>();
  mapDesignUploadUrls(doc, (url) => { urls.add(url); return url; });
  if (urls.size > MAX_PROJECT_ASSETS) throw new Error(`A project can include at most ${MAX_PROJECT_ASSETS} images`);
  const assets: Record<string, ProjectAsset> = {};
  let totalImageBytes = 0;
  for (const url of urls) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not include image ${url}. Restore the missing upload and try again.`);
    const blob = await response.blob();
    if (!ACCEPTED_IMAGE_TYPES.includes(blob.type) || blob.size > MAX_PROJECT_ASSET_BYTES) throw new Error(`Image ${url} is unsupported or larger than 10 MB`);
    totalImageBytes += blob.size;
    if (totalImageBytes > 40 * 1024 * 1024) throw new Error("Project images are larger than 40 MB in total");
    assets[url] = { mime: blob.type, data: await blobToDataUrl(blob) };
  }
  const bundle = new Blob([JSON.stringify({ format: "lumio-project", version: 1, title, doc, assets })], { type: "application/json" });
  if (bundle.size > MAX_PROJECT_BYTES) throw new Error("Project is larger than 64 MB");
  const url = URL.createObjectURL(bundle);
  download(url, `${slug(title)}.lumio`);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Imports a bundle into a new design, keeping the source project untouched. */
export async function importPortableProject(file: File, workspaceId: string | null): Promise<string> {
  if (file.size > MAX_PROJECT_BYTES) throw new Error("Project file is larger than 64 MB");
  let raw: unknown;
  try { raw = JSON.parse(await file.text()); } catch { throw new Error("Invalid Lumio project file"); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid Lumio project file");
  const bundle = raw as Record<string, unknown>;
  if (bundle.format !== "lumio-project" || bundle.version !== 1) throw new Error("Unsupported Lumio project version");
  if (typeof bundle.title !== "string" || !bundle.title.trim() || bundle.title.length > 120) throw new Error("Invalid project title");
  const parsed = parseDesignDoc(bundle.doc);
  if (!parsed.ok) throw new Error(`Invalid design: ${parsed.error}`);
  if (!bundle.assets || typeof bundle.assets !== "object" || Array.isArray(bundle.assets)) throw new Error("Project images are missing");
  const assets = bundle.assets as Record<string, unknown>;
  const urls = new Set<string>();
  mapDesignUploadUrls(parsed.value, (url) => { urls.add(url); return url; });
  if (urls.size > MAX_PROJECT_ASSETS || Object.keys(assets).length !== urls.size) throw new Error("Project image list does not match the design");

  const files = new Map<string, File>();
  for (const url of urls) {
    const asset = Object.hasOwn(assets, url) ? assets[url] : null;
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) throw new Error(`Project is missing image ${url}`);
    const { mime, data } = asset as ProjectAsset;
    if (!ACCEPTED_IMAGE_TYPES.includes(mime) || typeof data !== "string" || !data.startsWith(`data:${mime};base64,`) || data.length > 14_000_000) throw new Error(`Invalid project image ${url}`);
    const blob = await fetch(data).then((response) => response.blob());
    if (!blob.size || blob.size > MAX_PROJECT_ASSET_BYTES || blob.type !== mime) throw new Error(`Invalid project image ${url}`);
    const extension = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
    files.set(url, new File([blob], `project-${url.split("/").pop()}.${extension}`, { type: mime }));
  }

  const importedIds: string[] = [];
  try {
    const replacements = new Map<string, string>();
    for (const [oldUrl, image] of files) {
      const upload = await uploadImage(image);
      importedIds.push(upload.id);
      replacements.set(oldUrl, upload.url);
    }
    const doc = mapDesignUploadUrls(parsed.value, (url) => {
      const replacement = replacements.get(url);
      if (!replacement) throw new Error(`Project is missing image ${url}`);
      return replacement;
    });
    const { design } = await api<{ design: { id: string } }>("/api/designs", {
      method: "POST",
      json: { title: bundle.title.trim(), doc, ...(workspaceId ? { workspaceId } : {}) },
    });
    return design.id;
  } catch (error) {
    await Promise.allSettled(importedIds.map((id) => api(`/api/uploads/${id}`, { method: "DELETE" })));
    throw error;
  }
}

/** Inlines this app's upload URLs so the SVG is self-contained. */
async function inlineImages(svg: string): Promise<string> {
  const urls = Array.from(new Set(Array.from(svg.matchAll(/(?:xlink:)?href="((?:https?:\/\/[^"]+)?\/api\/uploads\/[A-Za-z0-9_-]+)"/g), (m) => m[1])));
  let out = svg;
  for (const url of urls) {
    const res = await fetch(url);
    if (!res.ok) continue;
    const data = await blobToDataUrl(await res.blob());
    out = out.split(`"${url}"`).join(`"${data}"`);
  }
  return out;
}

export async function exportDesign(
  doc: DesignDoc,
  title: string,
  options: { format: ExportFormat; scale: number; pages: number[]; transparent: boolean; quality: number },
): Promise<void> {
  const name = slug(title);
  const { width, height } = doc;
  const pages = options.pages.map((i) => doc.pages[i]).filter(Boolean);
  if (!pages.length) throw new Error("Select at least one page");
  const suffix = (i: number) => (pages.length > 1 ? `-${options.pages[i] + 1}` : "");

  if (options.format === "pdf") {
    const { jsPDF } = await import("jspdf");
    const orientation = width >= height ? "landscape" : "portrait";
    const pdf = new jsPDF({ orientation, unit: "px", format: [width, height], hotfixes: ["px_scaling"], compress: true });
    for (let i = 0; i < pages.length; i++) {
      if (i > 0) pdf.addPage([width, height], orientation);
      const url = await renderPage(pages[i], width, height, { multiplier: options.scale, format: "jpeg", quality: 0.95 });
      pdf.addImage(url, "JPEG", 0, 0, width, height, undefined, "FAST");
    }
    const url = URL.createObjectURL(pdf.output("blob"));
    download(url, `${name}.pdf`);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }

  for (let i = 0; i < pages.length; i++) {
    if (options.format === "svg") {
      const svg = await inlineImages(await renderPageSvg(pages[i], width, height));
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      download(url, `${name}${suffix(i)}.svg`);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } else {
      const url = await renderPage(pages[i], width, height, {
        multiplier: options.scale,
        format: options.format,
        quality: options.quality,
        transparent: options.transparent && options.format === "png",
      });
      download(url, `${name}${suffix(i)}.${options.format === "jpeg" ? "jpg" : "png"}`);
    }
    // Give the browser a moment between multiple downloads.
    if (pages.length > 1) await new Promise((r) => setTimeout(r, 250));
  }
}
