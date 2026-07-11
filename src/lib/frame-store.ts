/**
 * Persists generated frames as static files under public/generated/ so the
 * browser can load them with a plain <img> tag (no base64, no CORS).
 *
 * Files older than MAX_FILES (LRU) are deleted on each write.
 */

import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PUBLIC_DIR = join(process.cwd(), "public");
const GENERATED_DIR = join(PUBLIC_DIR, "generated");
const PUBLIC_PREFIX = "/generated";
const MAX_FILES = 60;

function ensureDir(): void {
  if (!existsSync(GENERATED_DIR)) {
    mkdirSync(GENERATED_DIR, { recursive: true });
  }
}

function generateId(): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${stamp}-${rand}`;
}

function prune(): void {
  let entries: Array<{ name: string; mtime: number }>;
  try {
    entries = readdirSync(GENERATED_DIR).map((name) => {
      const full = join(GENERATED_DIR, name);
      try {
        return { name, mtime: statSync(full).mtimeMs };
      } catch {
        return null;
      }
    }).filter((x): x is { name: string; mtime: number } => x !== null);
  } catch {
    return;
  }

  if (entries.length <= MAX_FILES) return;
  entries.sort((a, b) => a.mtime - b.mtime);
  const toDelete = entries.length - MAX_FILES;
  for (let i = 0; i < toDelete; i++) {
    try {
      unlinkSync(join(GENERATED_DIR, entries[i].name));
    } catch {
      // ignore
    }
  }
}

export interface SavedFrame {
  url: string;
  contentType: string;
}

export function saveFrame(buffer: Buffer, contentType: string): SavedFrame {
  ensureDir();
  const ext = contentType.includes("jpeg") || contentType.includes("jpg")
    ? "jpg"
    : contentType.includes("webp")
      ? "webp"
      : "png";
  const filename = `${generateId()}.${ext}`;
  writeFileSync(join(GENERATED_DIR, filename), buffer);
  prune();
  return { url: `${PUBLIC_PREFIX}/${filename}`, contentType };
}
