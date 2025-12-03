"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Upload,
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Trash2,
  Download,
  Settings,
  Film,
  Plus,
  Wand2,
} from "lucide-react";

interface Frame {
  id: string;
  url: string;
  file: File;
}

export default function Home() {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [frameRate, setFrameRate] = useState(12); // frames per second
  const [isDragOver, setIsDragOver] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<string>("");
  const [generatedPoses, setGeneratedPoses] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [lastSelectedFile, setLastSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const animationRef = useRef<NodeJS.Timeout | null>(null);

  // Animation loop
  useEffect(() => {
    if (isPlaying && frames.length > 0) {
      animationRef.current = setInterval(() => {
        setCurrentFrame((prev) => (prev + 1) % frames.length);
      }, 1000 / frameRate);
    } else {
      if (animationRef.current) {
        clearInterval(animationRef.current);
        animationRef.current = null;
      }
    }

    return () => {
      if (animationRef.current) {
        clearInterval(animationRef.current);
      }
    };
  }, [isPlaying, frames.length, frameRate]);

  const handleFileSelection = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[files.length - 1];

    if (file.type.startsWith("image/")) {
      setLastSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        const url = e.target?.result as string;

        // Set the uploaded image as preview in upload area
        setUploadPreview(url);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      handleFileSelection(e.dataTransfer.files);
    },
    [handleFileSelection]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const removeFrame = (id: string) => {
    setFrames((prev) => {
      const newFrames = prev.filter((frame) => frame.id !== id);
      if (currentFrame >= newFrames.length && newFrames.length > 0) {
        setCurrentFrame(newFrames.length - 1);
      }
      return newFrames;
    });
  };

  const moveFrame = (fromIndex: number, toIndex: number) => {
    setFrames((prev) => {
      const newFrames = [...prev];
      const [movedFrame] = newFrames.splice(fromIndex, 1);
      newFrames.splice(toIndex, 0, movedFrame);
      return newFrames;
    });
  };

  const generateAnimation = async () => {
    if (!lastSelectedFile) {
      alert("Please select an image to generate an animation from.");
      return;
    }

    setIsGenerating(true);
    setGenerationProgress("Starting generation...");
    setGeneratedPoses(null);
    setGeneratedImages([]);

    try {
      const formData = new FormData();
      formData.append("image", lastSelectedFile);

      const response = await fetch("/api/stop-motion", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to generate animation: ${response.status} ${errorText}`
        );
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (!reader) {
        throw new Error("No response body reader available");
      }

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Split on our custom separator
        const parts = buffer.split('\n---CHUNK_END---\n');

        // Keep the last part in buffer (might be incomplete)
        buffer = parts.pop() || '';

        // Process complete chunks
        for (const part of parts) {
          const line = part.trim();
          if (!line) continue;

          try {
            console.log("parsing line", line);

            const data = JSON.parse(line);

            switch (data.type) {
              case 'poses':
                setGenerationProgress("Poses generated! Creating animation frames...");
                setGeneratedPoses(data.data);
                console.log("Generated poses:", data.data);
                break;
                
              case 'nanobanana':
                setGenerationProgress("Animation frame generated!");
                
                // Handle the image data from nanobanana
                if (data.data && data.data.type === 'image' && data.data.base64ImageData) {
                  const { base64ImageData, contentType } = data.data;
                  
                  // Create a proper data URL from the base64 image data
                  const dataUrl = `data:${contentType || 'image/png'};base64,${base64ImageData}`;
                  
                  setGeneratedImages(prev => [...prev, dataUrl]);
                  
                  // Add the generated image as a frame
                  const newFrame: Frame = {
                    id: `generated-${Date.now()}-${Math.random()}`,
                    url: dataUrl,
                    file: new File(["generated"], "generated.png", { type: contentType || "image/png" })
                  };
                  setFrames(prev => [...prev, newFrame]);
                }
                break;
                
              case 'complete':
                setGenerationProgress("Animation generation complete!");
                setTimeout(() => setGenerationProgress(""), 3000);
                break;
                
              case 'error':
                throw new Error(data.data);
            }
          } catch (parseError) {
            console.warn("Failed to parse streaming data:", line, parseError);
          }
        }
      }
    } catch (error) {
      console.error("Error during animation generation:", error);
      setGenerationProgress("Error: " + (error instanceof Error ? error.message : "Unknown error"));
      setTimeout(() => setGenerationProgress(""), 5000);
    } finally {
      setIsGenerating(false);
    }
  };

  const exportAnimation = async () => {
    if (frames.length === 0) return;

    try {
      console.log('Starting GIF export with', frames.length, 'frames');
      
      // Import gif.js dynamically
      const GIFModule = await import('gif.js');
      const GIF = GIFModule.default;

      // Create a new GIF with optimized configuration
      const gif = new GIF({
        workers: 2,
        quality: 10,
        width: null,  // Will be set by first frame
        height: null,  // Will be set by first frame
        transparent: null,
        dither: false,
        debug: false
      });

      // Calculate delay based on frame rate (in milliseconds)
      const delay = Math.round(1000 / frameRate);
      console.log('Frame delay:', delay, 'ms');

      // Add each frame to the GIF
      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        console.log(`Processing frame ${i + 1}/${frames.length}`);
        
        // Create an optimized canvas for better performance
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        if (!ctx) {
          console.warn('Failed to get canvas context for frame', i);
          continue;
        }
        
        // Create an image element for the frame
        const img = new Image();
        img.crossOrigin = 'anonymous'; // Enable CORS
        img.src = frame.url;
        
        // Wait for image to load
        await new Promise((resolve, reject) => {
          if (img.complete) {
            resolve(null);
          } else {
            img.onload = () => resolve(null);
            img.onerror = (error) => {
              console.warn(`Failed to load frame ${i}:`, error);
              resolve(null); // Continue even if there's an error
            };
          }
        });
        
        // Set canvas dimensions to match image
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        
        // Draw image to canvas (this triggers the willReadFrequently optimization)
        ctx.drawImage(img, 0, 0);
        
        // Add frame to GIF using canvas for better performance
        gif.addFrame(canvas, { 
          delay,
          copy: true, // Copy the frame instead of referencing it
          dispose: -1 // Dispose method for better compatibility
        });
        
        // Clean up
        canvas.width = 0;
        canvas.height = 0;
      }

      // Handle progress updates
      gif.on('progress', (p) => {
        console.log('GIF encoding progress:', Math.round(p * 100) + '%');
      });

      // Handle finished event
      gif.on('finished', (blob) => {
        console.log('GIF creation completed, blob size:', blob.size, 'bytes');
        
        if (blob.size === 0) {
          throw new Error('Generated GIF is empty');
        }
        
        // Create download link
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `nanomotion-animation-${Date.now()}.gif`;
        
        // Ensure the link is properly configured
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        
        // Clean up
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(link.href);
        }, 100);
        
        console.log('Download triggered successfully');
      });

      // Handle error
      gif.on('error', (error) => {
        console.error('GIF creation error:', error);
        alert('Failed to create GIF: ' + error.message);
      });

      console.log('Starting GIF rendering...');
      // Start rendering the GIF
      gif.render();
      
    } catch (error) {
      console.error('Export animation error:', error);
      alert('Export failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
      
      // Fallback: download first frame as image
      try {
        console.log('Attempting fallback: downloading first frame');
        const link = document.createElement("a");
        link.href = frames[0].url;
        link.download = `nanomotion-frame-0.${frames[0].file.name.split(".").pop() || 'png'}`;
        link.click();
      } catch (fallbackError) {
        console.error('Fallback download also failed:', fallbackError);
      }
    }
  };

  const togglePlayback = () => {
    if (frames.length === 0) return;
    setIsPlaying(!isPlaying);
  };

  const resetAnimation = () => {
    setIsPlaying(false);
    setCurrentFrame(0);
  };

  const nextFrame = () => {
    if (frames.length === 0) return;
    setCurrentFrame((prev) => (prev + 1) % frames.length);
  };

  const prevFrame = () => {
    if (frames.length === 0) return;
    setCurrentFrame((prev) => (prev - 1 + frames.length) % frames.length);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
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
            Create stunning stop motion animations from your images
          </p>
        </motion.div>

        {/* Progress Panel */}
        {(isGenerating || generationProgress) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Generation Progress
              </h2>
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2">
                  {isGenerating && (
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  )}
                  <p className="text-blue-700 dark:text-blue-300 text-sm font-medium">
                    {generationProgress || "Processing..."}
                  </p>
                </div>
                
                {generatedPoses && (
                  <div className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                    <strong>Poses:</strong> {generatedPoses}
                  </div>
                )}
                
                {generatedImages.length > 0 && (
                  <div className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                    <strong>Generated frames:</strong> {generatedImages.length}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Upload Area */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-1"
          >
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Upload Frames
              </h2>

              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                  isDragOver
                    ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                    : "border-gray-300 dark:border-gray-600 hover:border-purple-400"
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadPreview ? (
                  <div className="relative">
                    <img
                      src={uploadPreview}
                      alt="Upload preview"
                      className="max-w-full max-h-48 mx-auto rounded-lg object-contain"
                    />
                  </div>
                ) : (
                  <>
                    <Plus className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-600 dark:text-gray-300 mb-4">
                      Drag & drop an image here or click to browse
                    </p>
                    <div className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg transition-colors inline-block">
                      Choose Files
                    </div>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileSelection(e.target.files)}
                />
              </div>

              {/* Frame Rate Control */}
              <div className="mt-6">
                <label className="block text-sm font-medium mb-2">
                  Frame Rate: {frameRate} FPS
                </label>
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={frameRate}
                  onChange={(e) => setFrameRate(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              {/* Action Buttons */}
              <div className="mt-6 space-y-3">
                <button
                  onClick={generateAnimation}
                  disabled={!lastSelectedFile || isGenerating}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <Wand2
                    className={`w-4 h-4 ${isGenerating ? "animate-spin" : ""}`}
                  />
                  {isGenerating ? "Generating..." : "Generate Animation"}
                </button>
              </div>
            </div>
          </motion.div>

          {/* Preview Area */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-2"
          >
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Film className="w-5 h-5" />
                  Animation Preview
                </h2>
                <div className="text-sm text-gray-500">
                  {frames.length > 0
                    ? `Frame ${currentFrame + 1} of ${frames.length}`
                    : "No frames"}
                </div>
              </div>

              {/* Preview Display */}
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
                    <p>Upload images to start creating your animation</p>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-4 mb-6">
                <button
                  onClick={prevFrame}
                  disabled={frames.length === 0}
                  className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <SkipBack className="w-5 h-5" />
                </button>

                <button
                  onClick={togglePlayback}
                  disabled={frames.length === 0}
                  className="p-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6" />
                  ) : (
                    <Play className="w-6 h-6" />
                  )}
                </button>

                <button
                  onClick={resetAnimation}
                  disabled={frames.length === 0}
                  className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Square className="w-5 h-5" />
                </button>

                <button
                  onClick={nextFrame}
                  disabled={frames.length === 0}
                  className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <SkipForward className="w-5 h-5" />
                </button>

                <div className="w-px h-8 bg-gray-300 dark:bg-gray-600 mx-2" />

                <button
                  onClick={exportAnimation}
                  disabled={frames.length === 0}
                  className="p-2 rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Download className="w-5 h-5" />
                </button>
              </div>

              {/* Frame Timeline */}
              {frames.length > 0 && (
                <div className="border-t pt-4">
                  <h3 className="text-sm font-medium mb-3">Timeline</h3>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {frames.map((frame, index) => (
                      <motion.div
                        key={frame.id}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                          index === currentFrame
                            ? "border-purple-500 ring-2 ring-purple-200"
                            : "border-gray-300 hover:border-purple-300"
                        }`}
                        onClick={() => setCurrentFrame(index)}
                      >
                        <img
                          src={frame.url}
                          alt={`Frame ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFrame(frame.id);
                          }}
                          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs text-center py-1">
                          {index + 1}
                        </div>
                      </motion.div>
                    ))}
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