"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyCLAHE = applyCLAHE;
exports.globalHistogramEqualization = globalHistogramEqualization;
exports.normalizePixels = normalizePixels;
exports.cropTo112x112 = cropTo112x112;
/**
 * Contrast Limited Adaptive Histogram Equalization (CLAHE).
 * Enhances local contrast in 8x8 tiles using bilinear interpolation.
 */
function applyCLAHE(imageData, width, height, clipLimit = 2.0, tilesX = 8, tilesY = 8) {
    const size = width * height;
    if (size === 0 || imageData.length !== size) {
        return new Uint8Array(imageData);
    }
    const output = new Uint8Array(size);
    const tileW = Math.floor(width / tilesX);
    const tileH = Math.floor(height / tilesY);
    if (tileW === 0 || tileH === 0) {
        return new Uint8Array(imageData);
    }
    const numPixels = tileW * tileH;
    const limit = Math.max(1, Math.round((clipLimit * numPixels) / 256));
    // Compute CDFs for all tiles
    const cdfs = new Float32Array(tilesX * tilesY * 256);
    for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
            // Calculate local histogram
            const hist = new Int32Array(256);
            const startX = tx * tileW;
            const startY = ty * tileH;
            for (let y = 0; y < tileH; y++) {
                const rowOffset = (startY + y) * width;
                for (let x = 0; x < tileW; x++) {
                    const val = imageData[rowOffset + startX + x];
                    hist[val]++;
                }
            }
            // Clip histogram and count excess
            let excess = 0;
            for (let i = 0; i < 256; i++) {
                if (hist[i] > limit) {
                    excess += hist[i] - limit;
                    hist[i] = limit;
                }
            }
            // Redistribute excess evenly
            const binInc = Math.floor(excess / 256);
            const remainder = excess % 256;
            for (let i = 0; i < 256; i++) {
                hist[i] += binInc;
            }
            // Redistribute the remainder step-wise
            let remaining = remainder;
            if (remaining > 0) {
                const step = Math.max(1, Math.floor(256 / remaining));
                for (let i = 0; i < 256 && remaining > 0; i += step) {
                    hist[i]++;
                    remaining--;
                }
            }
            // Calculate CDF for this tile
            const cdfOffset = (ty * tilesX + tx) * 256;
            let sum = 0;
            for (let i = 0; i < 256; i++) {
                sum += hist[i];
                cdfs[cdfOffset + i] = (sum / numPixels) * 255;
            }
        }
    }
    // Interpolate for each pixel
    for (let y = 0; y < height; y++) {
        const rowOffset = y * width;
        for (let x = 0; x < width; x++) {
            const val = imageData[rowOffset + x];
            const tx = (x - tileW / 2) / tileW;
            const ty = (y - tileH / 2) / tileH;
            const tx1 = Math.max(0, Math.min(tilesX - 1, Math.floor(tx)));
            const tx2 = Math.min(tilesX - 1, tx1 + 1);
            const ty1 = Math.max(0, Math.min(tilesY - 1, Math.floor(ty)));
            const ty2 = Math.min(tilesY - 1, ty1 + 1);
            const dx = tx - tx1;
            const dy = ty - ty1;
            const cdfTL = cdfs[(ty1 * tilesX + tx1) * 256 + val];
            const cdfTR = cdfs[(ty1 * tilesX + tx2) * 256 + val];
            const cdfBL = cdfs[(ty2 * tilesX + tx1) * 256 + val];
            const cdfBR = cdfs[(ty2 * tilesX + tx2) * 256 + val];
            let interpolatedVal;
            const isLeft = x <= tileW / 2;
            const isRight = x >= width - tileW / 2;
            const isTop = y <= tileH / 2;
            const isBottom = y >= height - tileH / 2;
            if (isLeft && isTop) {
                interpolatedVal = cdfTL;
            }
            else if (isRight && isTop) {
                interpolatedVal = cdfTR;
            }
            else if (isLeft && isBottom) {
                interpolatedVal = cdfBL;
            }
            else if (isRight && isBottom) {
                interpolatedVal = cdfBR;
            }
            else if (isTop) {
                interpolatedVal = (1 - dx) * cdfTL + dx * cdfTR;
            }
            else if (isBottom) {
                interpolatedVal = (1 - dx) * cdfBL + dx * cdfBR;
            }
            else if (isLeft) {
                interpolatedVal = (1 - dy) * cdfTL + dy * cdfBL;
            }
            else if (isRight) {
                interpolatedVal = (1 - dy) * cdfTR + dy * cdfBR;
            }
            else {
                const top = (1 - dx) * cdfTL + dx * cdfTR;
                const bottom = (1 - dx) * cdfBL + dx * cdfBR;
                interpolatedVal = (1 - dy) * top + dy * bottom;
            }
            output[rowOffset + x] = Math.max(0, Math.min(255, Math.round(interpolatedVal)));
        }
    }
    return output;
}
/**
 * Performs Global Histogram Equalization on grayscale image data.
 */
function globalHistogramEqualization(imageData) {
    const n = imageData.length;
    if (n === 0)
        return new Uint8Array(0);
    const hist = new Int32Array(256);
    for (let i = 0; i < n; i++) {
        hist[imageData[i]]++;
    }
    const cdf = new Int32Array(256);
    cdf[0] = hist[0];
    for (let i = 1; i < 256; i++) {
        cdf[i] = cdf[i - 1] + hist[i];
    }
    let cdfMin = 0;
    for (let i = 0; i < 256; i++) {
        if (cdf[i] > 0) {
            cdfMin = cdf[i];
            break;
        }
    }
    const denom = n - cdfMin;
    const equalized = new Uint8Array(n);
    if (denom === 0) {
        equalized.set(imageData);
        return equalized;
    }
    for (let i = 0; i < n; i++) {
        const v = imageData[i];
        equalized[i] = Math.max(0, Math.min(255, Math.round(((cdf[v] - cdfMin) / denom) * 255)));
    }
    return equalized;
}
/**
 * Normalizes pixel values from [0, 255] to [-1.0, 1.0] range using formula: (pixel / 127.5) - 1.0
 */
function normalizePixels(imageData) {
    const n = imageData.length;
    const normalized = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        normalized[i] = imageData[i] / 127.5 - 1.0;
    }
    return normalized;
}
/**
 * Crops a bounding box and resizes it to 112x112 using bilinear interpolation,
 * returning a normalized Float32Array inside [-1.0, 1.0].
 */
function cropTo112x112(imageData, faceBoundingBox, originalWidth, originalHeight) {
    const destSize = 112;
    const output = new Float32Array(destSize * destSize);
    if (originalWidth <= 0 || originalHeight <= 0 || imageData.length === 0) {
        return output;
    }
    const { x: boxX, y: boxY, w: boxW, h: boxH } = faceBoundingBox;
    const w = boxW <= 0 ? 1 : boxW;
    const h = boxH <= 0 ? 1 : boxH;
    for (let row = 0; row < destSize; row++) {
        for (let col = 0; col < destSize; col++) {
            // Map destination pixel to source coordinate inside faceBoundingBox (using center alignment)
            const srcX = boxX + ((col + 0.5) * w) / destSize - 0.5;
            const srcY = boxY + ((row + 0.5) * h) / destSize - 0.5;
            const x1 = Math.max(0, Math.min(originalWidth - 1, Math.floor(srcX)));
            const y1 = Math.max(0, Math.min(originalHeight - 1, Math.floor(srcY)));
            const x2 = Math.max(0, Math.min(originalWidth - 1, x1 + 1));
            const y2 = Math.max(0, Math.min(originalHeight - 1, y1 + 1));
            const dx = srcX - x1;
            const dy = srcY - y1;
            const valTL = imageData[y1 * originalWidth + x1];
            const valTR = imageData[y1 * originalWidth + x2];
            const valBL = imageData[y2 * originalWidth + x1];
            const valBR = imageData[y2 * originalWidth + x2];
            const top = (1 - dx) * valTL + dx * valTR;
            const bottom = (1 - dx) * valBL + dx * valBR;
            const pixelVal = (1 - dy) * top + dy * bottom;
            output[row * destSize + col] = pixelVal / 127.5 - 1.0;
        }
    }
    return output;
}
