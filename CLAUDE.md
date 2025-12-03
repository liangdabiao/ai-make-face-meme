# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**NanoMotion** is a Next.js application that creates stop-motion animations from single images using Google's Gemini AI models. The application generates a sequence of poses from an input image and then creates individual frames for each pose, stitching them together with Framer Motion for animated playback.

## Commands

### Development
```bash
pnpm dev          # Start development server with Turbopack
pnpm build        # Build for production with Turbopack
pnpm start        # Start production server
pnpm lint         # Run ESLint
```

## Architecture & Code Structure

### Core Components

**Frontend (`src/app/page.tsx`)**
- Main React component handling file upload, animation preview, and playback controls
- Uses Framer Motion for animations and transitions
- Implements drag-and-drop file upload with image preview
- Real-time streaming response handling for frame generation progress
- Timeline-based frame management with drag-to-reorder functionality

**Backend API (`src/app/api/stop-motion/route.ts`)**
- Streaming endpoint that processes images sequentially
- Two-stage AI workflow:
  1. **Pose Generation**: Uses Gemini 2.5 Pro to create 12 sequential poses from input image
  2. **Frame Generation**: Uses Gemini 2.5 Flash (nanobanana) to generate image for each pose
- Returns streaming JSON responses with custom chunk separators for real-time UI updates
- Maximum duration: 800 seconds to handle long AI operations

### AI Integration (`src/lib/ai.ts`)

**Two AI Functions:**
1. `generatePosesFromImageBuffer()` - Analyzes image and generates JSON array of pose descriptions
2. `nanobanana()` - Takes pose description + original image, generates new image matching the pose

**Key Configuration:**
- Uses `@google/genai` with Google Generative AI API
- Requires `GOOGLE_GENERATIVE_AI_API_KEY` environment variable
- Structured JSON responses with typed schemas for reliable pose generation
- Base64 image encoding for API communication

### Storage (`src/lib/blob.ts`)
- Vercel Blob storage integration for file uploads
- Uses nanoid for unique filename generation
- Currently commented out in main flow but available for persistent storage

## Key Patterns

### Streaming Response Handling
The API uses custom chunk separators (`\n---CHUNK_END---\n`) to stream JSON responses:
- `poses` - First chunk containing generated poses array
- `nanobanana` - Individual generated image frames
- `complete` - Signal generation finished
- `error` - Error information

### Frame Management
- Each frame has unique ID, URL, and File object
- Frames can be reordered, deleted, and previewed in timeline
- Animation loop uses configurable frame rate (1-30 FPS)

### Image Processing Pipeline
1. User uploads single image
2. Gemini 2.5 Pro generates 12 pose descriptions
3. For each pose: Gemini 2.5 Flash generates new frame maintaining character identity
4. Frames are added to timeline for preview/export

## Environment Setup

**Required Environment Variables:**
```
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key
```

**Optional (for Vercel deployment):**
```
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token
```

## Technology Stack

- **Framework**: Next.js 15.5.2 with App Router
- **Language**: TypeScript with strict mode
- **Styling**: Tailwind CSS v4 with PostCSS
- **Animations**: Framer Motion
- **AI**: Google Gemini 2.5 Pro + Flash via @google/genai
- **Storage**: Vercel Blob (optional)
- **Package Manager**: pnpm with workspace configuration
- **Linting**: ESLint with Next.js configuration

## Development Notes

- The app uses pnpm workspaces with specific built dependencies for Tailwind and image processing
- API routes support streaming responses for long-running AI operations
- Frontend handles real-time progress updates during frame generation
- All image processing happens in memory buffers; no temporary files on disk
- Frame export currently downloads single frame (could be enhanced for full GIF/video export)