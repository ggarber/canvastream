export type SlotTag = "screen" | "camera" | "remote" | "any";

export interface Placeholder {
  x: number;
  y: number;
  width: number;
  height: number;
  tags: SlotTag[];
  rounded?: boolean;
}

export interface Layout {
  id: string;
  name: string;
  placeholders: Placeholder[];
}

export const LAYOUTS: Layout[] = [
  {
    id: "presentation",
    name: "Presentation",
    placeholders: [
      { x: 0, y: 0, width: 1280, height: 720, tags: ["screen"] },
      // Videos in a bottom row with local video in the right (max 4 total in bottom)
      // 240x135 thumbnails with 24px gap, 24px from bottom/sides
      { x: 24 + (240 + 24) * 0, y: 720 - 135 - 24, width: 240, height: 135, tags: ["remote"], rounded: true },
      { x: 24 + (240 + 24) * 1, y: 720 - 135 - 24, width: 240, height: 135, tags: ["remote"], rounded: true },
      { x: 24 + (240 + 24) * 2, y: 720 - 135 - 24, width: 240, height: 135, tags: ["remote"], rounded: true },
      { x: 1280 - 240 - 24, y: 720 - 135 - 24, width: 240, height: 135, tags: ["camera"], rounded: true },
    ],
  },
  {
    id: "2x2",
    name: "2x2 Grid",
    placeholders: [
      { x: 0, y: 0, width: 640, height: 360, tags: ["any"] },
      { x: 640, y: 0, width: 640, height: 360, tags: ["any"] },
      { x: 0, y: 360, width: 640, height: 360, tags: ["any"] },
      { x: 640, y: 360, width: 640, height: 360, tags: ["any"] },
    ],
  },
];
