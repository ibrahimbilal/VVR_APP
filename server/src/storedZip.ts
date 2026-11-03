import { createReadStream } from 'node:fs'
import { once } from 'node:events'
import { pipeline } from 'node:stream/promises'
import { Writable, type Writable as WritableStream } from 'node:stream'

const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n += 1) {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c >>> 0
}

export interface ZipEntry {
  name: string
  path: string
}

/** Stored (uncompressed) ZIP. PNG, JPEG, and WebP are already compressed. */
export async function pipeStoredZip(entries: ZipEntry[], output: WritableStream): Promise<void> {
  const centrals: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    if (name.length > 60000) throw new Error('A ZIP entry name is too long.')
    const { crc, size } = await crcFile(entry.path)
    const { time, date } = dosDateTime(new Date())
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(size, 18)
    local.writeUInt32LE(size, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    await writeChunk(output, local)
    await writeChunk(output, name)
    await pipeFile(entry.path, output)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(size, 20)
    central.writeUInt32LE(size, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)
    offset += 30 + name.length + size
  }
  const centralOffset = offset
  let centralSize = 0
  for (const part of centrals) {
    await writeChunk(output, part)
    centralSize += part.length
  }
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralSize, 12)
  eocd.writeUInt32LE(centralOffset, 16)
  eocd.writeUInt16LE(0, 20)
  await writeChunk(output, eocd)
}

export function zipEntryNames(buffer: Buffer): string[] {
  const marker = Buffer.from([0x50, 0x4b, 0x05, 0x06])
  const eocd = buffer.lastIndexOf(marker)
  if (eocd < 0) throw new Error('ZIP directory is missing.')
  const count = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  const names: string[] = []
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('ZIP directory is damaged.')
    const nameLen = buffer.readUInt16LE(offset + 28)
    const extraLen = buffer.readUInt16LE(offset + 30)
    const commentLen = buffer.readUInt16LE(offset + 32)
    names.push(buffer.subarray(offset + 46, offset + 46 + nameLen).toString('utf8'))
    offset += 46 + nameLen + extraLen + commentLen
  }
  return names
}

async function crcFile(filePath: string): Promise<{ crc: number; size: number }> {
  let crc = 0xffffffff
  let size = 0
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath)
    stream.on('data', (chunk: Buffer | string) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      size += buf.length
      for (let i = 0; i < buf.length; i += 1) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
    })
    stream.on('end', () => resolve())
    stream.on('error', reject)
  })
  return { crc: (~crc) >>> 0, size }
}

function dosDateTime(date: Date): { time: number; date: number } {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const year = Math.max(1980, date.getFullYear())
  const day = (year - 1980) << 9 | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, date: day }
}

async function writeChunk(output: WritableStream, chunk: Buffer): Promise<void> {
  if (!output.write(chunk)) await once(output, 'drain')
}

async function pipeFile(filePath: string, output: WritableStream): Promise<void> {
  const writer = new Writable({
    write(chunk, _encoding, callback) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      if (output.write(buf)) callback()
      else output.once('drain', () => callback())
    },
  })
  await pipeline(createReadStream(filePath), writer)
}
