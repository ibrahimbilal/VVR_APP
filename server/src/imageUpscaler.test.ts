import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { describe, it, after } from 'node:test'
import express from 'express'
import sharp from 'sharp'
import { defaultUpscaleOptions, normalizeOptions, type ImageUpscaleEngine, type UpscaleLimits, type UpscaleOptions } from '../../shared/imageUpscaler'
import { inspectImage, magicMatches, processLanczos, verifyOutputFile, writeComparisonPreview } from './imageUpscaler'
import { createUpscalerRuntime, streamZipToFile, type UpscalerRuntime } from './imageUpscalerJobs'
import { createImageUpscalerRouter } from './imageUpscalerRoutes'
import { zipEntryNames } from './storedZip'

const root = await mkdtemp(path.join(os.tmpdir(), 'vvr-upscaler-'))
const incoming = path.join(root, 'incoming')
await mkdir(incoming)

const limits: UpscaleLimits = {
  maxFileBytes: 40 * 1024 * 1024,
  maxBatch: 8,
  maxInputEdge: 8192,
  maxInputPixels: 7680 * 4320,
  maxOutputEdge: 7680,
  maxOutputPixels: 7680 * 4320,
  minEdge: 2,
  concurrency: 1,
  jobTtlMs: 60_000,
  minFreeBytes: 0,
  previewMaxEdge: 48,
}

function options(partial: Partial<UpscaleOptions> = {}): UpscaleOptions {
  return normalizeOptions({ ...defaultUpscaleOptions(), preset: 'custom', width: 32, height: 18, ...partial }, limits).options
}

async function solid(file: string, width: number, height: number, background: { r: number; g: number; b: number; alpha: number } = { r: 220, g: 20, b: 20, alpha: 1 }): Promise<void> {
  await sharp({ create: { width, height, channels: 4, background } }).png().toFile(file)
}

async function pixel(file: string, x: number, y: number): Promise<{ r: number; g: number; b: number; a: number; width: number; height: number }> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const index = (y * info.width + x) * info.channels
  return { r: data[index] ?? 0, g: data[index + 1] ?? 0, b: data[index + 2] ?? 0, a: data[index + 3] ?? 0, width: info.width, height: info.height }
}

async function settle(runtime: UpscalerRuntime, id: string): Promise<NonNullable<ReturnType<UpscalerRuntime['get']>>> {
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    const job = runtime.get(id)
    if (job && job.status !== 'queued' && job.status !== 'running') return job
    await new Promise((resolve) => setTimeout(resolve, 40))
  }
  throw new Error(`Job ${id} did not finish.`)
}

describe('lanczos image engine', () => {
  it('upscales 1920×1080 to exact 4K and a small source to exact 8K', { timeout: 180_000 }, async () => {
    const source4k = path.join(root, 'hd.png')
    const out4k = path.join(root, 'uhd4k.png')
    await solid(source4k, 1920, 1080)
    const uhd = options({ preset: 'uhd4k' })
    const result4k = await processLanczos(source4k, out4k, uhd, limits)
    assert.deepEqual([result4k.width, result4k.height], [3840, 2160])
    const verified4k = await verifyOutputFile(out4k, uhd)
    assert.deepEqual([verified4k.width, verified4k.height, verified4k.format], [3840, 2160, 'png'])
    assert.equal(magicMatches('png', (await readFile(out4k)).subarray(0, 8)), true)
    const center = await pixel(out4k, 1920, 1080)
    assert.ok(center.r > 180 && center.g < 40)

    const source8k = path.join(root, 'tiny.png')
    const out8k = path.join(root, 'uhd8k.png')
    await solid(source8k, 16, 9)
    const uhd8 = options({ preset: 'uhd8k' })
    const result8k = await processLanczos(source8k, out8k, uhd8, limits)
    assert.deepEqual([result8k.width, result8k.height, result8k.format], [7680, 4320, 'png'])
    assert.equal((await stat(out8k)).size, result8k.bytes)
  })

  it('covers, contains, and fills a non-16:9 image', async () => {
    const file = path.join(root, 'split.png')
    const width = 8
    const height = 4
    const raw = Buffer.alloc(width * height * 3, 220)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 3
        const blue = x < 2
        raw[index] = blue ? 0 : 220
        raw[index + 1] = blue ? 0 : 20
        raw[index + 2] = blue ? 220 : 20
      }
    }
    await sharp(raw, { raw: { width, height, channels: 3 } }).png().toFile(file)

    const coverOut = path.join(root, 'cover.png')
    await processLanczos(file, coverOut, options({ width: 4, height: 4, mode: 'cover', cropPosition: 'center' }), limits)
    const coverLeft = await pixel(coverOut, 0, 0)
    assert.equal(coverLeft.width, 4)
    assert.equal(coverLeft.height, 4)
    assert.ok(coverLeft.r > coverLeft.b, 'center cover crops away the blue left edge')

    const coverLeftOut = path.join(root, 'cover-left.png')
    await processLanczos(file, coverLeftOut, options({ width: 4, height: 4, mode: 'cover', cropPosition: 'left' }), limits)
    const keptBlue = await pixel(coverLeftOut, 0, 0)
    assert.ok(keptBlue.b > keptBlue.r, 'left cover keeps the blue edge')

    const containOut = path.join(root, 'contain.png')
    await processLanczos(file, containOut, options({ width: 8, height: 8, mode: 'contain', padding: 'black' }), limits)
    const top = await pixel(containOut, 3, 0)
    const middle = await pixel(containOut, 4, 4)
    assert.ok(top.r < 8 && top.g < 8 && top.b < 8)
    assert.ok(middle.r > 180)

    const fillOut = path.join(root, 'fill.png')
    await processLanczos(file, fillOut, options({ width: 4, height: 4, mode: 'fill' }), limits)
    const filled = await pixel(fillOut, 0, 0)
    assert.equal(filled.width, 4)
    assert.equal(filled.height, 4)
    assert.ok(filled.b > filled.r, 'fill keeps the blue edge instead of cropping it')
  })

  it('preserves PNG transparency and flattens JPEG onto a background', async () => {
    const clear = path.join(root, 'clear.png')
    await solid(clear, 8, 8, { r: 0, g: 0, b: 0, alpha: 0 })
    const pngOut = path.join(root, 'clear-out.png')
    await processLanczos(clear, pngOut, options({ width: 16, height: 16, mode: 'fill', format: 'png', padding: 'transparent' }), limits)
    const transparent = await pixel(pngOut, 8, 8)
    assert.equal(transparent.a, 0)
    assert.equal(magicMatches('png', (await readFile(pngOut)).subarray(0, 8)), true)

    const jpegOut = path.join(root, 'flat.jpg')
    await processLanczos(clear, jpegOut, options({ width: 16, height: 16, mode: 'fill', format: 'jpeg', padding: 'white', quality: 90 }), limits)
    const white = await pixel(jpegOut, 4, 4)
    assert.ok(white.r > 245 && white.g > 245 && white.b > 245)
    assert.equal(white.a, 255)
    assert.equal(magicMatches('jpeg', (await readFile(jpegOut)).subarray(0, 4)), true)

    const greenOut = path.join(root, 'green.jpg')
    await processLanczos(clear, greenOut, options({ width: 16, height: 16, mode: 'contain', format: 'jpeg', padding: 'custom', paddingColor: '#00ff00' }), limits)
    const green = await pixel(greenOut, 1, 1)
    assert.ok(green.g > green.r && green.g > green.b)
  })

  it('rejects invalid, corrupted, and oversized inputs', async () => {
    const text = path.join(root, 'notes.txt')
    await writeFile(text, 'not an image')
    await assert.rejects(() => processLanczos(text, path.join(root, 'bad.png'), options(), limits), /PNG, JPEG, or WebP/)

    const corrupt = path.join(root, 'corrupt.png')
    await writeFile(corrupt, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]))
    await assert.rejects(() => inspectImage(corrupt, limits), /valid PNG, JPEG, or WebP/)

    const big = path.join(root, 'big.png')
    await solid(big, 32, 32)
    const tight = { ...limits, maxInputPixels: 100 }
    await assert.rejects(() => inspectImage(big, tight), /too large/)
    const tinyLimit = { ...limits, maxFileBytes: 20 }
    await assert.rejects(() => processLanczos(big, path.join(root, 'too-big.png'), options(), tinyLimit), /MB or smaller/)
  })

  it('copies an image that is already the target size', async () => {
    const file = path.join(root, 'exact.png')
    const out = path.join(root, 'exact-out.png')
    await solid(file, 24, 12)
    const result = await processLanczos(file, out, options({ width: 24, height: 12, preserveWhenMatched: true, sharpen: 'none', format: 'png' }), limits)
    assert.equal(result.skippedResize, true)
    assert.equal((await readFile(file)).equals(await readFile(out)), true)
  })

  it('fails verification when the output dimensions do not match', async () => {
    const file = path.join(root, 'wrong.png')
    await solid(file, 2, 2)
    await assert.rejects(() => verifyOutputFile(file, options({ width: 8, height: 8 })), /not the requested 8×8/)
  })

  it('writes a smaller comparison preview than the downloaded output', async () => {
    const file = path.join(root, 'preview-src.png')
    const full = path.join(root, 'preview-full.png')
    const preview = path.join(root, 'preview.webp')
    await solid(file, 20, 10)
    await processLanczos(file, full, options({ width: 80, height: 40, mode: 'fill' }), limits)
    const sized = await writeComparisonPreview(full, preview, 20)
    assert.ok(sized.width < 80)
    assert.ok(sized.height < 40)
    assert.equal(magicMatches('webp', (await readFile(preview)).subarray(0, 12)), true)
    const fullMeta = await sharp(full).metadata()
    assert.equal(fullMeta.width, 80)
  })
})

describe('upscaler jobs', () => {
  const jobsRoot = path.join(root, 'jobs')
  const runtime = createUpscalerRuntime(jobsRoot, undefined, limits)

  it('processes a batch, keeps duplicate ZIP names unique, and deletes the job directory', async () => {
    const first = path.join(root, 'batch-a.png')
    const second = path.join(root, 'batch-b.png')
    await solid(first, 12, 8, { r: 10, g: 20, b: 200, alpha: 1 })
    await solid(second, 10, 10, { r: 10, g: 180, b: 20, alpha: 1 })
    const submitted = await runtime.submit(
      [
        { path: first, originalName: 'photo.png' },
        { path: second, originalName: 'photo.png' },
      ],
      options({ width: 24, height: 16, mode: 'contain', format: 'png' }),
    )
    const done = await settle(runtime, submitted.id)
    assert.equal(done.status, 'done')
    assert.equal(done.items.length, 2)
    assert.equal(done.items.every((item) => item.status === 'completed'), true)
    assert.deepEqual(
      done.items.map((item) => [item.width, item.height]),
      [
        [24, 16],
        [24, 16],
      ],
    )
    const names = done.items.map((item) => item.outputName)
    assert.equal(new Set(names).size, 2)
    assert.match(names[0] ?? '', /photo_custom_24x16\.png/)
    assert.match(names[1] ?? '', /photo_custom_24x16_2\.png/)

    const zipPath = path.join(root, 'batch.zip')
    await streamZipToFile(runtime, submitted.id, zipPath)
    const zipNames = zipEntryNames(await readFile(zipPath))
    assert.deepEqual(zipNames, names)

    const output = runtime.itemOutput(submitted.id, done.items[0]!.id)
    assert.ok(output)
    const meta = await sharp(output!.path).metadata()
    assert.equal(meta.width, 24)
    assert.equal(meta.format, 'png')
    const preview = runtime.itemPreview(submitted.id, done.items[0]!.id)
    assert.ok(preview)
    const previewMeta = await sharp(preview!).metadata()
    assert.ok((previewMeta.width ?? 0) <= 48)
    assert.ok((previewMeta.width ?? 0) <= (meta.width ?? 0))
    assert.equal(previewMeta.format, 'webp')

    const dir = path.join(jobsRoot, submitted.id)
    assert.equal((await stat(dir)).isDirectory(), true)
    assert.equal(await runtime.remove(submitted.id), true)
    await assert.rejects(() => stat(dir))
    assert.equal(runtime.get(submitted.id), null)
  })

  it('marks a bad file failed and still finishes the valid file', async () => {
    const good = path.join(root, 'good.png')
    const bad = path.join(root, 'bad-batch.txt')
    await solid(good, 8, 8)
    await writeFile(bad, 'hello')
    const submitted = await runtime.submit(
      [
        { path: good, originalName: 'good.png' },
        { path: bad, originalName: 'notes.png' },
      ],
      options({ width: 16, height: 16 }),
    )
    const done = await settle(runtime, submitted.id)
    assert.equal(done.items[0]?.status, 'completed')
    assert.equal(done.items[1]?.status, 'failed')
    assert.match(done.items[1]?.error ?? '', /PNG, JPEG, or WebP/)
    await runtime.remove(submitted.id)
  })

  it('cancels work that has not started and does not leave a completed file', async () => {
    const release: { go?: () => void } = {}
    const gate = new Promise<void>((resolve) => {
      release.go = resolve
    })
    let started = 0
    const engine: ImageUpscaleEngine = {
      id: 'pause',
      async process() {
        started += 1
        await gate
        return { width: 8, height: 8, format: 'png', bytes: 1, skippedResize: false }
      },
    }
    const cancelRoot = path.join(root, 'cancel-jobs')
    const cancelRuntime = createUpscalerRuntime(cancelRoot, engine, limits)
    const left = path.join(root, 'cancel-a.png')
    const right = path.join(root, 'cancel-b.png')
    await solid(left, 8, 8)
    await solid(right, 8, 8)
    const submitted = await cancelRuntime.submit(
      [
        { path: left, originalName: 'a.png' },
        { path: right, originalName: 'b.png' },
      ],
      options({ width: 8, height: 8 }),
    )
    const deadline = Date.now() + 5000
    while (started < 1 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(started, 1)
    const cancelled = cancelRuntime.requestCancel(submitted.id)
    assert.equal(cancelled?.items[1]?.status, 'cancelled')
    release.go?.()
    const done = await settle(cancelRuntime, submitted.id)
    assert.equal(done.status, 'cancelled')
    assert.equal(done.items.every((item) => item.status === 'cancelled'), true)
    assert.equal(started, 1)
    await cancelRuntime.remove(submitted.id)
  })

  it('serves the full download and a smaller preview over HTTP', async () => {
    const httpRoot = path.join(root, 'http-jobs')
    const httpIncoming = path.join(root, 'http-incoming')
    await mkdir(httpIncoming, { recursive: true })
    const httpRuntime = createUpscalerRuntime(httpRoot, undefined, { ...limits, previewMaxEdge: 16 })
    const router = createImageUpscalerRouter({ runtime: httpRuntime, incomingDir: httpIncoming })
    const app = express()
    app.use('/api/image-upscaler', router)
    const server: Server = createServer(app)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    try {
      const source = path.join(root, 'http.png')
      await solid(source, 18, 10)
      const body = new FormData()
      body.append('file', new Blob([await readFile(source)], { type: 'image/png' }), 'landscape.png')
      body.append('options', JSON.stringify(options({ width: 36, height: 20, preset: 'custom', mode: 'fill' })))
      const created = await fetch(`http://127.0.0.1:${port}/api/image-upscaler/process`, { method: 'POST', body })
      assert.equal(created.status, 200)
      const job = (await created.json()) as { id: string }
      let latest = httpRuntime.get(job.id)
      const deadline = Date.now() + 30_000
      while (latest && (latest.status === 'queued' || latest.status === 'running') && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 40))
        latest = httpRuntime.get(job.id)
      }
      assert.equal(latest?.status, 'done')
      const item = latest!.items[0]!
      const download = await fetch(`http://127.0.0.1:${port}/api/image-upscaler/jobs/${job.id}/items/${item.id}/download`)
      const previewRes = await fetch(`http://127.0.0.1:${port}/api/image-upscaler/jobs/${job.id}/items/${item.id}/preview`)
      assert.equal(download.status, 200)
      assert.equal(previewRes.status, 200)
      const downloadBytes = Buffer.from(await download.arrayBuffer())
      const previewBytes = Buffer.from(await previewRes.arrayBuffer())
      assert.equal(magicMatches('png', downloadBytes), true)
      assert.equal(magicMatches('webp', previewBytes), true)
      const downloaded = await sharp(downloadBytes).metadata()
      const previewMeta = await sharp(previewBytes).metadata()
      assert.deepEqual([downloaded.width, downloaded.height], [36, 20])
      assert.ok((previewMeta.width ?? 0) < 36)
      assert.match(download.headers.get('content-disposition') ?? '', /landscape_custom_36x20\.png/)

      const missing = await fetch(`http://127.0.0.1:${port}/api/image-upscaler/process`, { method: 'POST', body: new FormData() })
      assert.equal(missing.status, 400)
      const badOptions = new FormData()
      badOptions.append('file', new Blob([await readFile(source)]), 'x.png')
      badOptions.append('options', '{')
      const rejected = await fetch(`http://127.0.0.1:${port}/api/image-upscaler/process`, { method: 'POST', body: badOptions })
      assert.equal(rejected.status, 400)

      const removed = await fetch(`http://127.0.0.1:${port}/api/image-upscaler/jobs/${job.id}`, { method: 'DELETE' })
      assert.equal(removed.status, 200)
      await assert.rejects(() => stat(path.join(httpRoot, job.id)))
    } finally {
      server.close()
      await once(server, 'close')
    }
  })
})

after(async () => {
  await rm(root, { recursive: true, force: true })
})
