export const CAMERA_ELEVATION = Math.atan2(1700, 1190);

export function architectureLayout(width, imageWidth, imageHeight) {
  const height = width * imageHeight / imageWidth;
  // 把贴图前缘放到地面前侧，而非把贴图的下半部分压到地面以下。
  return { width, height, frontDepth: height * .18 / Math.sin(CAMERA_ELEVATION), groundClearance: .12 };
}
