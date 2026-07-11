/**
 * Built-in pose sequence used to drive stop-motion frame generation.
 * Each pose describes a still-frame pose; the route generates one frame per pose.
 */

export interface Pose {
  name: string;
  description: string;
  step: number;
}

export interface PoseSequence {
  poses: Pose[];
  description: string;
}

const POSE_TEMPLATES: ReadonlyArray<Omit<Pose, "step">> = [
  {
    name: "Starting pose",
    description: "Character in neutral starting position, standing upright with natural posture",
  },
  {
    name: "Initial movement",
    description: "Character beginning to move, slight shift in weight or position",
  },
  {
    name: "Mid action pose",
    description: "Character in the middle of movement, showing progression",
  },
  {
    name: "Peak action",
    description: "Character at peak of movement or maximum expression",
  },
  {
    name: "Recovery position",
    description: "Character recovering, moving back toward starting position",
  },
  {
    name: "Final pose",
    description: "Character in final position of the sequence",
  },
];

export function generatePoses(numPoses: number): PoseSequence {
  const poses: Pose[] = [];
  for (let i = 0; i < numPoses; i++) {
    const template = POSE_TEMPLATES[i % POSE_TEMPLATES.length];
    const variation = Math.floor(i / POSE_TEMPLATES.length);
    poses.push({
      name: variation > 0 ? `${template.name} (Variation ${variation + 1})` : template.name,
      description: template.description,
      step: i + 1,
    });
  }
  return {
    poses,
    description: `Generated ${numPoses} sequential poses for stop-motion animation`,
  };
}

export function buildFramePrompt(pose: Pose, index: number): string {
  return `Based on the reference image, generate a still frame matching this pose:

Pose: ${pose.description || pose.name}
Step: ${pose.step || index + 1}

Requirements:
- Strictly preserve the reference image's character/object appearance, proportions, and features
- Apply the pose description precisely
- Maintain the original image's lighting conditions and background elements
- Ensure the motion feels natural and fluid, suitable for frame-by-frame animation
- Keep image quality clear and well-suited for stop-motion composition
- Maintain style consistency: color, texture, material, and other details

Produce a clean, production-ready animation frame that precisely matches the pose description.`;
}
