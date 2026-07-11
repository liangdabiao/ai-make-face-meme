"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { motion } from "motion/react";
import {
  Download,
  Film,
  Pause,
  Play,
  Plus,
  Settings,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";

interface Frame {
  id: string;
  url: string;
  file: File;
}

type StreamEvent =
  | { type: "progress"; data: string }
  | { type: "poses"; data: string }
  | { type: "frame"; data: FramePayload }
  | { type: "frame_error"; data: { frameIndex: number; error: string } }
  | { type: "complete"; data: string }
  | { type: "error"; data: string };

interface FramePayload {
  frameIndex: number;
  type: "image";
  base64ImageData?: string;
  imageUrl?: string;
  contentType?: string;
}

const CHUNK_SEPARATOR = "\n---CHUNK_END---\n";
const MAX_GIF_FRAMES = 12;
const GIF_FRAME_WIDTH = 400;
const GIF_FRAME_HEIGHT = 300;
const IMAGE_LOAD_TIMEOUT_MS = 15000;

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function toDataUrl(base64: string, contentType: string): string {
  return `data:${contentType};base64,${base64}`;
}

async function fetchAsDataUrl(url: string): Promise<{ dataUrl: string; contentType: string } | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ dataUrl: reader.result as string, contentType: blob.type || "image/png" });
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function loadImage(src: string, index: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timeout = setTimeout(
      () => reject(new Error(`Frame ${index + 1} timed out loading`)),
      IMAGE_LOAD_TIMEOUT_MS,
    );
    img.onload = () => {
      clearTimeout(timeout);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timeout);
      reject(new Error(`Frame ${index + 1} failed to load`));
    };
    img.src = src;
  });
}

async function drawFitted(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
): Promise<Blob> {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
  const width = img.width * scale;
  const height = img.height * scale;
  const x = (canvas.width - width) / 2;
  const y = (canvas.height - height) / 2;
  ctx.drawImage(img, x, y, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob returned null"))),
      "image/png",
    );
  });
}

export default function Home() {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [frameRate, setFrameRate] = useState(12);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const [generatedPoses, setGeneratedPoses] = useState<string | null>(null);
  const [generatedFrameCount, setGeneratedFrameCount] = useState(0);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [lastSelectedFile, setLastSelectedFile] = useState<File | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const playbackRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (playbackRef.current) {
      clearInterval(playbackRef.current);
      playbackRef.current = null;
    }
    if (isPlaying && frames.length > 0) {
      playbackRef.current = setInterval(() => {
        setCurrentFrame((prev) => (prev + 1) % frames.length);
      }, 1000 / frameRate);
    }
    return () => {
      if (playbackRef.current) clearInterval(playbackRef.current);
    };
  }, [isPlaying, frames.length, frameRate]);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    setFrames((prev) => {
      const additions: Frame[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) continue;
        additions.push({
          id: generateId("frame"),
          url: URL.createObjectURL(file),
          file,
        });
        if (i === 0) {
          setLastSelectedFile(file);
          setUploadPreview(additions[additions.length - 1].url);
        }
      }
      return [...prev, ...additions];
    });
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const removeFrame = useCallback(
    (id: string) => {
      setFrames((prev) => {
        const target = prev.find((f) => f.id === id);
        if (target) URL.revokeObjectURL(target.url);
        const next = prev.filter((f) => f.id !== id);
        if (next.length === 0) {
          setLastSelectedFile(null);
          setUploadPreview(null);
          setCurrentFrame(0);
        } else if (currentFrame >= next.length) {
          setCurrentFrame(next.length - 1);
        }
        return next;
      });
    },
    [currentFrame],
  );

  const moveFrame = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      setFrames((prev) => {
        const next = [...prev];
        const [picked] = next.splice(from, 1);
        next.splice(to, 0, picked);
        return next;
      });
      setCurrentFrame((prev) => {
        if (from === prev) return to;
        if (from < prev && to >= prev) return prev - 1;
        if (from > prev && to <= prev) return prev + 1;
        return prev;
      });
    },
    [],
  );

  const handleStreamEvent = useCallback(
    async (event: StreamEvent) => {
      switch (event.type) {
        case "progress":
          setProgressMessage(event.data);
          break;
        case "poses":
          setProgressMessage("Poses ready. Generating frames in parallel...");
          setGeneratedPoses(event.data);
          break;
        case "frame": {
          const payload = event.data;
          let dataUrl: string | null = null;
          let contentType = payload.contentType || "image/png";
          if (payload.base64ImageData) {
            dataUrl = toDataUrl(payload.base64ImageData, contentType);
          } else if (payload.imageUrl) {
            const fetched = await fetchAsDataUrl(payload.imageUrl);
            if (fetched) {
              dataUrl = fetched.dataUrl;
              contentType = fetched.contentType;
            }
          }
          if (!dataUrl) break;
          setGeneratedFrameCount((n) => n + 1);
          setFrames((prev) => [
            ...prev,
            {
              id: generateId("generated"),
              url: dataUrl!,
              file: new File(["generated"], "generated.png", { type: contentType }),
            },
          ]);
          setProgressMessage(`Frame ${payload.frameIndex} ready`);
          break;
        }
        case "frame_error":
          setProgressMessage(`Frame ${event.data.frameIndex} failed: ${event.data.error}`);
          break;
        case "complete":
          setProgressMessage("Animation generation complete.");
          setTimeout(() => setProgressMessage(""), 6000);
          break;
        case "error":
          throw new Error(event.data);
      }
    },
    [],
  );

  const generateAnimation = useCallback(async () => {
    if (!lastSelectedFile || isGenerating) return;
    setIsGenerating(true);
    setProgressMessage("Starting generation...");
    setGeneratedPoses(null);
    setGeneratedFrameCount(0);

    try {
      const formData = new FormData();
      formData.append("image", lastSelectedFile);

      const response = await fetch("/api/stop-motion", { method: "POST", body: formData });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Generation failed (${response.status}): ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Streaming response unavailable");

      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(CHUNK_SEPARATOR);
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line) continue;
          try {
            await handleStreamEvent(JSON.parse(line) as StreamEvent);
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message) {
              setProgressMessage(`Parse error: ${parseErr.message}`);
            }
          }
        }
      }
    } catch (err) {
      setProgressMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
      setTimeout(() => setProgressMessage(""), 8000);
    } finally {
      setIsGenerating(false);
    }
  }, [handleStreamEvent, isGenerating, lastSelectedFile]);

  const exportGif = useCallback(async () => {
    if (frames.length === 0 || isExporting) return;
    setIsExporting(true);
    setProgressMessage("Preparing GIF export...");

    const canvas = document.createElement("canvas");
    canvas.width = GIF_FRAME_WIDTH;
    canvas.height = GIF_FRAME_HEIGHT;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      setIsExporting(false);
      setProgressMessage("Canvas unsupported in this browser.");
      setTimeout(() => setProgressMessage(""), 6000);
      return;
    }

    try {
      const { default: GIFEncoder } = await import("gifencoder");
      const slice = frames.slice(0, MAX_GIF_FRAMES);
      const loaded: HTMLImageElement[] = [];
      for (let i = 0; i < slice.length; i++) {
        setProgressMessage(`Loading frame ${i + 1}/${slice.length}...`);
        loaded.push(await loadImage(slice[i].url, i));
      }

      const encoder = new GIFEncoder(canvas.width, canvas.height);
      encoder.start();
      encoder.setRepeat(0);
      encoder.setDelay(Math.round(1000 / frameRate));
      encoder.setQuality(10);

      for (let i = 0; i < loaded.length; i++) {
        setProgressMessage(`Encoding frame ${i + 1}/${loaded.length}...`);
        await drawFitted(ctx, canvas, loaded[i]);
        encoder.addFrame(ctx);
      }

      encoder.finish();
      const blob = new Blob([encoder.out.getData()], { type: "image/gif" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `nanomotion-${Date.now()}.gif`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setProgressMessage("GIF downloaded.");
      setTimeout(() => setProgressMessage(""), 6000);
    } catch (err) {
      setProgressMessage(`GIF export failed: ${err instanceof Error ? err.message : String(err)}`);
      setTimeout(() => setProgressMessage(""), 8000);
    } finally {
      setIsExporting(false);
    }
  }, [frameRate, frames, isExporting]);

  const togglePlayback = useCallback(() => {
    if (frames.length > 0) setIsPlaying((p) => !p);
  }, [frames.length]);

  const resetPlayback = useCallback(() => {
    setIsPlaying(false);
    setCurrentFrame(0);
  }, []);

  const stepFrame = useCallback(
    (direction: 1 | -1) => {
      if (frames.length === 0) return;
      setCurrentFrame((prev) => (prev + direction + frames.length) % frames.length);
    },
    [frames.length],
  );

  const handleFileInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => addFiles(e.target.files),
    [addFiles],
  );

  const handleFrameDragStart = useCallback(
    (index: number) => (e: DragEvent<HTMLDivElement>) => {
      setDraggedIndex(index);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
    },
    [],
  );

  const handleFrameDragOver = useCallback(
    (index: number) => (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverIndex(index);
    },
    [],
  );

  const handleFrameDrop = useCallback(
    (target: number) => (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (draggedIndex !== null) moveFrame(draggedIndex, target);
      setDraggedIndex(null);
      setDragOverIndex(null);
    },
    [draggedIndex, moveFrame],
  );

  const handleFrameDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, []);

  const frameStatusText = useMemo(() => {
    if (frames.length === 0) return "No frames";
    return `Frame ${currentFrame + 1} of ${frames.length}`;
  }, [currentFrame, frames.length]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <Film className="w-8 h-8 text-purple-600" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              NanoMotion
            </h1>
          </div>
          <p className="text-gray-600 dark:text-gray-300 text-lg">
            Create stop-motion animations from a single image
          </p>
        </motion.header>

        {(isGenerating || isExporting || progressMessage) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Progress
              </h2>
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2">
                  {(isGenerating || isExporting) && (
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  )}
                  <p className="text-blue-700 dark:text-blue-300 text-sm font-medium">
                    {progressMessage || "Working..."}
                  </p>
                </div>
                {generatedPoses && (
                  <div className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                    <strong>Poses:</strong> {generatedPoses}
                  </div>
                )}
                {generatedFrameCount > 0 && (
                  <div className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                    <strong>Frames received:</strong> {generatedFrameCount}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-1"
          >
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Upload
              </h2>

              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                  isDragOver
                    ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                    : "border-gray-300 dark:border-gray-600 hover:border-purple-400"
                }`}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadPreview ? (
                  <img
                    src={uploadPreview}
                    alt="Selected reference"
                    className="max-w-full max-h-48 mx-auto rounded-lg object-contain"
                  />
                ) : (
                  <>
                    <Plus className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-600 dark:text-gray-300 mb-4">
                      Drag &amp; drop an image here, or click to browse
                    </p>
                    <div className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg transition-colors inline-block">
                      Choose File
                    </div>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>

              <div className="mt-6">
                <label className="block text-sm font-medium mb-2">
                  Frame Rate: {frameRate} FPS
                </label>
                <input
                  type="range"
                  min={1}
                  max={30}
                  value={frameRate}
                  onChange={(e) => setFrameRate(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div className="mt-6">
                <button
                  onClick={generateAnimation}
                  disabled={!lastSelectedFile || isGenerating}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <Wand2 className={`w-4 h-4 ${isGenerating ? "animate-spin" : ""}`} />
                  {isGenerating ? "Generating..." : "Generate Animation"}
                </button>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-2"
          >
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Film className="w-5 h-5" />
                  Preview
                </h2>
                <div className="text-sm text-gray-500">{frameStatusText}</div>
              </div>

              <div className="aspect-video bg-gray-100 dark:bg-gray-700 rounded-lg mb-6 flex items-center justify-center overflow-hidden">
                {frames.length > 0 ? (
                  <img
                    src={frames[currentFrame]?.url}
                    alt={`Frame ${currentFrame + 1}`}
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <div className="text-center text-gray-500">
                    <Film className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p>Upload an image to get started</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-4 mb-6">
                <button
                  onClick={() => stepFrame(-1)}
                  disabled={frames.length === 0}
                  className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  aria-label="Previous frame"
                >
                  <SkipBack className="w-5 h-5" />
                </button>

                <button
                  onClick={togglePlayback}
                  disabled={frames.length === 0}
                  className="p-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                </button>

                <button
                  onClick={resetPlayback}
                  disabled={frames.length === 0}
                  className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  aria-label="Reset"
                >
                  <Square className="w-5 h-5" />
                </button>

                <button
                  onClick={() => stepFrame(1)}
                  disabled={frames.length === 0}
                  className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  aria-label="Next frame"
                >
                  <SkipForward className="w-5 h-5" />
                </button>

                <div className="w-px h-8 bg-gray-300 dark:bg-gray-600 mx-2" />

                <button
                  onClick={exportGif}
                  disabled={frames.length === 0 || isExporting}
                  className="p-2 rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  aria-label="Download GIF"
                >
                  <Download className="w-5 h-5" />
                </button>
              </div>

              {frames.length > 0 && (
                <div className="border-t pt-4">
                  <h3 className="text-sm font-medium mb-3">Timeline (drag to reorder)</h3>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {frames.map((frame, index) => {
                      const isDragged = draggedIndex === index;
                      const isDragOver = dragOverIndex === index;
                      return (
                        <div
                          key={frame.id}
                          draggable
                          onDragStart={handleFrameDragStart(index)}
                          onDragOver={handleFrameDragOver(index)}
                          onDragEnd={handleFrameDragEnd}
                          onDrop={handleFrameDrop(index)}
                          onClick={() => !isDragged && setCurrentFrame(index)}
                          className={`relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden cursor-move border-2 select-none transition-all ${
                            index === currentFrame
                              ? "border-purple-500 ring-2 ring-purple-200"
                              : "border-gray-300 hover:border-purple-300"
                          } ${isDragged ? "opacity-50" : ""} ${
                            isDragOver ? "ring-2 ring-blue-300" : ""
                          }`}
                        >
                          <img
                            src={frame.url}
                            alt={`Frame ${index + 1}`}
                            className="w-full h-full object-cover pointer-events-none"
                          />

                          {!isDragged && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFrame(frame.id);
                              }}
                              className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors z-10"
                              aria-label={`Remove frame ${index + 1}`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}

                          <div className="absolute bottom-0 left-0 right-0 text-white text-xs text-center py-1 bg-black/60">
                            {index + 1}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
