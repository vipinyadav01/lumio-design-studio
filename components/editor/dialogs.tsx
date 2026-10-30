"use client";

import { Check, Copy, Link2, Link2Off } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { SIZE_PRESETS } from "@/lib/design/presets";
import { MAX_DIMENSION, MIN_DIMENSION } from "@/lib/design/types";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Spinner } from "@/components/ui/input";
import { useEditor } from "./editor-context";
import { exportDesign, exportPortableProject, type ExportFormat } from "./export";
import { HealthReport } from "./health-report";

const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: "png", label: "PNG", hint: "Best for images with text or transparency" },
  { id: "jpeg", label: "JPG", hint: "Smaller files, great for photos" },
  { id: "svg", label: "SVG", hint: "Vector file for the current selection of pages" },
  { id: "pdf", label: "PDF", hint: "Multi-page document for print or sharing" },
];

export function DownloadDialog({ open, onClose, title }: { open: boolean; onClose: () => void; title: string }) {
  const { engine, state, notify } = useEditor();
  const [format, setFormat] = useState<ExportFormat>("png");
  const [scale, setScale] = useState(1);
  const [transparent, setTransparent] = useState(false);
  const [quality, setQuality] = useState(0.9);
  const [which, setWhich] = useState<"all" | "current">("all");
  const [busy, setBusy] = useState(false);
  const [healthReady, setHealthReady] = useState(false);
  const maxScale = Math.max(1, Math.min(4, Math.floor(8000 / Math.max(state.width, state.height))));

  async function run() {
    setBusy(true);
    try {
      const pages = which === "all" ? state.pages.map((_, i) => i) : [state.activePage];
      await exportDesign(engine.toDoc(), title, { format, scale: format === "svg" ? 1 : scale, pages, transparent, quality });
      notify("Download started");
      onClose();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Export failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Download">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink-700">File type</legend>
        <div className="grid grid-cols-2 gap-2">
          {FORMATS.map((f) => (
            <label key={f.id} className={`cursor-pointer rounded-xl p-3 ring-1 ${format === f.id ? "bg-brand-50 ring-2 ring-brand-600" : "ring-ink-200 hover:bg-ink-50"}`}>
              <input type="radio" name="format" value={f.id} checked={format === f.id} onChange={() => setFormat(f.id)} className="sr-only" />
              <span className="block text-sm font-semibold text-ink-900">{f.label}</span>
              <span className="mt-0.5 block text-xs text-ink-500">{f.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {format !== "svg" && (
        <label className="mt-5 block text-sm font-medium text-ink-700">
          <span className="flex justify-between">
            Size <span className="font-normal tabular-nums text-ink-500">{Math.round(state.width * scale)} × {Math.round(state.height * scale)} px</span>
          </span>
          <input type="range" min={0.5} max={maxScale} step={0.5} value={scale} onChange={(e) => setScale(Number(e.target.value))} className="mt-2 w-full accent-brand-600" aria-label="Export scale" />
        </label>
      )}
      {format === "jpeg" && (
        <label className="mt-4 block text-sm font-medium text-ink-700">
          <span className="flex justify-between">
            Quality <span className="font-normal tabular-nums text-ink-500">{Math.round(quality * 100)}%</span>
          </span>
          <input type="range" min={0.4} max={1} step={0.05} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="mt-2 w-full accent-brand-600" aria-label="JPEG quality" />
        </label>
      )}
      {format === "png" && (
        <label className="mt-4 flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} className="accent-brand-600" />
          Transparent background
        </label>
      )}
      {state.pages.length > 1 && (
        <label className="mt-4 block text-sm font-medium text-ink-700">
          Pages
          <select value={which} onChange={(e) => setWhich(e.target.value as "all" | "current")} className="mt-1.5 h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm font-normal">
            <option value="all">All pages ({state.pages.length})</option>
            <option value="current">Current page ({state.activePage + 1})</option>
          </select>
        </label>
      )}
      {open && <HealthReport currentOnly={which === "current"} scale={format === "svg" ? 1 : scale} transparent={transparent && format === "png"} onReadyChange={setHealthReady} />}
      <Button className="mt-6 w-full" size="lg" onClick={run} disabled={busy || !healthReady}>
        {busy && <Spinner />} Download
      </Button>
      <Button
        className="mt-2 w-full"
        variant="secondary"
        onClick={async () => {
          setBusy(true);
          try {
            await exportPortableProject(engine.toDoc(), title);
            notify("Editable project download started");
            onClose();
          } catch (err) {
            notify(err instanceof Error ? err.message : "Project export failed", "error");
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy}
      >
        {busy && <Spinner />} Save editable Lumio project (.lumio)
      </Button>
    </Dialog>
  );
}

export function ShareDialog({ open, onClose, initialToken }: { open: boolean; onClose: () => void; initialToken: string | null }) {
  const { designId, notify } = useEditor();
  const [token, setToken] = useState<string | null>(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = token && typeof window !== "undefined" ? `${window.location.origin}/s/${token}` : "";

  async function enable() {
    setBusy(true);
    try {
      setToken((await api<{ token: string }>(`/api/designs/${designId}/share`, { method: "POST" })).token);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not create link", "error");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await api(`/api/designs/${designId}/share`, { method: "DELETE" });
      setToken(null);
      notify("Link turned off. The old link no longer works.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not turn off link", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Share">
      {token ? (
        <div>
          <p className="text-sm text-ink-500">Anyone with this link can view the design and make their own copy. They can&apos;t edit yours.</p>
          <div className="mt-4 flex gap-2">
            <Input readOnly value={url} aria-label="Share link" onFocus={(e) => e.target.select()} />
            <Button
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <Button variant="ghost" className="mt-4 text-danger-600" onClick={disable} disabled={busy}>
            <Link2Off size={16} /> Turn off link
          </Button>
        </div>
      ) : (
        <div>
          <p className="text-sm text-ink-500">Create a view-only link. You can turn it off at any time.</p>
          <Button className="mt-5 w-full" onClick={enable} disabled={busy}>
            {busy ? <Spinner /> : <Link2 size={16} />} Create view-only link
          </Button>
        </div>
      )}
    </Dialog>
  );
}

export function ResizeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { engine, state } = useEditor();
  const [w, setW] = useState(String(state.width));
  const [h, setH] = useState(String(state.height));
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    // Reset the fields to the current size each time the dialog opens.
    setWasOpen(open);
    if (open) {
      setW(String(state.width));
      setH(String(state.height));
    }
  }
  const valid = [w, h].every((v) => Number.isInteger(Number(v)) && Number(v) >= MIN_DIMENSION && Number(v) <= MAX_DIMENSION);
  return (
    <Dialog open={open} onClose={onClose} title="Resize design">
      <p className="text-sm text-ink-500">Choose a preset to resize in one click, or enter a custom size below. Content on every page is scaled to fit; you can undo this.</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {SIZE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={async () => {
              await engine.resize(p.width, p.height);
              onClose();
            }}
            className={`rounded-full px-2.5 py-1 text-xs ${Number(w) === p.width && Number(h) === p.height ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-700 hover:bg-ink-200"}`}
          >
            {p.name}
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="space-y-1.5 text-sm font-medium text-ink-700">
          Width (px)
          <Input type="number" value={w} onChange={(e) => setW(e.target.value)} min={MIN_DIMENSION} max={MAX_DIMENSION} />
        </label>
        <label className="space-y-1.5 text-sm font-medium text-ink-700">
          Height (px)
          <Input type="number" value={h} onChange={(e) => setH(e.target.value)} min={MIN_DIMENSION} max={MAX_DIMENSION} />
        </label>
      </div>
      {!valid && <p className="mt-2 text-sm text-danger-600">Enter whole numbers between {MIN_DIMENSION} and {MAX_DIMENSION}.</p>}
      <Button
        className="mt-6 w-full"
        disabled={!valid}
        onClick={async () => {
          await engine.resize(Number(w), Number(h));
          onClose();
        }}
      >
        Resize
      </Button>
    </Dialog>
  );
}

export const SHORTCUTS: [string, string][] = [
  ["Undo / Redo", "Ctrl Z · Ctrl Shift Z (or Ctrl Y)"],
  ["Copy / Cut / Paste", "Ctrl C · Ctrl X · Ctrl V"],
  ["Duplicate", "Ctrl D"],
  ["Delete", "Delete or Backspace"],
  ["Select all / Deselect", "Ctrl A · Esc"],
  ["Group / Ungroup", "Ctrl G · Ctrl Shift G"],
  ["Lock / Unlock", "Ctrl Shift L"],
  ["Bring forward / Send backward", "Ctrl ] · Ctrl ["],
  ["Bring to front / Send to back", "Ctrl Shift ] · Ctrl Shift ["],
  ["Nudge", "Arrow keys (Shift for 10px)"],
  ["Add text / rectangle / circle / line", "T · R · C · L"],
  ["Bold / Italic / Underline (text)", "Ctrl B · Ctrl I · Ctrl U"],
  ["Zoom in / out / fit", "Ctrl = · Ctrl - · Ctrl 0  (or Ctrl + scroll)"],
  ["Pan", "Hold Space and drag, or scroll"],
  ["Save now", "Ctrl S"],
  ["Previous / next page", "Page Up · Page Down"],
  ["Show shortcuts", "?"],
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" width="max-w-lg">
      <dl className="divide-y divide-ink-100 text-sm">
        {SHORTCUTS.map(([action, keys]) => (
          <div key={action} className="flex justify-between gap-4 py-2">
            <dt className="text-ink-700">{action}</dt>
            <dd className="text-right font-mono text-xs text-ink-500">{keys}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-ink-400">On macOS use ⌘ instead of Ctrl.</p>
    </Dialog>
  );
}
