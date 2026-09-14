import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPNG(width, height, drawPixel) {
  // width and height: numbers
  // drawPixel: (x, y) => [r, g, b, a] (values 0-255)
  const bytesPerPixel = 4;
  const rawData = Buffer.alloc(height * (1 + width * bytesPerPixel));

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawPixel(x, y, width, height);
      rawData[offset++] = r;
      rawData[offset++] = g;
      rawData[offset++] = b;
      rawData[offset++] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth 8
  ihdrData.writeUInt8(6, 9); // color type 6 (RGBA)
  ihdrData.writeUInt8(0, 10); // compression method 0
  ihdrData.writeUInt8(0, 11); // filter method 0
  ihdrData.writeUInt8(0, 12); // interlace method 0

  const ihdrChunk = createChunk('IHDR', ihdrData);
  const idatChunk = createChunk('IDAT', deflated);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = data.length;
  const chunk = Buffer.alloc(8 + length + 4);
  chunk.writeUInt32BE(length, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crcTable = getCRCTable();
  let crc = 0xffffffff;
  for (let i = 4; i < 8 + length; i++) {
    crc = crcTable[(crc ^ chunk[i]) & 0xff] ^ (crc >>> 8);
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  chunk.writeUInt32BE(crc, 8 + length);
  return chunk;
}

let crcTableCache = null;
function getCRCTable() {
  if (crcTableCache) return crcTableCache;
  crcTableCache = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    crcTableCache[n] = c;
  }
  return crcTableCache;
}

// Icon drawing function
function renderCalculatorIcon(x, y, w, h, isMaskable = false) {
  // Normalize coordinates to -1 to +1
  const nx = (x / w) * 2 - 1;
  const ny = (y / h) * 2 - 1;
  const dist = Math.sqrt(nx * nx + ny * ny);

  // Background
  let bgR = 26, bgG = 86, bgB = 219; // #1a56db deep royal blue
  let bgR2 = 14, bgG2 = 165, bgB2 = 233; // #0ea5e9 sky blue

  // Diagonal gradient for background
  const grad = (nx + ny + 2) / 4;
  const r = Math.round(bgR * (1 - grad) + bgR2 * grad);
  const g = Math.round(bgG * (1 - grad) + bgG2 * grad);
  const b = Math.round(bgB * (1 - grad) + bgB2 * grad);

  if (isMaskable) {
    // Full bleed background for Android maskable icon
    // Inner elements scaled within safe zone 0.75
    return drawForeground(nx / 0.75, ny / 0.75, r, g, b, 255);
  } else {
    // Rounded squircle badge with subtle dark border
    // r^4 + y^4 for superellipse
    const superDist = Math.pow(Math.abs(nx), 4) + Math.pow(Math.abs(ny), 4);
    if (superDist > 0.92) {
      return [0, 0, 0, 0]; // Transparent outside squircle
    } else if (superDist > 0.88) {
      // Border anti-aliasing
      const alpha = Math.max(0, Math.min(255, Math.round((0.92 - superDist) / 0.04 * 255)));
      return [r, g, b, alpha];
    }
    return drawForeground(nx, ny, r, g, b, 255);
  }
}

function drawForeground(nx, ny, bgR, bgG, bgB, bgA) {
  // Draw stylized Calculator + Plus + Scan lines
  // Calculator card frame: center at (0, 0.05), width ~1.0, height ~1.2
  const cardX = Math.abs(nx);
  const cardY = ny - 0.05;

  // Header display area: ny between -0.45 and -0.22, |nx| <= 0.45
  if (Math.abs(nx) <= 0.46 && cardY >= -0.55 && cardY <= -0.28) {
    // Digital screen background (dark navy)
    return [15, 23, 42, 255]; // #0f172a
  }

  // Inside screen digits / numbers representation
  if (Math.abs(nx) <= 0.38 && cardY >= -0.45 && cardY <= -0.36) {
    // Glowing emerald green or amber readout digits
    if (nx > 0.1 && nx < 0.36) {
      return [52, 211, 153, 255]; // emerald-400
    }
  }

  // Camera scan bracket corners:
  // Top-left: nx in [-0.75, -0.6], ny in [-0.75, -0.6]
  const isCornerTL = (nx >= -0.72 && nx <= -0.52 && ny >= -0.72 && ny <= -0.66) ||
                     (nx >= -0.72 && nx <= -0.66 && ny >= -0.72 && ny <= -0.52);
  const isCornerTR = (nx >= 0.52 && nx <= 0.72 && ny >= -0.72 && ny <= -0.66) ||
                     (nx >= 0.66 && nx <= 0.72 && ny >= -0.72 && ny <= -0.52);
  const isCornerBL = (nx >= -0.72 && nx <= -0.52 && ny >= 0.66 && ny <= 0.72) ||
                     (nx >= -0.72 && nx <= -0.66 && ny >= 0.52 && ny <= 0.72);
  const isCornerBR = (nx >= 0.52 && nx <= 0.72 && ny >= 0.66 && ny <= 0.72) ||
                     (nx >= 0.66 && nx <= 0.72 && ny >= 0.52 && ny <= 0.72);

  if (isCornerTL || isCornerTR || isCornerBL || isCornerBR) {
    return [251, 191, 36, 255]; // Amber-400 scan brackets
  }

  // Calculator keys grid: 3 rows, 3 cols
  // rows at cardY in [-0.15, 0.0], [0.1, 0.25], [0.35, 0.5]
  // cols at nx in [-0.45, -0.2], [-0.12, 0.12], [0.2, 0.45]
  const inCol1 = nx >= -0.42 && nx <= -0.18;
  const inCol2 = nx >= -0.12 && nx <= 0.12;
  const inCol3 = nx >= 0.18 && nx <= 0.42;

  const inRow1 = cardY >= -0.18 && cardY <= -0.02;
  const inRow2 = cardY >= 0.06 && cardY <= 0.22;
  const inRow3 = cardY >= 0.30 && cardY <= 0.46;

  if ((inCol1 || inCol2 || inCol3) && (inRow1 || inRow2 || inRow3)) {
    // Bottom right key is large accent PLUS / EQUALS key
    if (inCol3 && inRow3) {
      // Big Amber Plus button
      // Draw plus sign inside button
      const cx = 0.30, cy = 0.38;
      const isPlusH = Math.abs(cardY - cy) <= 0.025 && Math.abs(nx - cx) <= 0.08;
      const isPlusV = Math.abs(nx - cx) <= 0.025 && Math.abs(cardY - cy) <= 0.08;
      if (isPlusH || isPlusV) {
        return [255, 255, 255, 255];
      }
      return [245, 158, 11, 255]; // amber-500
    }
    // Standard white key
    return [255, 255, 255, 230];
  }

  return [bgR, bgG, bgB, bgA];
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

console.log('Generating PWA icons...');

// 1. 192x192 PNG
const png192 = createPNG(192, 192, (x, y, w, h) => renderCalculatorIcon(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), png192);
console.log('Saved public/pwa-192x192.png');

// 2. 512x512 PNG
const png512 = createPNG(512, 512, (x, y, w, h) => renderCalculatorIcon(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), png512);
console.log('Saved public/pwa-512x512.png');

// 3. 512x512 Maskable PNG
const pngMaskable = createPNG(512, 512, (x, y, w, h) => renderCalculatorIcon(x, y, w, h, true));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), pngMaskable);
console.log('Saved public/pwa-maskable-512x512.png');

// 4. apple-touch-icon 180x180 PNG
const appleIcon = createPNG(180, 180, (x, y, w, h) => renderCalculatorIcon(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), appleIcon);
console.log('Saved public/apple-touch-icon.png');

// 5. favicon SVG
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <rect width="512" height="512" rx="128" fill="url(#bgGrad)"/>
  <!-- Scan Brackets -->
  <path d="M72 160V100C72 84.536 84.536 72 100 72H160" stroke="#FBBF24" stroke-width="28" stroke-linecap="round"/>
  <path d="M440 160V100C440 84.536 427.464 72 412 72H352" stroke="#FBBF24" stroke-width="28" stroke-linecap="round"/>
  <path d="M72 352V412C72 427.464 84.536 440 100 440H160" stroke="#FBBF24" stroke-width="28" stroke-linecap="round"/>
  <path d="M440 352V412C440 427.464 427.464 440 412 440H352" stroke="#FBBF24" stroke-width="28" stroke-linecap="round"/>
  <!-- Calculator Body -->
  <rect x="130" y="110" width="252" height="292" rx="28" fill="#FFFFFF" fill-opacity="0.95" filter="drop-shadow(0 12px 24px rgba(0,0,0,0.2))"/>
  <!-- Display Screen -->
  <rect x="156" y="136" width="200" height="64" rx="14" fill="#0F172A"/>
  <text x="340" y="180" font-family="monospace" font-size="32" font-weight="bold" fill="#34D399" text-anchor="end">+1,248.50</text>
  <!-- Calculator Buttons -->
  <rect x="156" y="222" width="56" height="42" rx="10" fill="#E2E8F0"/>
  <rect x="228" y="222" width="56" height="42" rx="10" fill="#E2E8F0"/>
  <rect x="300" y="222" width="56" height="42" rx="10" fill="#3B82F6"/>
  <text x="328" y="252" font-family="sans-serif" font-size="24" font-weight="bold" fill="#FFFFFF" text-anchor="middle">+</text>

  <rect x="156" y="280" width="56" height="42" rx="10" fill="#E2E8F0"/>
  <rect x="228" y="280" width="56" height="42" rx="10" fill="#E2E8F0"/>
  <rect x="300" y="280" width="56" height="42" rx="10" fill="#E2E8F0"/>

  <rect x="156" y="338" width="56" height="42" rx="10" fill="#E2E8F0"/>
  <rect x="228" y="338" width="56" height="42" rx="10" fill="#E2E8F0"/>
  <rect x="300" y="338" width="56" height="42" rx="10" fill="#F59E0B"/>
  <text x="328" y="368" font-family="sans-serif" font-size="26" font-weight="bold" fill="#FFFFFF" text-anchor="middle">=</text>

  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop stop-color="#1E40AF"/>
      <stop offset="1" stop-color="#0284C7"/>
    </linearGradient>
  </defs>
</svg>`;
fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent);
console.log('Saved public/icon.svg');
