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
  // 拖拽排序相关状态
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const animationRef = useRef<NodeJS.Timeout | null>(null); // ✅ 修复类型

  // Animation loop - 改进的清理逻辑
  useEffect(() => {
    // 清理旧的 interval
    if (animationRef.current) {
      clearInterval(animationRef.current);
      animationRef.current = null;
    }

    if (isPlaying && frames.length > 0) {
      animationRef.current = setInterval(() => {
        setCurrentFrame((prev) => (prev + 1) % frames.length);
      }, 1000 / frameRate);
    }

    return () => {
      if (animationRef.current) {
        clearInterval(animationRef.current);
      }
    };
  }, [isPlaying, frames.length, frameRate]);

  // ✅ 改进的文件选择处理 - 支持多文件上传
  const handleFileSelection = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    // 处理所有选中的图片文件
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      if (file.type.startsWith("image/")) {
        // 创建帧数据
        const frame: Frame = {
          id: `frame-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
          url: URL.createObjectURL(file),
          file: file
        };
        
        // 更新帧列表
        setFrames(prev => [...prev, frame]);
        
        // 如果是第一个文件，更新预览
        if (i === 0) {
          setLastSelectedFile(file);
          setUploadPreview(frame.url);
        }
      }
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
      // 找到要删除的帧并释放其URL
      const frameToRemove = prev.find((frame) => frame.id === id);
      if (frameToRemove) {
        URL.revokeObjectURL(frameToRemove.url);
      }
      
      const newFrames = prev.filter((frame) => frame.id !== id);
      if (currentFrame >= newFrames.length && newFrames.length > 0) {
        setCurrentFrame(newFrames.length - 1);
      }
      return newFrames;
    });
  };

  // ✅ 改进的移动帧处理，确保帧索引正确性
  const moveFrame = (dragIndex: number, hoverIndex: number) => {
    setFrames((prev) => {
      const newFrames = [...prev];
      const [draggedFrame] = newFrames.splice(dragIndex, 1);
      newFrames.splice(hoverIndex, 0, draggedFrame);
      return newFrames;
    });
    
    // 更新当前帧索引，确保它指向原来的帧
    if (dragIndex === currentFrame) {
      setCurrentFrame(hoverIndex);
    } else if (dragIndex < currentFrame && hoverIndex >= currentFrame) {
      setCurrentFrame(currentFrame - 1);
    } else if (dragIndex > currentFrame && hoverIndex <= currentFrame) {
      setCurrentFrame(currentFrame + 1);
    }
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
                setTimeout(() => setGenerationProgress(""), 6000);
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
      setTimeout(() => setGenerationProgress(""), 8000);
    } finally {
      setIsGenerating(false);
    }
  };

  const exportAnimation = async () => {
    if (frames.length === 0) {
      alert('没有可导出的帧');
      return;
    }

    // ✅ 改进的GIF生成逻辑
    try {
      console.log('开始生成GIF，共', frames.length, '帧');

      // 显示生成进度
      setGenerationProgress('正在准备生成GIF...');

      // 获取所有图片URL
      const imageUrls = frames.map(frame => frame.url);
      console.log('准备生成GIF，图片数量:', imageUrls.length);

      setGenerationProgress('正在生成GIF动画，请稍候...');

      // 🎯 使用gifencoder生成真正的GIF
      try {
        console.log('🚀 使用gifencoder生成GIF...');

        // 动态导入gifencoder
        const { default: GIFEncoder } = await import('gifencoder');
        if (!GIFEncoder) {
          throw new Error('gifencoder模块未找到');
        }

        console.log('✅ gifencoder模块导入成功');

        // 创建Canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (!ctx) {
          throw new Error('无法创建Canvas上下文');
        }

        // 设置合适的尺寸
        canvas.width = 400;
        canvas.height = 300;

        setGenerationProgress('正在加载图片...');

        // 预加载所有需要的图片
        const imagesToProcess = frames.slice(0, Math.min(frames.length, 12)); // 增加到12帧
        const loadedImages: HTMLImageElement[] = [];

        for (let i = 0; i < imagesToProcess.length; i++) {
          setGenerationProgress(`加载第 ${i + 1}/${imagesToProcess.length} 帧...`);

          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error(`图片${i + 1}加载超时`));
            }, 15000); // 增加超时时间到15秒

            img.onload = () => {
              clearTimeout(timeout);
              resolve();
            };

            img.onerror = () => {
              clearTimeout(timeout);
              reject(new Error(`图片${i + 1}加载失败`));
            };

            img.src = imagesToProcess[i].url;
          });

          loadedImages.push(img);
        }

        console.log('✅ 所有图片加载完成');

        // 创建GIF编码器
        const encoder = new GIFEncoder(canvas.width, canvas.height);
        encoder.start();
        encoder.setRepeat(0); // 0 = 循环播放
        encoder.setDelay(Math.round(1000 / frameRate)); // 帧间隔（毫秒）
        encoder.setQuality(10); // 更好的质量：1-30，越小质量越好
        // encoder.setTransparent(0x000000); // 移除透明色设置，提高兼容性

        setGenerationProgress('正在生成GIF帧...');

        // 逐帧处理
        for (let i = 0; i < loadedImages.length; i++) {
          setGenerationProgress(`生成第 ${i + 1}/${loadedImages.length} 帧...`);

          const img = loadedImages[i];

          // 清空画布（黑色背景，更适合动画）
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // 计算缩放比例，保持图片比例
          const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
          const width = img.width * scale;
          const height = img.height * scale;
          const x = (canvas.width - width) / 2;
          const y = (canvas.height - height) / 2;

          // 绘制图片
          ctx.drawImage(img, x, y, width, height);

          // 添加到GIF
          encoder.addFrame(ctx);

          console.log(`✅ 已添加第 ${i + 1} 帧`);
        }

        setGenerationProgress('正在完成GIF编码...');

        // 完成编码
        encoder.finish();

        // 获取GIF数据
        const gifBuffer = encoder.out.getData();
        const gifBlob = new Blob([gifBuffer], { type: 'image/gif' });

        console.log('✅ GIF编码完成，文件大小:', gifBlob.size, 'bytes');

        // 下载GIF
        const link = document.createElement('a');
        link.href = URL.createObjectURL(gifBlob);
        link.download = `nanomotion-animation-${Date.now()}.gif`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log('✅ GIF下载成功');
        setGenerationProgress('🎉 GIF动画生成并下载成功！');

        // 清理临时创建的canvas
        canvas.remove();

        setTimeout(() => setGenerationProgress(''), 6000);
        // 使用toast或其他非阻塞方式通知用户，避免使用alert
        return;

      } catch (gifencoderError) {
        console.log('gifencoder失败，使用JSZip备用方案:', gifencoderError);
        setGenerationProgress('gifencoder失败，使用备用方案...');
      }

      // ✅ 改进的Canvas备用方案 - 实际生成多帧GIF
      console.log('使用Canvas生成GIF...');
      setGenerationProgress('正在用Canvas生成GIF...');

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (!ctx) {
        throw new Error('无法创建Canvas上下文');
      }

      // ✅ 统一Canvas尺寸
      canvas.width = 400;
      canvas.height = 300;

      // ✅ 预加载所有图片
      const loadedImages: HTMLImageElement[] = [];
      
      setGenerationProgress('正在加载图片...');
      
      for (let i = 0; i < Math.min(frames.length, 12); i++) {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`图片${i + 1}加载超时`));
          }, 15000); // 增加超时时间到15秒

          img.onload = () => {
            clearTimeout(timeout);
            resolve();
          };

          img.onerror = () => {
            clearTimeout(timeout);
            reject(new Error(`图片${i + 1}加载失败`));
          };

          img.src = frames[i].url;
        });
        loadedImages.push(img);
      }

      setGenerationProgress('正在生成GIF帧...');

      // ✅ 使用更简单的方法：创建简单的多帧动画
      // 这里我们使用一个简化的GIF生成器或者直接提供多张图片下载
      
      // 方案：打包所有帧为ZIP文件
      try {
        setGenerationProgress('正在创建图片包...');
        
        // 使用JSZip创建ZIP文件
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        
        // 添加每一帧到ZIP
        for (let i = 0; i < loadedImages.length; i++) {
          const img = loadedImages[i];
          
          // 绘制到Canvas
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // 绘制图片（保持比例）
          const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
          const x = (canvas.width - img.width * scale) / 2;
          const y = (canvas.height - img.height * scale) / 2;
          
          ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
          
          // 转换为Blob
          const canvasBlob = await new Promise<Blob>((resolve, reject) => {
            try {
              canvas.toBlob((blob) => {
                if (blob) {
                  resolve(blob);
                } else {
                  reject(new Error('Canvas转Blob失败'));
                }
              }, 'image/png', 0.9);
            } catch (error) {
              reject(error);
            }
          });
          
          // 添加到ZIP
          zip.file(`frame_${(i + 1).toString().padStart(3, '0')}.png`, canvasBlob);
        }
        
        // 生成ZIP并下载
        setGenerationProgress('正在打包文件...');
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipBlob);
        link.download = `nanomotion-frames-${Date.now()}.zip`;
        link.click();
        
        console.log('ZIP文件下载成功');
        setGenerationProgress('已下载帧图片包！');
        
        // 清理临时创建的canvas
        canvas.remove();
        
        setTimeout(() => setGenerationProgress(''), 6000);
        // 使用toast或其他非阻塞方式通知用户，避免使用alert
        return;
        
      } catch (zipError) {
        console.log('ZIP生成失败，使用最后备用方案:', zipError);
      }

      // 最简单的备用方案：下载第一帧
      console.log('使用最基础的备用方案');
      setGenerationProgress('下载单张图片作为备用...');

      const img = loadedImages[0] || new Image();
      if (!loadedImages[0]) {
        img.src = frames[0].url;
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
        });
      }

      // 清空画布
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 绘制图片（保持比例）
      const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
      const x = (canvas.width - img.width * scale) / 2;
      const y = (canvas.height - img.height * scale) / 2;

      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

      const canvasBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas转Blob失败'));
          }
        }, 'image/png');
      });

      const link = document.createElement('a');
      link.href = URL.createObjectURL(canvasBlob);
      link.download = `nanomotion-backup-${Date.now()}.png`;
      link.click();
      
      // 清理临时创建的canvas
      canvas.remove();

      console.log('单帧图片下载成功');
      setGenerationProgress('已下载第一帧作为备用');

      setTimeout(() => setGenerationProgress(''), 6000);
      alert(`⚠️ 动画生成完全失败，已下载第一帧\n\n建议:\n1. 检查浏览器控制台错误\n2. 尝试减少帧数\n3. 使用专业GIF制作工具\n4. 刷新页面重试`);

    } catch (error) {
      console.error('GIF生成完全失败:', error);
      setGenerationProgress('GIF生成失败');

      setTimeout(() => setGenerationProgress(''), 6000);

      const errorMessage = error instanceof Error ? error.message : '未知错误';
      alert(`❌ GIF生成失败\n\n错误: ${errorMessage}\n\n建议:\n1. 刷新页面重试\n2. 减少生成帧数\n3. 检查浏览器内存\n\n或者手动下载单张图片:`);

      // 最后的备用方案：下载第一帧
      if (frames.length > 0) {
        const link = document.createElement('a');
        link.href = frames[0].url;
        link.download = `nanomotion-backup-${Date.now()}.png`;
        link.click();
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

  // ✅ 拖拽排序功能的事件处理
  const handleFrameDragStart = (index: number) => (e: any) => {
    const dragEvent = e as React.DragEvent;
    setDraggedIndex(index);
    dragEvent.dataTransfer.effectAllowed = 'move';
    // 设置拖拽数据，确保在所有浏览器中都能工作
    dragEvent.dataTransfer.setData('text/html', '');
  };

  const handleFrameDragOver = (index: number) => (e: any) => {
    const dragEvent = e as React.DragEvent;
    dragEvent.preventDefault();
    dragEvent.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleFrameDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleFrameDrop = (targetIndex: number) => (e: any) => {
    const dragEvent = e as React.DragEvent;
    dragEvent.preventDefault();
    
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    // 使用moveFrame函数进行帧移动
    moveFrame(draggedIndex, targetIndex);

    // 清理拖拽状态
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
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
                  <h3 className="text-sm font-medium mb-3">Timeline (拖拽排序)</h3>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {frames.map((frame, index) => {
                      const isDragged = draggedIndex === index;
                      const isDragOver = dragOverIndex === index;
                      
                      return (
                        <motion.div
                          key={frame.id}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ 
                            opacity: 1, 
                            scale: isDragged ? 0.8 : isDragOver ? 1.1 : 1,
                            rotate: isDragged ? 5 : 0,
                          }}
                          draggable
                          onDragStart={handleFrameDragStart(index)}
                          onDragOver={handleFrameDragOver(index)}
                          onDragEnd={handleDragEnd}
                          onDrop={handleFrameDrop(index)}
                          className={`relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden cursor-move border-2 transition-all select-none ${
                            index === currentFrame
                              ? "border-purple-500 ring-2 ring-purple-200"
                              : "border-gray-300 hover:border-purple-300"
                          } ${
                            isDragged 
                              ? "opacity-50 border-blue-400 bg-blue-50" 
                              : isDragOver 
                                ? "border-blue-500 bg-blue-100 ring-2 ring-blue-300 scale-110" 
                                : ""
                          }`}
                          onClick={() => !isDragged && setCurrentFrame(index)}
                          style={{
                            zIndex: isDragged || isDragOver ? 1000 : 1,
                          }}
                        >
                          <img
                            src={frame.url}
                            alt={`Frame ${index + 1}`}
                            className="w-full h-full object-cover pointer-events-none"
                          />
                          
                          {/* 删除按钮 - 在拖拽时隐藏 */}
                          {!isDragged && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFrame(frame.id);
                              }}
                              className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs transition-colors z-10"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                          
                          {/* 帧编号 */}
                          <div className={`absolute bottom-0 left-0 right-0 text-white text-xs text-center py-1 ${
                            isDragged || isDragOver ? "bg-blue-600" : "bg-black bg-opacity-50"
                          }`}>
                            {index + 1}
                          </div>
                          
                          {/* 拖拽指示器 */}
                          {isDragged && (
                            <div className="absolute inset-0 bg-blue-500 bg-opacity-20 border-2 border-dashed border-blue-500 rounded-lg flex items-center justify-center">
                              <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
                            </div>
                          )}
                          
                          {/* 拖拽放置指示器 */}
                          {isDragOver && (
                            <div className="absolute inset-0 bg-green-500 bg-opacity-30 border-2 border-dashed border-green-500 rounded-lg flex items-center justify-center">
                              <div className="text-green-700 text-xs font-bold">放置</div>
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                  
                  {/* 拖拽提示 */}
                  <div className="mt-3 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    拖拽图片到想要的位置来重新排序动画帧
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