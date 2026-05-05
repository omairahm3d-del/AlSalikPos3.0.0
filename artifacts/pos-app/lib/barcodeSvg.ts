const CODE128_PATTERNS: Record<string, number[]> = {
  " ": [2,1,2,2,2,2], "!": [2,2,2,1,2,2], '"': [2,2,2,2,2,1],
  "#": [1,2,1,2,2,3], "$": [1,2,1,3,2,2], "%": [1,3,1,2,2,2],
  "&": [1,2,2,2,1,3], "'": [1,2,2,3,1,2], "(": [1,3,2,2,1,2],
  ")": [2,2,1,2,1,3], "*": [2,2,1,3,1,2], "+": [2,3,1,2,1,2],
  ",": [1,1,2,2,3,2], "-": [1,2,2,1,3,2], ".": [1,2,2,2,3,1],
  "/": [1,1,3,2,2,2], "0": [1,2,3,1,2,2], "1": [1,2,3,2,2,1],
  "2": [2,2,3,2,1,1], "3": [2,2,1,1,3,2], "4": [2,2,1,2,3,1],
  "5": [2,1,3,2,1,2], "6": [2,2,3,1,1,2], "7": [3,1,2,1,3,1],
  "8": [3,1,1,2,2,2], "9": [3,2,1,1,2,2], ":": [3,2,1,2,2,1],
  ";": [3,1,2,2,1,2], "<": [3,2,2,1,1,2], "=": [3,2,2,2,1,1],
  ">": [2,1,2,1,2,3], "?": [2,1,2,3,2,1], "@": [2,3,2,1,2,1],
  "A": [1,1,1,3,2,3], "B": [1,3,1,1,2,3], "C": [1,3,1,3,2,1],
  "D": [1,1,2,3,2,3], "E": [1,3,2,1,2,3], "F": [1,3,2,3,2,1],
  "G": [2,1,1,3,2,3], "H": [2,3,1,1,2,3], "I": [2,3,1,3,2,1],
  "J": [1,1,2,3,3,2], "K": [1,3,2,1,3,2], "L": [1,3,2,3,3,0],
  "M": [2,1,1,3,3,2], "N": [2,3,1,1,3,2], "O": [2,3,1,3,3,0],
  "P": [1,1,3,1,2,3], "Q": [1,1,3,3,2,1], "R": [1,3,3,1,2,1],
  "S": [1,1,3,2,3,2], "T": [1,1,3,2,3,2], "U": [1,3,3,2,3,0],
  "V": [3,1,3,1,2,1], "W": [3,1,1,3,2,1], "X": [3,3,1,1,2,1],
  "Y": [3,1,2,1,3,2], "Z": [3,1,2,3,3,0], "[": [3,3,2,1,3,0],
};

const CODE128B_START = [2,1,1,4,1,2];
const CODE128_STOP = [2,3,3,1,1,1,2];

function charToCode128BValue(ch: string): number {
  return ch.charCodeAt(0) - 32;
}

function getPatternForValue(val: number): number[] {
  const chars = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[";
  if (val >= 0 && val < chars.length && CODE128_PATTERNS[chars[val]]) {
    return CODE128_PATTERNS[chars[val]];
  }
  return [2,1,2,2,2,2];
}

export function generateBarcodeSVG(text: string, opts?: { width?: number; height?: number }): string {
  const w = opts?.width ?? 200;
  const h = opts?.height ?? 40;

  const values: number[] = [];
  for (const ch of text) {
    values.push(charToCode128BValue(ch));
  }

  let checksum = 104;
  values.forEach((v, i) => { checksum += v * (i + 1); });
  checksum = checksum % 103;

  const allPatterns: number[][] = [CODE128B_START];
  values.forEach((v) => allPatterns.push(getPatternForValue(v)));
  allPatterns.push(getPatternForValue(checksum));
  allPatterns.push(CODE128_STOP);

  let totalUnits = 0;
  allPatterns.forEach((p) => p.forEach((u) => totalUnits += u));
  totalUnits += 2;

  const unitW = w / totalUnits;
  let rects = "";
  let x = unitW;

  for (const pattern of allPatterns) {
    for (let i = 0; i < pattern.length; i++) {
      const barW = pattern[i] * unitW;
      if (i % 2 === 0) {
        rects += `<rect x="${x.toFixed(2)}" y="0" width="${barW.toFixed(2)}" height="${h}" fill="#000"/>`;
      }
      x += barW;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h + 14}" width="${w}" height="${h + 14}">
    <rect x="0" y="0" width="${w}" height="${h + 14}" fill="#fff"/>
    ${rects}
    <text x="${w / 2}" y="${h + 12}" text-anchor="middle" font-family="monospace" font-size="10" fill="#000">${text}</text>
  </svg>`;
}

import QRCode from "qrcode";

export function generateQRSVG(text: string, size?: number): string {
  const s = size ?? 100;
  if (!text) return "";
  try {
    const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
    const moduleCount = qr.modules.size;
    const data = qr.modules.data;
    const cellSize = s / moduleCount;
    let rects = "";
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (data[row * moduleCount + col]) {
          rects += `<rect x="${(col * cellSize).toFixed(2)}" y="${(row * cellSize).toFixed(2)}" width="${cellSize.toFixed(2)}" height="${cellSize.toFixed(2)}" fill="#000"/>`;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">
      <rect x="0" y="0" width="${s}" height="${s}" fill="#fff"/>
      ${rects}
    </svg>`;
  } catch {
    return "";
  }
}

export function generateWhatsAppQRSVG(phone: string, size?: number): string {
  const cleaned = (phone || "").replace(/[^0-9]/g, "");
  if (!cleaned) return "";
  const url = `https://wa.me/${cleaned}`;
  return generateQRSVG(url, size);
}

