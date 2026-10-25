import { execFile } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { applyColorAdjustments, defaultAdjustments, ffmpegAdjustmentFilter } from '../../shared/screensaverAdjust'
import { ffmpegBinary } from '../src/binaries'
import { ensureStorage, tmpDir } from '../src/storage'

const execFileAsync = promisify(execFile)

interface Case {
  name: string
  apply: (data: Uint8ClampedArray) => void
  ffmpeg: (height: number) => string
  minSsim: number
}

async function main(): Promise<void> {
  const enabled = process.env.VVR_SCREENSAVER_TEST === '1' || process.env.npm_lifecycle_event === 'test:screensaver-visual'
  if (!enabled) {
    console.log('Run via npm run test:screensaver-visual or set VVR_SCREENSAVER_TEST=1.')
    return
  }
  await ensureStorage()
  const work = path.join(tmpDir, 'visual-screensaver-adjust')
  await rm(work, { recursive: true, force: true })
  await mkdir(work, { recursive: true })

  const width = 640
  const height = 360
  const sourcePng = path.join(work, 'source.png')
  await execFileAsync(ffmpegBinary(), [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `testsrc=size=${width}x${height}:rate=1:duration=1`,
    '-frames:v',
    '1',
    sourcePng,
  ])

  const rawPath = path.join(work, 'source.rgba')
  await execFileAsync(ffmpegBinary(), [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    sourcePng,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgba',
    rawPath,
  ])
  const raw = await readFile(rawPath)
  const base = new Uint8ClampedArray(raw.buffer, raw.byteOffset, raw.byteLength)

  const cases: Case[] = [
    {
      name: 'brightness_contrast_saturation',
      apply: (data) => {
        const a = defaultAdjustments()
        a.brightness = 20
        a.contrast = 15
        a.saturation = 30
        applyColorAdjustments(data, a)
      },
      ffmpeg: (h) => {
        const a = defaultAdjustments()
        a.brightness = 20
        a.contrast = 15
        a.saturation = 30
        return ffmpegAdjustmentFilter(a, h)
      },
      minSsim: 0.75,
    },
    {
      name: 'grayscale',
      apply: (data) => {
        const a = defaultAdjustments()
        a.grayscale = 100
        applyColorAdjustments(data, a)
      },
      ffmpeg: (h) => ffmpegAdjustmentFilter({ ...defaultAdjustments(), grayscale: 100 }, h),
      minSsim: 0.85,
    },
    {
      name: 'sepia',
      apply: (data) => {
        const a = defaultAdjustments()
        a.sepia = 80
        applyColorAdjustments(data, a)
      },
      ffmpeg: (h) => ffmpegAdjustmentFilter({ ...defaultAdjustments(), sepia: 80 }, h),
      minSsim: 0.7,
    },
  ]

  for (const item of cases) {
    const cpuData = new Uint8ClampedArray(base)
    item.apply(cpuData)
    const cpuPng = path.join(work, `${item.name}-cpu.png`)
    await writeRawPng(cpuPng, cpuData, width, height)

    const filter = item.ffmpeg(height)
    const ffPng = path.join(work, `${item.name}-ffmpeg.png`)
    if (!filter) {
      console.log(`Skip ${item.name}: neutral ffmpeg filter`)
      continue
    }
    await execFileAsync(ffmpegBinary(), [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      sourcePng,
      '-vf',
      filter,
      '-frames:v',
      '1',
      ffPng,
    ])

    const ssim = await ssimScore(cpuPng, ffPng)
    console.log(JSON.stringify({ case: item.name, ssim, minSsim: item.minSsim }))
    if (ssim < item.minSsim) {
      throw new Error(`${item.name}: SSIM ${ssim} below ${item.minSsim}`)
    }
  }
  console.log('Visual adjust comparison OK')
  await rm(work, { recursive: true, force: true })
}

async function writeRawPng(out: string, data: Uint8ClampedArray, width: number, height: number): Promise<void> {
  const raw = path.join(path.dirname(out), `${path.basename(out)}.raw`)
  await writeFile(raw, Buffer.from(data))
  await execFileAsync(ffmpegBinary(), [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgba',
    '-s',
    `${width}x${height}`,
    '-i',
    raw,
    '-frames:v',
    '1',
    out,
  ])
}

async function ssimScore(reference: string, distorted: string): Promise<number> {
  const result = await execFileAsync(ffmpegBinary(), ['-i', reference, '-i', distorted, '-lavfi', 'ssim', '-f', 'null', '-'])
  const text = `${result.stderr}\n${result.stdout}`
  const match = /All:([0-9.]+)/.exec(text)
  if (!match) throw new Error(`SSIM score missing: ${text.slice(-400)}`)
  return Number(match[1])
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
