import { Landmark } from './liveness';

export interface Point2D {
  x: number;
  y: number;
}

export const CANONICAL_POINTS: Point2D[] = [
  { x: 38.2946, y: 51.6963 }, // Left eye outer corner (33)
  { x: 73.5318, y: 51.5014 }, // Right eye outer corner (362)
  { x: 56.0252, y: 71.7366 }, // Nose tip (1)
  { x: 41.5493, y: 92.3655 }, // Left mouth corner (61)
  { x: 70.7299, y: 92.2041 }, // Right mouth corner (291)
];

export const LANDMARK_INDICES = [33, 362, 1, 61, 291];

/**
 * Helper to yield execution back to the JS event loop.
 */
const yieldToThread = () => new Promise<void>(resolve => {
  if (typeof setImmediate !== 'undefined') {
    setImmediate(resolve);
  } else {
    setTimeout(resolve, 0);
  }
});

/**
 * Computes the similarity transform and warps the source RGBA image
 * to a 112x112 RGB image (represented as Uint8Array of length 112*112*3).
 * If landmarks are not available, falls back to a center-cropped resize.
 */
export async function alignFace(
  rgbaData: Uint8Array,
  width: number,
  height: number,
  landmarks: Landmark[] | null | undefined
): Promise<Uint8Array> {
  const hasValidLandmarks =
    landmarks &&
    Array.isArray(landmarks) &&
    landmarks.length >= 468 &&
    landmarks[33] &&
    landmarks[362] &&
    landmarks[1] &&
    landmarks[61] &&
    landmarks[291];

  if (!hasValidLandmarks) {
    return await centerCropResize(rgbaData, width, height);
  }

  // 1. Get the 5 points in pixel coordinates (MediaPipe landmarks are normalized [0, 1])
  const srcPoints: Point2D[] = LANDMARK_INDICES.map(idx => {
    const lm = landmarks[idx];
    return {
      x: lm.x * width,
      y: lm.y * height
    };
  });

  // 2. Compute centroids
  let srcMeanX = 0, srcMeanY = 0;
  let dstMeanX = 0, dstMeanY = 0;
  for (let i = 0; i < 5; i++) {
    srcMeanX += srcPoints[i].x;
    srcMeanY += srcPoints[i].y;
    dstMeanX += CANONICAL_POINTS[i].x;
    dstMeanY += CANONICAL_POINTS[i].y;
  }
  srcMeanX /= 5;
  srcMeanY /= 5;
  dstMeanX /= 5;
  dstMeanY /= 5;

  // 3. Center the points
  const srcCentered = srcPoints.map(p => ({ x: p.x - srcMeanX, y: p.y - srcMeanY }));
  const dstCentered = CANONICAL_POINTS.map(p => ({ x: p.x - dstMeanX, y: p.y - dstMeanY }));

  // 4. Calculate scaling & rotation parameters a, b
  let numA = 0;
  let numB = 0;
  let den = 0;
  for (let i = 0; i < 5; i++) {
    const sx = srcCentered[i].x;
    const sy = srcCentered[i].y;
    const dx = dstCentered[i].x;
    const dy = dstCentered[i].y;

    numA += sx * dx + sy * dy;
    numB += sx * dy - sy * dx;
    den += sx * sx + sy * sy;
  }

  // Fallback if den is extremely small/zero
  if (den < 1e-5) {
    return await centerCropResize(rgbaData, width, height);
  }

  const a = numA / den;
  const b = numB / den;

  // Translation parameters
  const tx = dstMeanX - (a * srcMeanX - b * srcMeanY);
  const ty = dstMeanY - (b * srcMeanX + a * srcMeanY);

  // Inverse transform parameters for target-to-source mapping
  const d = a * a + b * b;
  if (d < 1e-5) {
    return await centerCropResize(rgbaData, width, height);
  }

  const aInv = a / d;
  const bInv = b / d;

  const destSize = 112;
  const warpedRGB = new Uint8Array(destSize * destSize * 3);

  // 5. Bilinear warp target grid back to source
  for (let v = 0; v < destSize; v++) {
    for (let u = 0; u < destSize; u++) {
      const srcX = aInv * (u - tx) + bInv * (v - ty);
      const srcY = -bInv * (u - tx) + aInv * (v - ty);

      const x1 = Math.max(0, Math.min(width - 1, Math.floor(srcX)));
      const y1 = Math.max(0, Math.min(height - 1, Math.floor(srcY)));
      const x2 = Math.max(0, Math.min(width - 1, x1 + 1));
      const y2 = Math.max(0, Math.min(height - 1, y1 + 1));

      const dx = Math.max(0, Math.min(1, srcX - Math.floor(srcX)));
      const dy = Math.max(0, Math.min(1, srcY - Math.floor(srcY)));

      const outOffset = (v * destSize + u) * 3;

      for (let c = 0; c < 3; c++) {
        const valTL = rgbaData[(y1 * width + x1) * 4 + c];
        const valTR = rgbaData[(y1 * width + x2) * 4 + c];
        const valBL = rgbaData[(y2 * width + x1) * 4 + c];
        const valBR = rgbaData[(y2 * width + x2) * 4 + c];

        const top = (1 - dx) * valTL + dx * valTR;
        const bottom = (1 - dx) * valBL + dx * valBR;
        const pixelVal = (1 - dy) * top + dy * bottom;

        warpedRGB[outOffset + c] = Math.max(0, Math.min(255, Math.round(pixelVal)));
      }
    }

    if (v > 0 && v % 16 === 0) {
      await yieldToThread();
    }
  }

  return warpedRGB;
}

/**
 * Crops a centered square of source image and resizes it to 112x112x3.
 */
export async function centerCropResize(
  rgbaData: Uint8Array,
  width: number,
  height: number
): Promise<Uint8Array> {
  const destSize = 112;
  const output = new Uint8Array(destSize * destSize * 3);

  if (width <= 0 || height <= 0 || rgbaData.length === 0) {
    return output;
  }

  const minDim = Math.min(width, height);
  const startX = Math.max(0, Math.floor((width - minDim) / 2));
  const startY = Math.max(0, Math.floor((height - minDim) / 2));

  for (let row = 0; row < destSize; row++) {
    for (let col = 0; col < destSize; col++) {
      // Map destination pixel to source coordinate inside the centered crop
      const srcX = startX + ((col + 0.5) * minDim) / destSize - 0.5;
      const srcY = startY + ((row + 0.5) * minDim) / destSize - 0.5;

      const x1 = Math.max(0, Math.min(width - 1, Math.floor(srcX)));
      const y1 = Math.max(0, Math.min(height - 1, Math.floor(srcY)));
      const x2 = Math.max(0, Math.min(width - 1, x1 + 1));
      const y2 = Math.max(0, Math.min(height - 1, y1 + 1));

      const dx = Math.max(0, Math.min(1, srcX - Math.floor(srcX)));
      const dy = Math.max(0, Math.min(1, srcY - Math.floor(srcY)));

      const outOffset = (row * destSize + col) * 3;

      for (let c = 0; c < 3; c++) {
        const valTL = rgbaData[(y1 * width + x1) * 4 + c];
        const valTR = rgbaData[(y1 * width + x2) * 4 + c];
        const valBL = rgbaData[(y2 * width + x1) * 4 + c];
        const valBR = rgbaData[(y2 * width + x2) * 4 + c];

        const top = (1 - dx) * valTL + dx * valTR;
        const bottom = (1 - dx) * valBL + dx * valBR;
        const pixelVal = (1 - dy) * top + dy * bottom;

        output[outOffset + c] = Math.max(0, Math.min(255, Math.round(pixelVal)));
      }
    }

    if (row > 0 && row % 16 === 0) {
      await yieldToThread();
    }
  }

  return output;
}
