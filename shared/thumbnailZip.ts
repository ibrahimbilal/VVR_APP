const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n += 1) {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c >>> 0
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i += 1) crc = (CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)) >>> 0
  return (crc ^ 0xffffffff) >>> 0
}

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function bytes(length: number, write: (view: DataView) => void): Uint8Array {
  const buffer = new ArrayBuffer(length)
  write(new DataView(buffer))
  return new Uint8Array(buffer)
}

function zipEntryName(name: string): Uint8Array {
  const clean = name.replace(/[\\/]/g, '-').replace(/[^\x20-\x7e]/g, '').slice(0, 180)
  return new TextEncoder().encode(clean || 'file')
}

export interface ZipEntry {
  name: string
  data: Uint8Array
}

/** ZIP archive using the store method. Image bytes are already compressed. */
export function zipStored(files: ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = zipEntryName(file.name)
    const crc = crc32(file.data)
    const local = concat([
      bytes(30, (view) => {
        view.setUint32(0, 0x04034b50, true)
        view.setUint16(4, 20, true)
        view.setUint16(6, 0, true)
        view.setUint16(8, 0, true)
        view.setUint16(10, 0, true)
        view.setUint16(12, 0, true)
        view.setUint32(14, crc, true)
        view.setUint32(18, file.data.length, true)
        view.setUint32(22, file.data.length, true)
        view.setUint16(26, name.length, true)
        view.setUint16(28, 0, true)
      }),
      name,
      file.data,
    ])
    const central = concat([
      bytes(46, (view) => {
        view.setUint32(0, 0x02014b50, true)
        view.setUint16(4, 20, true)
        view.setUint16(6, 20, true)
        view.setUint16(8, 0, true)
        view.setUint16(10, 0, true)
        view.setUint16(12, 0, true)
        view.setUint16(14, 0, true)
        view.setUint32(16, crc, true)
        view.setUint32(20, file.data.length, true)
        view.setUint32(24, file.data.length, true)
        view.setUint16(28, name.length, true)
        view.setUint16(30, 0, true)
        view.setUint16(32, 0, true)
        view.setUint16(34, 0, true)
        view.setUint16(36, 0, true)
        view.setUint32(38, 0, true)
        view.setUint32(42, offset, true)
      }),
      name,
    ])
    locals.push(local)
    centrals.push(central)
    offset += local.length
  }
  const centralDir = concat(centrals)
  const end = bytes(22, (view) => {
    view.setUint32(0, 0x06054b50, true)
    view.setUint16(4, 0, true)
    view.setUint16(6, 0, true)
    view.setUint16(8, files.length, true)
    view.setUint16(10, files.length, true)
    view.setUint32(12, centralDir.length, true)
    view.setUint32(16, offset, true)
    view.setUint16(20, 0, true)
  })
  return concat([...locals, centralDir, end])
}
