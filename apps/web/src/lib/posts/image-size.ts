/**
 * Read pixel dimensions from the header bytes of PNG / JPEG / GIF / WebP files.
 * Pure function, no dependencies. Returns null when the format isn't recognised.
 */
export function readImageSize(buf: Uint8Array): { width: number; height: number } | null {
  const u16be = (o: number) => (buf[o]! << 8) | buf[o + 1]!;
  const u16le = (o: number) => buf[o]! | (buf[o + 1]! << 8);
  const u24le = (o: number) => buf[o]! | (buf[o + 1]! << 8) | (buf[o + 2]! << 16);
  const u32be = (o: number) => ((buf[o]! << 24) >>> 0) + ((buf[o + 1]! << 16) | (buf[o + 2]! << 8) | buf[o + 3]!);
  const ascii = (o: number, n: number) => String.fromCharCode(...buf.subarray(o, o + n));

  if (buf.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A, then IHDR chunk with width/height (BE u32) at 16/20.
  if (buf[0] === 0x89 && ascii(1, 3) === "PNG") {
    if (buf.length < 24) return null;
    return { width: u32be(16), height: u32be(20) };
  }

  // GIF: "GIF87a"/"GIF89a", logical screen width/height (LE u16) at 6/8.
  if (ascii(0, 3) === "GIF") return { width: u16le(6), height: u16le(8) };

  // WebP: "RIFF" .... "WEBP" + VP8 / VP8L / VP8X chunk.
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP" && buf.length >= 30) {
    const chunk = ascii(12, 4);
    if (chunk === "VP8 ") {
      // Frame header at 20; start code 9D 01 2A at 23; dims at 26/28 (14 bits).
      return { width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
    }
    if (chunk === "VP8L") {
      // Signature 0x2F at 20, then 14-bit width-1 and height-1 packed LE.
      const b0 = buf[21]!, b1 = buf[22]!, b2 = buf[23]!, b3 = buf[24]!;
      const width = 1 + (((b1 & 0x3f) << 8) | b0);
      const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return { width, height };
    }
    if (chunk === "VP8X") {
      return { width: 1 + u24le(24), height: 1 + u24le(27) };
    }
    return null;
  }

  // JPEG: walk segments until a SOFn marker.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) {
        o++;
        continue;
      }
      const marker = buf[o + 1]!;
      if (marker === 0xff) {
        o++;
        continue;
      }
      // Standalone markers without length.
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        o += 2;
        continue;
      }
      const len = u16be(o + 2);
      const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSOF) return { height: u16be(o + 5), width: u16be(o + 7) };
      if (marker === 0xd9 || marker === 0xda) break;
      o += 2 + len;
    }
    return null;
  }
  return null;
}
