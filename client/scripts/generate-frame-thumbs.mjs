/**
 * Regenerate 150px-wide PNG previews for bundled Frame Screensaver frames.
 * Run from repo root: npm run frames:thumbs -w client
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const THUMB_WIDTH = 150
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'frames')
const thumbsDir = join(root, 'thumbs')

if (!existsSync(thumbsDir)) mkdirSync(thumbsDir, { recursive: true })

const sources = readdirSync(root).filter((name) => /^frame-\d+\.png$/i.test(name))
if (sources.length === 0) {
  console.error('No frame-*.png files found in', root)
  process.exit(1)
}

for (const name of sources) {
  const input = join(root, name)
  const output = join(thumbsDir, name)
  await sharp(input)
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(output)
  console.log('wrote', output)
}

console.log(`Done. ${sources.length} thumbnail(s) at ${THUMB_WIDTH}px width.`)
