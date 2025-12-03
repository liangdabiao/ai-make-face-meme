import { generatePosesFromImageBuffer, nanobanana } from "@/lib/ai";
import { uploadToBlob } from "@/lib/blob";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 800;

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const image = formData.get("image") as File | null;

  if (!image) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  // Create a streaming response
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        // Upload the image to blob storage
        // const uploadResult = await uploadToBlob(image);
        // console.log("Upload result:", uploadResult);

        const buffer = Buffer.from(await image.arrayBuffer());
        
        // Stream initial pose generation progress
        const progressData = JSON.stringify({ 
          type: "progress", 
          data: "正在分析图像并生成姿势序列..." 
        }) + "\n---CHUNK_END---\n";
        controller.enqueue(encoder.encode(progressData));

        const posesData = await generatePosesFromImageBuffer(buffer, image.type, 12);

        // Stream the poses array after generation
        const posesJson = JSON.parse(posesData ?? "{}");
        
        const posesResponse = JSON.stringify({ 
          type: "poses", 
          data: posesData 
        }) + "\n---CHUNK_END---\n";
        controller.enqueue(encoder.encode(posesResponse));

        if (posesJson.poses && Array.isArray(posesJson.poses)) {
          // Stream image generation progress
          const imageProgressData = JSON.stringify({ 
            type: "progress", 
            data: `开始生成 ${posesJson.poses.length} 个图像帧...` 
          }) + "\n---CHUNK_END---\n";
          controller.enqueue(encoder.encode(imageProgressData));

          for (let i = 0; i < posesJson.poses.length; i++) {
            const pose = posesJson.poses[i];
            
            // Stream current generation progress
            const currentProgress = JSON.stringify({ 
              type: "progress", 
              data: `正在生成第 ${i + 1}/${posesJson.poses.length} 帧: ${pose.name}` 
            }) + "\n---CHUNK_END---\n";
            controller.enqueue(encoder.encode(currentProgress));

            const prompt = `基于参考图像，生成符合以下姿势描述的静止画面帧：

姿势描述：${pose.description || pose.name || '标准姿势'}
动作步骤：${pose.step || i + 1}

要求：
- 严格遵循参考图像中角色/物体的基本外观、比例和特征
- 精确应用姿势描述中的动作要求
- 保持原始图像的光照条件和背景元素
- 确保动作自然流畅，适合逐帧动画制作
- 保持图像质量清晰，适合停止动画制作
- 保持风格一致性：颜色、纹理、材质等细节

生成一张清洁、可制作的高质量动画帧，精确匹配姿势描述要求。`;

            try {
              // Generate nanobanana response
              const nanobananaResult = await nanobanana(prompt, buffer, {
                responseFormat: 'b64_json',
                aspectRatio: '4:3' // Good for animations
              });
              
              if (nanobananaResult.type === "image") {
                const resultData = JSON.stringify({
                  type: "nanobanana",
                  data: {
                    frameIndex: i + 1,
                    poseName: pose.name,
                    type: "image",
                    base64ImageData: nanobananaResult.base64ImageData,
                    contentType: nanobananaResult.contentType || 'image/jpeg',
                  },
                }) + "\n---CHUNK_END---\n";
                controller.enqueue(encoder.encode(resultData));
                
                console.log(`Generated frame ${i + 1}/${posesJson.poses.length}: ${pose.name}`);
              } else {
                console.warn(`Unexpected result type for frame ${i + 1}:`, nanobananaResult.type);
              }
            } catch (frameError) {
              console.error(`Error generating frame ${i + 1}:`, frameError);
              // Send error for this frame but continue
              const frameErrorData = JSON.stringify({
                type: "frame_error",
                data: {
                  frameIndex: i + 1,
                  poseName: pose.name,
                  error: frameError instanceof Error ? frameError.message : "Unknown frame generation error"
                }
              }) + "\n---CHUNK_END---\n";
              controller.enqueue(encoder.encode(frameErrorData));
            }
          }
        } else {
          console.warn("No poses found in response or poses is not an array");
        }

        // End the stream
        const endData = JSON.stringify({ 
          type: "complete", 
          data: "处理完成" 
        }) + "\n---CHUNK_END---\n";
        controller.enqueue(encoder.encode(endData));
        controller.close();
      } catch (error) {
        console.error("Error in streaming:", error);
        const errorData = JSON.stringify({
          type: "error",
          data: error instanceof Error ? error.message : "Unknown error",
        }) + "\n---CHUNK_END---\n";
        controller.enqueue(encoder.encode(errorData));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/json",
      "Transfer-Encoding": "chunked",
    },
  });
}
