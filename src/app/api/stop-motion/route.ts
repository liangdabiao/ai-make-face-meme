import { generateImage } from "@/lib/ai";
import { buildFramePrompt, generatePoses } from "@/lib/poses";
import { NextRequest } from "next/server";

export const maxDuration = 800;

const FRAME_COUNT = 12;
const CHUNK_SEPARATOR = "\n---CHUNK_END---\n";

const encoder = new TextEncoder();

function encodeChunk(
  controller: ReadableStreamDefaultController<Uint8Array>,
  payload: object,
) {
  controller.enqueue(encoder.encode(JSON.stringify(payload) + CHUNK_SEPARATOR));
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const image = formData.get("image") as File | null;

  if (!image) {
    return Response.json({ error: "No image provided" }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const buffer = Buffer.from(await image.arrayBuffer());

        encodeChunk(controller, { type: "progress", data: "Generating pose sequence..." });

        const sequence = generatePoses(FRAME_COUNT);

        encodeChunk(controller, { type: "poses", data: JSON.stringify(sequence) });
        encodeChunk(controller, {
          type: "progress",
          data: `Generating ${FRAME_COUNT} frames in parallel...`,
        });

        const tasks = sequence.poses.map((pose, i) =>
          (async () => {
            try {
              const result = await generateImage(buildFramePrompt(pose, i), buffer, {
                aspectRatio: "4:3",
                mimeType: image.type,
              });
              return { ok: true as const, index: i, pose, result };
            } catch (err) {
              return {
                ok: false as const,
                index: i,
                pose,
                error: err instanceof Error ? err.message : String(err),
              };
            }
          })(),
        );

        let completed = 0;
        await Promise.allSettled(
          tasks.map(async (task) => {
            const outcome = await task;
            completed += 1;

            if (outcome.ok) {
              encodeChunk(controller, {
                type: "frame",
                data: {
                  frameIndex: outcome.index + 1,
                  poseName: outcome.pose.name,
                  type: "image",
                  url: outcome.result.url,
                  contentType: outcome.result.contentType,
                },
              });
            } else {
              encodeChunk(controller, {
                type: "frame_error",
                data: {
                  frameIndex: outcome.index + 1,
                  poseName: outcome.pose.name,
                  error: outcome.error,
                },
              });
            }

            encodeChunk(controller, {
              type: "progress",
              data: `Completed ${completed}/${FRAME_COUNT} frames`,
            });
          }),
        );

        encodeChunk(controller, { type: "complete", data: "Done" });
        controller.close();
      } catch (error) {
        encodeChunk(controller, {
          type: "error",
          data: error instanceof Error ? error.message : "Unknown error",
        });
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
