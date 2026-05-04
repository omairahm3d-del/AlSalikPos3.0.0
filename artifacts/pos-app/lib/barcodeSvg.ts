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

export function generateWhatsAppQRSVG(phone: string, size?: number): string {
  const s = size ?? 100;
  const url = `https://wa.me/${phone.replace(/[^0-9]/g, "")}`;
  const modules = encodeQR(url);
  const moduleCount = modules.length;
  if (moduleCount === 0) return "";

  const cellSize = s / moduleCount;
  let rects = "";

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (modules[row][col]) {
        rects += `<rect x="${(col * cellSize).toFixed(2)}" y="${(row * cellSize).toFixed(2)}" width="${cellSize.toFixed(2)}" height="${cellSize.toFixed(2)}" fill="#000"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">
    <rect x="0" y="0" width="${s}" height="${s}" fill="#fff"/>
    ${rects}
  </svg>`;
}

function encodeQR(data: string): boolean[][] {
  const version = getMinVersion(data);
  const size = version * 4 + 17;
  const grid: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const reserved: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  addFinderPatterns(grid, reserved, size);
  addAlignmentPatterns(grid, reserved, version, size);
  addTimingPatterns(grid, reserved, size);

  reserved[8][size - 8] = true;
  if (grid[8][size - 8] === null) grid[8][size - 8] = true;

  const bits = encodeDataBits(data, version);
  placeData(grid, reserved, bits, size);
  addFormatInfo(grid, size, 0);

  const result: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    result.push([]);
    for (let c = 0; c < size; c++) {
      result[r].push(grid[r][c] === true);
    }
  }
  return result;
}

function getMinVersion(data: string): number {
  for (let v = 1; v <= 40; v++) {
    const cap = getByteCapacity(v);
    if (data.length <= cap) return v;
  }
  return 40;
}

function getByteCapacity(version: number): number {
  const totalCodewords = getTotalCodewords(version);
  const ecCodewords = getECCodewords(version);
  return totalCodewords - ecCodewords - (version >= 10 ? 4 : 3);
}

function getTotalCodewords(version: number): number {
  const size = version * 4 + 17;
  let modules = size * size;

  modules -= 3 * 64;
  modules -= 2 * (size - 16);
  modules -= 25;

  if (version >= 2) {
    const positions = getAlignmentPositions(version);
    let count = positions.length * positions.length;
    count -= (version >= 7 ? 3 : 3);
    modules -= count * 25;
  }

  if (version >= 7) modules -= 36;

  return Math.floor(modules / 8);
}

function getECCodewords(version: number): number {
  const ecTable: Record<number, number> = {
    1: 7, 2: 10, 3: 15, 4: 20, 5: 26, 6: 18, 7: 20, 8: 24, 9: 30, 10: 18,
    11: 20, 12: 24, 13: 26, 14: 30, 15: 22, 16: 24, 17: 28, 18: 30, 19: 28, 20: 28,
    21: 28, 22: 28, 23: 30, 24: 30, 25: 26, 26: 28, 27: 30, 28: 30, 29: 30, 30: 30,
    31: 30, 32: 30, 33: 30, 34: 30, 35: 30, 36: 30, 37: 30, 38: 30, 39: 30, 40: 30,
  };
  return ecTable[version] ?? 30;
}

function getAlignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const size = version * 4 + 17;
  const last = size - 7;
  const first = 6;
  const count = Math.floor(version / 7) + 2;
  const step = count === 2 ? last - first : Math.ceil((last - first) / (count - 1));
  const positions: number[] = [first];
  for (let i = 1; i < count; i++) {
    positions.push(first + i * step > last ? last : first + i * step);
  }
  if (positions[positions.length - 1] !== last) positions[positions.length - 1] = last;
  return positions;
}

function addFinderPatterns(grid: (boolean | null)[][], reserved: boolean[][], size: number) {
  const draw = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = row + r, cc = col + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        reserved[rr][cc] = true;
        if (r === -1 || r === 7 || c === -1 || c === 7) {
          grid[rr][cc] = false;
        } else if (r === 0 || r === 6 || c === 0 || c === 6) {
          grid[rr][cc] = true;
        } else if (r >= 2 && r <= 4 && c >= 2 && c <= 4) {
          grid[rr][cc] = true;
        } else {
          grid[rr][cc] = false;
        }
      }
    }
  };
  draw(0, 0);
  draw(0, size - 7);
  draw(size - 7, 0);

  for (let i = 0; i < 8; i++) {
    reserved[7][i] = true; reserved[i][7] = true;
    reserved[7][size - 1 - i] = true; reserved[i][size - 8] = true;
    reserved[size - 8][i] = true; reserved[size - 1 - i][7] = true;
  }
}

function addAlignmentPatterns(grid: (boolean | null)[][], reserved: boolean[][], version: number, size: number) {
  const positions = getAlignmentPositions(version);
  for (const row of positions) {
    for (const col of positions) {
      if ((row < 9 && col < 9) || (row < 9 && col > size - 9) || (row > size - 9 && col < 9)) continue;
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const rr = row + r, cc = col + c;
          if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
          reserved[rr][cc] = true;
          if (Math.abs(r) === 2 || Math.abs(c) === 2) grid[rr][cc] = true;
          else if (r === 0 && c === 0) grid[rr][cc] = true;
          else grid[rr][cc] = false;
        }
      }
    }
  }
}

function addTimingPatterns(grid: (boolean | null)[][], reserved: boolean[][], size: number) {
  for (let i = 8; i < size - 8; i++) {
    if (!reserved[6][i]) { grid[6][i] = i % 2 === 0; reserved[6][i] = true; }
    if (!reserved[i][6]) { grid[i][6] = i % 2 === 0; reserved[i][6] = true; }
  }
}

function encodeDataBits(data: string, version: number): boolean[] {
  const bits: boolean[] = [];
  const push = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push(((val >> i) & 1) === 1);
  };

  push(0b0100, 4);
  const charCountBits = version >= 10 ? 16 : 8;
  push(data.length, charCountBits);
  for (const ch of data) push(ch.charCodeAt(0), 8);

  const totalBits = getTotalCodewords(version) * 8;
  while (bits.length < totalBits && bits.length - (bits.length % 8 || 8) < totalBits) {
    bits.push(false);
    if (bits.length >= totalBits) break;
  }
  while (bits.length % 8 !== 0 && bits.length < totalBits) bits.push(false);

  const padBytes = [0b11101100, 0b00010001];
  let pi = 0;
  while (bits.length < totalBits) {
    push(padBytes[pi % 2], 8);
    pi++;
  }
  if (bits.length > totalBits) bits.length = totalBits;

  return bits;
}

function placeData(grid: (boolean | null)[][], reserved: boolean[][], bits: boolean[], size: number) {
  let bitIdx = 0;
  let upward = true;

  for (let col = size - 1; col >= 0; col -= 2) {
    if (col === 6) col = 5;

    const rows = upward ? Array.from({ length: size }, (_, i) => size - 1 - i) : Array.from({ length: size }, (_, i) => i);

    for (const row of rows) {
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (cc < 0) continue;
        if (reserved[row][cc]) continue;
        grid[row][cc] = bitIdx < bits.length ? bits[bitIdx] : false;
        bitIdx++;
      }
    }
    upward = !upward;
  }
}

function addFormatInfo(grid: (boolean | null)[][], size: number, mask: number) {
  const ecl = 0b01;
  const data = (ecl << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >> 9) * 0b10100110111);
  }
  const format = ((data << 10) | rem) ^ 0b101010000010010;

  for (let i = 0; i < 15; i++) {
    const bit = ((format >> (14 - i)) & 1) === 1;

    if (i < 6) grid[8][i] = bit;
    else if (i === 6) grid[8][7] = bit;
    else if (i === 7) grid[8][8] = bit;
    else grid[8][size - 15 + i] = bit;

    if (i < 7) grid[size - 1 - i][8] = bit;
    else if (i === 7) grid[8 - (i - 7)][8] = bit;
    else grid[14 - i][8] = bit;
  }
}
