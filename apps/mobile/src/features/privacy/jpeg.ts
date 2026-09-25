import { decode, encode } from "base64-arraybuffer";

/** Remove JPEG APP metadata (EXIF/GPS/XMP/ICC/thumbnails) and comments.
 * Keep only Adobe's color-transform marker; preserve scan data byte-for-byte.
 * Called after orientation has been rendered into newly encoded pixels.
 */
export function stripJpegMetadata(base64: string): string {
  const bytes = new Uint8Array(decode(base64));
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw Error("Use a JPEG photo.");
  const chunks: Uint8Array[] = [bytes.slice(0, 2)];
  let offset = 2;
  while (offset < bytes.length) {
    const start = offset;
    if (bytes[offset++] !== 0xff) throw Error("Invalid JPEG marker.");
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) {
      chunks.push(new Uint8Array([0xff, 0xd9]));
      const result = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let at = 0;
      for (const c of chunks) {
        result.set(c, at);
        at += c.length;
      }
      return encode(result.buffer);
    }
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length)
      throw Error("Invalid JPEG segment.");
    const end = offset + length;
    const metadata =
      (marker >= 0xe0 && marker <= 0xef && marker !== 0xee) || marker === 0xfe;
    if (!metadata) chunks.push(bytes.slice(start, end));
    offset = end;
    if (marker === 0xda) {
      const scan = offset;
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) {
          offset++;
          continue;
        }
        const next = bytes[offset + 1];
        if (next === 0 || (next >= 0xd0 && next <= 0xd7)) {
          offset += 2;
          continue;
        }
        break;
      }
      chunks.push(bytes.slice(scan, offset));
    }
  }
  throw Error("Incomplete JPEG photo.");
}
