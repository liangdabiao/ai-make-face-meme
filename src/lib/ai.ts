// kg-api.cloud API configuration
const BASE_URL = process.env.NANO_BANANA_API_BASE_URL || "https://api.nanobanana.io";
const API_KEY = process.env.NANO_BANANA_API_KEY || "";

// Interface for the request body
interface NanobananaRequest {
  model: string;
  prompt: string;
  response_format?: string;
  aspect_ratio?: string;
  image?: string[];
  image_size?: string;
}

// Interface for the response
interface NanobananaResponse {
  data?: {
    url?: string;
    b64_json?: string;
  };
  error?: string;
}

import fs from 'fs';

function saveBinaryFile(fileName: string, content: string) {
  // 保存Base64或URL内容到文件
  fs.writeFile(fileName, content, "utf8", (err: NodeJS.ErrnoException | null) => {
    if (err) {
      console.error(`Error writing file ${fileName}:`, err);
      return;
    }
    console.log(`File ${fileName} saved to file system.`);
  });
}

export interface NanobananaOptions {
  model?: string;
  responseFormat?: 'url' | 'b64_json';
  aspectRatio?: '4:3' | '3:4' | '16:9' | '9:16' | '2:3' | '3:2' | '1:1' | '4:5' | '5:4' | '21:9';
  imageSize?: '1K' | '2K' | '4K';
  referenceImages?: string[];
}

/**
 * Generate image using Nano-banana API
 * @param prompt The text prompt for image generation
 * @param imageBuffer Optional reference image buffer
 * @param options Additional generation options
 * @returns Generated image data (URL or base64)
 */
export async function nanobanana(
  prompt: string, 
  imageBuffer?: Buffer, 
  options: NanobananaOptions = {}
) {
  try {
    // 验证API密钥
    if (!API_KEY) {
      throw new Error('API密钥未配置：请在.env文件中设置NANO_BANANA_API_KEY');
    }

    const requestBody: NanobananaRequest = {
      model: options.model || 'nano-banana',
      prompt: prompt,
    };

    // 设置响应格式，默认为base64以保持兼容性
    if (options.responseFormat) {
      requestBody.response_format = options.responseFormat;
    } else {
      requestBody.response_format = 'b64_json';
    }

    // 设置长宽比
    if (options.aspectRatio) {
      requestBody.aspect_ratio = options.aspectRatio;
    }

    // 设置图像质量（仅nano-banana-2支持）
    if (options.imageSize && (options.model === 'nano-banana-2' || !options.model)) {
      requestBody.image_size = options.imageSize;
    }

    // 添加参考图像
    if (imageBuffer) {
      // 如果有参考图像，使用base64格式
      requestBody.image = [imageBuffer.toString('base64')];
    } else if (options.referenceImages) {
      requestBody.image = options.referenceImages;
    }

    console.log('Sending request to Nano-banana API:', {
      url: `${BASE_URL}/v1/images/generations`,
      body: { ...requestBody, image: requestBody.image ? '[Reference image data]' : undefined },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY ? '***' : 'EMPTY'}`,
      }
    });

    const response = await fetch(`${BASE_URL}/v1/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }

    const data: any = await response.json();
    console.log('API Response:', JSON.stringify(data, null, 2));
    
    // 处理不同的响应格式
    if (data.error) {
      throw new Error(`API错误: ${data.error}`);
    }

    // 尝试多种可能的响应格式
    let imageData: string | undefined;
    let imageUrl: string | undefined;
    
    // 格式1: 标准OpenAI格式 data.data[0].url 或 data.data[0].b64_json
    if (data.data?.[0]?.url) {
      imageUrl = data.data[0].url;
      console.log('✓ 找到URL (格式1):', imageUrl);
    } else if (data.data?.[0]?.b64_json) {
      // 提取完整的base64字符串（包含data:image/...;base64,前缀）
      const fullBase64String = data.data[0].b64_json;
      console.log('✓ 找到base64数据 (格式1), 完整字符串长度:', fullBase64String.length);
      
      // 如果是完整的base64字符串（包含前缀），提取实际数据部分
      if (fullBase64String.startsWith('data:image/')) {
        // 提取base64数据部分（去掉前缀）
        imageData = fullBase64String.split(',')[1] || fullBase64String;
        console.log('✓ 提取base64数据长度:', imageData ? imageData.length : 0);
      } else {
        // 如果只是直接的base64数据
        imageData = fullBase64String;
      }
    }
    
    // 格式2: 直接在根级别的url或b64_json
    if (!imageUrl && data.url) {
      imageUrl = data.url;
      console.log('✓ 找到URL (格式2):', imageUrl);
    } else if (!imageData && data.b64_json) {
      // 处理可能是完整的base64字符串
      const fullBase64String = data.b64_json;
      if (fullBase64String && fullBase64String.startsWith('data:image/')) {
        imageData = fullBase64String.split(',')[1] || fullBase64String;
      } else {
        imageData = fullBase64String;
      }
      console.log('✓ 找到base64数据 (格式2), 长度:', imageData ? imageData.length : 0);
    }
    
    // 格式3: 在data数组中的其他格式
    if (!imageUrl && !imageData && Array.isArray(data.data)) {
      for (let i = 0; i < data.data.length; i++) {
        const item = data.data[i];
        if (item?.url && item.url.trim()) {
          imageUrl = item.url;
          console.log(`✓ 找到URL (格式3, data[${i}].url):`, imageUrl);
          break;
        } else if (item?.b64_json) {
          const fullBase64String = item.b64_json;
          if (fullBase64String.startsWith('data:image/')) {
            imageData = fullBase64String.split(',')[1] || fullBase64String;
          } else {
            imageData = fullBase64String;
          }
          console.log(`✓ 找到base64数据 (格式3, data[${i}].b64_json), 长度:`, imageData ? imageData.length : 0);
          break;
        }
      }
    }

    // 格式4: 在其他可能的字段中
    if (!imageUrl && !imageData) {
      for (const [key, value] of Object.entries(data)) {
        if (key.toLowerCase().includes('url') && typeof value === 'string' && value.trim()) {
          imageUrl = value as string;
          console.log(`✓ 找到URL (格式4, 字段: ${key}):`, imageUrl);
          break;
        } else if (key.toLowerCase().includes('image') && typeof value === 'string') {
          const fullBase64String = value as string;
          if (fullBase64String.startsWith('data:image/')) {
            imageData = fullBase64String.split(',')[1] || fullBase64String;
          } else {
            imageData = fullBase64String;
          }
          console.log(`✓ 找到base64数据 (格式4, 字段: ${key}), 长度:`, imageData ? imageData.length : 0);
          break;
        }
      }
    }

    // 返回图像数据
    if (imageUrl) {
      return {
        type: 'image',
        imageUrl: imageUrl,
        contentType: 'image/jpeg',
      };
    } else if (imageData) {
      return {
        type: 'image',
        base64ImageData: imageData,
        contentType: 'image/jpeg',
      };
    } else {
      console.error('API返回的数据结构:', Object.keys(data));
      console.error('完整响应:', JSON.stringify(data, null, 2));
      throw new Error('API未返回有效的图像数据，请检查响应格式');
    }

  } catch (error) {
    console.error("Error in nanobanana function:", error);
    if (error instanceof Error) {
      if (error.message.includes('fetch failed')) {
        throw new Error("网络连接问题：无法连接到API服务。请检查网络连接和防火墙设置。");
      } else if (error.message.includes('timeout')) {
        throw new Error("请求超时：AI模型响应时间过长。请重试或使用更简单的提示词。");
      } else if (error.message.includes('API request failed')) {
        throw new Error(`API请求失败：${error.message}`);
      } else {
        throw new Error(`API服务错误：${error.message}`);
      }
    } else {
      throw new Error("生成内容时发生未知错误");
    }
  }
}

/**
 * Simple image generation with default options
 * @param prompt The text prompt for image generation
 * @param options Additional generation options
 * @returns Generated image data
 */
export async function generateImage(
  prompt: string,
  options: NanobananaOptions = {}
) {
  // 默认使用base64格式以保持与现有代码的兼容性
  const defaultOptions = {
    ...options,
    responseFormat: options.responseFormat || 'b64_json'
  };
  return nanobanana(prompt, undefined, defaultOptions);
}

/**
 * Generate image from reference image
 * @param prompt The text prompt for image generation
 * @param referenceImageBuffer The reference image buffer
 * @param options Additional generation options
 * @returns Generated image data
 */
export async function generateImageFromReference(
  prompt: string,
  referenceImageBuffer: Buffer,
  options: NanobananaOptions = {}
) {
  return nanobanana(prompt, referenceImageBuffer, options);
}

// Note: The following functions remain as they were originally designed for pose generation
// which is a different functionality from image generation.
// They could be adapted to use the new API if needed in the future.

export async function generatePosesFromImage(
  buffer: Buffer,
  mimeType: string,
  numPoses: number
) {
  try {
    console.log(`Generating ${numPoses} poses from image analysis...`);
    
    // Convert image to base64 for potential future API usage
    const imageBase64 = buffer.toString('base64');
    
    // Generate meaningful pose sequences based on common stop-motion patterns
    // These poses are designed to create smooth animation sequences
    const poseTemplates = [
      {
        name: "Starting pose",
        description: "Character/object in neutral starting position",
        prompt: "Character in neutral starting position, standing upright with natural posture"
      },
      {
        name: "Initial movement", 
        description: "Beginning of animation sequence",
        prompt: "Character beginning to move, slight shift in weight or position"
      },
      {
        name: "Mid action pose",
        description: "Middle point of the movement",
        prompt: "Character in the middle of movement, showing progression"
      },
      {
        name: "Peak action",
        description: "Maximum extension or expression",
        prompt: "Character at peak of movement or maximum expression"
      },
      {
        name: "Recovery position",
        description: "Moving back toward starting point",
        prompt: "Character recovering, moving back toward starting position"
      },
      {
        name: "Final pose",
        description: "End of sequence",
        prompt: "Character in final position of the sequence"
      }
    ];
    
    // Create a sequence of poses
    const poses = [];
    
    for (let i = 0; i < numPoses; i++) {
      // Cycle through templates and create variations
      const template = poseTemplates[i % poseTemplates.length];
      const variation = Math.floor(i / poseTemplates.length);
      
      let poseDescription = template.name;
      let posePrompt = template.prompt;
      
      // Add variation details for longer sequences
      if (variation > 0) {
        poseDescription += ` (Variation ${variation + 1})`;
        posePrompt += `, variation ${variation + 1}`;
      }
      
      poses.push({
        name: poseDescription,
        description: template.description,
        prompt: posePrompt,
        step: i + 1
      });
      
      // Add slight variations for each frame
      if (i < numPoses - 1) {
        poses.push({
          name: poseDescription + " - Transition",
          description: `Smooth transition to next pose`,
          prompt: `Character in smooth transition, intermediate step between ${template.name} and next position`,
          step: i + 1.5
        });
      }
    }
    
    // Limit to requested number of poses
    const finalPoses = poses.slice(0, numPoses);
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    console.log(`Generated ${finalPoses.length} poses for animation`);
    
    return JSON.stringify({
      poses: finalPoses,
      description: `Generated ${numPoses} sequential poses for stop-motion animation`
    });
    
  } catch (error) {
    console.error("Error in generatePosesFromImage function:", error);
    if (error instanceof Error) {
      if (error.message.includes("fetch failed")) {
        throw new Error("网络连接问题：无法连接姿态生成服务。请检查网络连接。");
      } else if (error.message.includes("timeout")) {
        throw new Error("请求超时：姿态生成时间过长。请重试。");
      } else {
        throw new Error(`姿态生成错误：${error.message}`);
      }
    } else {
      throw new Error("生成姿态时发生未知错误");
    }
  }
}

export async function generatePosesFromImageBuffer(
  buffer: Buffer,
  mimeType: string,
  numPoses: number
) {
  return generatePosesFromImage(buffer, mimeType, numPoses);
}

export async function generatePosesFromImageUrl(
  imageUrl: string,
  numPoses: number
) {
  try {
    // Fetch the image data from the URL
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`无法获取图像：${imageResponse.statusText}`);
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(imageBuffer);
    const mimeType = imageResponse.headers.get("content-type") || "image/jpeg";

    return generatePosesFromImage(buffer, mimeType, numPoses);
  } catch (error) {
    console.error("Error fetching image from URL:", error);
    throw new Error("从URL获取图像失败，请检查URL是否有效");
  }
}