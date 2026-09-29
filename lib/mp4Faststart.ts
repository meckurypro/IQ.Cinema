// lib/mp4Faststart.ts
//
// An MP4 can only start playing (and seek) once the browser has read its
// `moov` index. If that index sits AFTER the `mdat` media data ("not
// faststart"), every cold start and every seek has to make an extra range
// request to the end of the file first — the classic cause of slow starts and
// endless loading after scrubbing. This walks the file's top-level boxes
// (a handful of tiny reads, never the whole file) to tell which layout it has.
//
// true  -> moov comes first, streams well
// false -> mdat comes first, should be remuxed with `-movflags +faststart`
// null  -> couldn't tell (unreadable / unusual file); don't nag

export async function hasFastStart(file: File): Promise<boolean | null> {
  try {
    let offset = 0;
    for (let i = 0; i < 64 && offset < file.size; i++) {
      const head = new DataView(await file.slice(offset, offset + 16).arrayBuffer());
      if (head.byteLength < 8) return null;
      let size = head.getUint32(0);
      const type = String.fromCharCode(
        head.getUint8(4),
        head.getUint8(5),
        head.getUint8(6),
        head.getUint8(7)
      );
      if (type === "moov") return true;
      if (type === "mdat") return false;
      if (size === 1) {
        if (head.byteLength < 16) return null;
        size = Number(head.getBigUint64(8));
      } else if (size === 0) {
        return null; // box runs to end of file without a moov before it
      }
      if (size < 8) return null;
      offset += size;
    }
    return null;
  } catch {
    return null;
  }
}
