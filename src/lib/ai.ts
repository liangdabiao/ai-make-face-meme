/**
 * apiz.ai async task API client.
 *
 * Flow: upload reference image to a public URL → submit generation task → poll until done
 *       → download the result image → persist it via the frame store.
 * Docs: https://api.apiz.ai
 */

import { saveFrame } from "./frame-store";

export interface ImageGenerationResult {
  url: string;
  contentType: string;
  model: string;
}

export interface ImageGenerationOptions {
  model?: string;
  aspectRatio?: string;
  mimeType?: string;
  referenceImages?: string[];
  signal?: AbortSignal;
  timeoutMs?: number;
}

const APIZ_BASE_URL = process.env.APIZ_API_BASE_URL || "https://api.apiz.ai/api/v3";
const APIZ_API_KEY = process.env.APIZ_API_KEY || "";
const APIZ_MODEL = process.env.APIZ_MODEL || "fal-ai/nano-banana-2";
const APIZ_POLL_INTERVAL_MS = Number(process.env.APIZ_POLL_INTERVAL_MS) || 3000;
const APIZ_TIMEOUT_MS = Number(process.env.APIZ_TIMEOUT_MS) || 300000;
const APIZ_UPLOAD_URL = process.env.APIZ_REFERENCE_UPLOAD_URL || "https://uguu.se/upload";
const APIZ_UPLOAD_FIELD = process.env.APIZ_REFERENCE_UPLOAD_FIELD || "files[]";

const FAIL_STATUSES = new Set(["failed", "error", "cancelled", "canceled"]);
const COMPLETE_STATUSES = new Set(["completed", "success", "succeeded", "finished"]);

interface ApizResponse {
  code?: number;
  message?: string;
  data?: {
    task_id?: string;
    status?: string;
    output?: ApizImageContainer;
    result?: ApizImageContainer;
    error?: { message?: string };
  };
}

interface ApizImageContainer {
  images?: Array<string | { url?: string }>;
  url?: string;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function apizFetch(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<ApizResponse> {
  if (!APIZ_API_KEY) {
    throw new Error("APIZ_API_KEY is not set. Add it to your .env file.");
  }
  const resp = await fetch(`${APIZ_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${APIZ_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  const text = await resp.text();
  let json: ApizResponse | { detail?: string };
  try {
    json = JSON.parse(text) as ApizResponse;
  } catch {
    throw new Error(`apiz ${path} returned non-JSON (status=${resp.status}): ${text.slice(0, 200)}`);
  }
  if (!resp.ok || (json.code && json.code !== 200)) {
    const j = json as ApizResponse & { detail?: string };
    const msg = j.message || j.detail || j.data?.error?.message || `HTTP ${resp.status}`;
    const raw = text.slice(0, 400);
    throw new Error(`apiz ${path} failed: ${msg} | raw: ${raw}`);
  }
  return json;
}

function extractApizImageUrl(taskData: ApizResponse["data"]): string | null {
  if (!taskData) return null;
  const containers: Array<ApizImageContainer | undefined> = [
    taskData.output,
    taskData.result,
  ];
  for (const c of containers) {
    if (!c) continue;
    if (Array.isArray(c.images) && c.images.length > 0) {
      for (const img of c.images) {
        if (typeof img === "string" && img.trim()) return img;
        if (typeof img === "object" && typeof img.url === "string") return img.url;
      }
    }
    if (typeof c.url === "string" && c.url.trim()) return c.url;
  }
  return null;
}

const DOWNLOAD_CONCURRENCY = 4;

class Semaphore {
  private available: number;
  private queue: Array<() => void> = [];
  constructor(capacity: number) {
    this.available = capacity;
  }
  async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available -= 1;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.available -= 1;
  }
  release(): void {
    this.available += 1;
    const next = this.queue.shift();
    if (next) next();
  }
}

const downloadSemaphore = new Semaphore(DOWNLOAD_CONCURRENCY);

async function downloadAndSaveFrame(
  imageUrl: string,
  signal?: AbortSignal,
): Promise<ImageGenerationResult> {
  // The apiz CDN (cdn-hk.51sux.com) rate-limits parallel downloads, so
  // we cap concurrency with a semaphore and retry with exponential backoff.
  await downloadSemaphore.acquire();
  try {
    const MAX_ATTEMPTS = 5;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const resp = await fetch(imageUrl, { signal });
        if (!resp.ok) {
          throw new Error(`status ${resp.status}`);
        }
        const arrayBuffer = await resp.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        if (buffer.length === 0) {
          throw new Error("empty body");
        }
        const contentType = resp.headers.get("content-type") || "image/png";
        const { url } = saveFrame(buffer, contentType);
        return { url, contentType, model: APIZ_MODEL };
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_ATTEMPTS) {
          const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    throw new Error(`Failed to download generated image after ${MAX_ATTEMPTS} attempts: ${msg}`);
  } finally {
    downloadSemaphore.release();
  }
}

async function uploadReferenceImage(buffer: Buffer, mimeType: string): Promise<string> {
  const form = new FormData();
  form.append(APIZ_UPLOAD_FIELD, new Blob([new Uint8Array(buffer)], { type: mimeType }), "reference.jpg");
  const resp = await fetch(APIZ_UPLOAD_URL, { method: "POST", body: form });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(
      `Reference image upload failed (${APIZ_UPLOAD_URL}, status=${resp.status}): ${text.slice(0, 200)}`,
    );
  }
  let url: string | undefined;
  try {
    const json = JSON.parse(text);
    if (Array.isArray(json.files) && json.files[0]?.url) {
      url = json.files[0].url;
    } else if (typeof json.url === "string") {
      url = json.url;
    } else if (typeof json.link === "string") {
      url = json.link;
    }
  } catch {
    if (/^https?:\/\//.test(text.trim())) url = text.trim();
  }
  if (!url) {
    throw new Error(`Reference upload succeeded but no URL was returned: ${text.slice(0, 200)}`);
  }
  return url;
}

export async function generateImage(
  prompt: string,
  imageBuffer?: Buffer,
  options: ImageGenerationOptions = {},
): Promise<ImageGenerationResult> {
  const model = options.model || APIZ_MODEL;
  const params: Record<string, unknown> = {
    prompt,
    num_images: 1,
    resolution: "1K",
    aspect_ratio: options.aspectRatio && options.aspectRatio !== "auto" ? options.aspectRatio : "auto",
  };

  if (imageBuffer) {
    const url = await uploadReferenceImage(imageBuffer, options.mimeType || "image/jpeg");
    params.image_urls = [url];
  } else if (options.referenceImages && options.referenceImages.length > 0) {
    params.image_urls = options.referenceImages;
  }

  const submit = await apizFetch(
    "/tasks/create",
    { model, params, channel: null },
    options.signal,
  );
  const taskId = submit.data?.task_id;
  if (!taskId) {
    throw new Error(`apiz task creation did not return task_id: ${JSON.stringify(submit).slice(0, 200)}`);
  }

  const timeoutMs = options.timeoutMs ?? APIZ_TIMEOUT_MS;
  const start = Date.now();
  let lastStatus = "pending";
  let lastData: ApizResponse["data"];

  while (Date.now() - start < timeoutMs) {
    if (options.signal?.aborted) throw new Error("Request cancelled");

    await sleep(APIZ_POLL_INTERVAL_MS);
    const polled = await apizFetch("/tasks/query", { task_id: taskId }, options.signal);
    const data = polled.data ?? {};
    lastData = data;
    lastStatus = String(data.status || "").toLowerCase();

    if (COMPLETE_STATUSES.has(lastStatus)) {
      const url = extractApizImageUrl(data);
      if (!url) {
        throw new Error(`apiz task completed without an image URL: ${JSON.stringify(data).slice(0, 300)}`);
      }
      return await downloadAndSaveFrame(url, options.signal);
    }

    if (FAIL_STATUSES.has(lastStatus)) {
      const errMsg = data.error?.message || "unknown error";
      throw new Error(`apiz task failed (status=${data.status}): ${errMsg}`);
    }
  }

  throw new Error(
    `apiz task timed out (last_status=${lastStatus}, task_id=${taskId}): ${JSON.stringify(lastData).slice(0, 200)}`,
  );
}
