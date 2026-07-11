# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working on this repository.

## Project overview

**NanoMotion** is a Next.js 15 app that turns one image into a 12-frame
stop-motion animation using [apiz.ai](https://api.apiz.ai) (`fal-ai/nano-banana-2`).
Frames are generated in parallel and streamed back to the browser; GIF export
runs entirely client-side via `gifencoder`.

## Commands

```bash
pnpm install
pnpm dev           # Dev server (Turbopack) on http://localhost:3000
pnpm build         # Production build
pnpm start         # Run the production build
pnpm lint          # ESLint
pnpm typecheck     # tsc --noEmit
```

## Architecture

### Two-tier pipeline

1. **Frontend** ([src/app/page.tsx](src/app/page.tsx)) — React 19 + Framer Motion. Handles upload, timeline, playback, drag-to-reorder, and browser-side GIF export.
2. **Backend API** ([src/app/api/stop-motion/route.ts](src/app/api/stop-motion/route.ts)) — Next.js streaming route. Generates 12 frames in parallel and streams JSON events back to the client.

### AI integration ([src/lib/ai.ts](src/lib/ai.ts))

A single `generateImage(prompt, imageBuffer, options)` function wraps the
apiz.ai async task API:

1. Upload the reference image to a public URL (default: uguu.se) — apiz's
   `image_urls` only accepts HTTP/HTTPS URLs.
2. Submit a task via `POST /tasks/create` with model + prompt + `image_urls`.
3. Poll `POST /tasks/query` every `APIZ_POLL_INTERVAL_MS` until status is
   `completed` / `success` / `succeeded` / `finished`.
4. Extract the image URL from `data.output.images[0].url` (or `data.result.images`).

### Pose generation ([src/lib/poses.ts](src/lib/poses.ts))

Six canonical poses (starting, initial, mid, peak, recovery, final) are
defined once and cycled to produce 12 frames. `buildFramePrompt(pose, index)`
turns a pose into the per-frame prompt sent to apiz.

### Streaming response

The API emits JSON events separated by `\n---CHUNK_END---\n`:

- `progress` — human-readable status message
- `poses` — generated pose sequence (JSON)
- `frame` — successful frame with `imageUrl`
- `frame_error` — per-frame failure (does not abort the batch)
- `complete` / `error` — terminal events

The client splits on the separator and dispatches to a `StreamEvent` switch.

## Required environment variables

```
APIZ_API_KEY=your_apiz_api_key_here
```

Optional (with defaults in [src/lib/ai.ts](src/lib/ai.ts)):

- `APIZ_API_BASE_URL` (default `https://api.apiz.ai/api/v3`)
- `APIZ_MODEL` (default `fal-ai/nano-banana-2`)
- `APIZ_POLL_INTERVAL_MS` (default `3000`)
- `APIZ_TIMEOUT_MS` (default `300000`)
- `APIZ_REFERENCE_UPLOAD_URL` (default `https://uguu.se/upload`)
- `APIZ_REFERENCE_UPLOAD_FIELD` (default `files[]`)

See [.env.example](.env.example).

## Key patterns

- **Single-provider AI layer** — adding a new provider means editing [src/lib/ai.ts](src/lib/ai.ts); the route is provider-agnostic.
- **Parallel generation** — `Promise.allSettled` ensures one failure doesn't cancel the batch.
- **Streaming chunks** — `\n---CHUNK_END---\n` separates NDJSON-ish events.
- **No intermediate files** — uploads, generation, and GIF export all stay in memory or browser blobs.

## Stack

- Next.js 15.5 (App Router, Turbopack) + React 19 + TypeScript (strict)
- Tailwind CSS v4
- `motion/react` (Framer Motion)
- `gifencoder` for browser-side GIF export
- `lucide-react` for icons
