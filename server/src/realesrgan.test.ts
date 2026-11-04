import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { describe, it, after } from 'node:test'
import express from 'express'
import sharp from 'sharp'
import {
  defaultUpscaleOptions,
  normalizeOptions,
  type ImageUpscaleEngine,
  type UpscaleLimits,
  type UpscaleOptions,
} from '../../shared/imageUpscaler'
import { createImageUpscalerRouter } from './imageUpscalerRoutes'
import { createUpscalerRuntime, streamZipToFile, type UpscaleEngineRegistry, type UpscalerRuntime } from './imageUpscalerJobs'
import { zipEntryNames } from './storedZip'
import { runNativeProcess } from './nativeProcess'
import { assessRealesrgan, readRealesrgan, resolveRealesrganFiles, type AppEnv } from './realesrganConfig'
import { createRealesrganEngine, createUpscaleEngineRegistry, planAiInputSize } from './realesrganEngine'
import type { NativeRunOptions, NativeRunResult } from './nativeProcess'

const root = await mkdtemp(path.join(os.tmpdir(), 'vvr-realesrgan-'))
const binary = path.join(root, 'realesrgan-ncnn-vulkan.exe')
const modelDir = path.join(root, 'models')
await writeFile(binary, 'not a real executable')
await mkdir(modelDir)
await writeFile(path.join(modelDir, 'upscayl-lite-4x.param'), 'param')
await writeFile(path.join(modelDir, 'upscayl-lite-4x.bin'), 'bin')
await writeFile(path.join(modelDir, 'realesrgan-x4plus.param'), 'param')
await writeFile(path.join(modelDir, 'realesrgan-x4plus.bin'), 'bin')

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

function enabledEnv(extra: AppEnv = {}): AppEnv {
  return {
    VVR_AI_UPSCALER_ENABLED: 'true',
    VVR_REALESRGAN_BINARY: binary,
    VVR_REALESRGAN_MODEL_DIR: modelDir,
    VVR_REALESRGAN_MODEL_NAME: 'upscayl-lite-4x',
    VVR_REALESRGAN_TIMEOUT_MS: '30000',
    ...extra,
  }
}

async function solid(file: string, width: number, height: number, background: { r: number; g: number; b: number; alpha?: number } = { r: 220, g: 20, b: 20, alpha: 1 }): Promise<void> {
  await sharp({ create: { width, height, channels: 4, background: { ...background, alpha: background.alpha ?? 1 } } }).png().toFile(file)
}

async function pixel(file: string, x: number, y: number): Promise<{ r: number; g: number; b: number; a: number; width: number; height: number }> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const index = (y * info.width + x) * info.channels
  return { r: data[index] ?? 0, g: data[index + 1] ?? 0, b: data[index + 2] ?? 0, a: data[index + 3] ?? 0, width: info.width, height: info.height }
}

function arg(args: readonly string[], flag: string): string {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] ?? '' : ''
}

function scaleRun(scale = 4): (command: string, args: readonly string[], options: NativeRunOptions) => Promise<NativeRunResult> {
  return async (command, args) => {
    assert.equal(path.isAbsolute(command), true)
    assert.equal(path.basename(command).toLowerCase(), 'realesrgan-ncnn-vulkan.exe')
    assert.equal(args.includes('-x'), false)
    assert.equal(arg(args, '-f'), 'png')
    assert.equal(arg(args, '-s'), String(scale))
    assert.equal(arg(args, '-n'), 'upscayl-lite-4x')
    assert.equal(args.some((part) => part.includes('#')), false)
    const input = arg(args, '-i')
    const output = arg(args, '-o')
    const meta = await sharp(input).metadata()
    await sharp(input)
      .resize((meta.width ?? 1) * scale, (meta.height ?? 1) * scale, { kernel: 'nearest' })
      .png()
      .toFile(output)
    return { code: 0, stdout: '', stderr: '', timedOut: false, cancelled: false }
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function settle(runtime: UpscalerRuntime, id: string) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const job = runtime.get(id)
    if (job && job.status !== 'queued' && job.status !== 'running') return job
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
  throw new Error('Job did not finish.')
}

describe('realesrgan configuration', () => {
  it('stays off unless enabled, and does not start the program', async () => {
    let probed = false
    const result = await assessRealesrgan({}, async () => {
      probed = true
      return { ok: true, vulkanFailed: false }
    })
    assert.equal(probed, false)
    assert.equal(result.capability.available, false)
    assert.equal(result.capability.model, 'upscayl-lite-4x')
    assert.equal(result.capability.matchesUpscaylLite, true)
    assert.match(result.capability.reason ?? '', /turned off/)
    assert.equal(result.config, null)
  })

  it('rejects a relative path, a disallowed program, a missing model, and an unknown model name', async () => {
    const relative = await resolveRealesrganFiles({
      ...readOrThrow(enabledEnv({ VVR_REALESRGAN_BINARY: 'realesrgan-ncnn-vulkan.exe' })),
    })
    assert.equal(relative.ok, false)
    if (!relative.ok) assert.match(relative.reason, /usable program path/)

    const cmd = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe')
    const disallowed = await resolveRealesrganFiles(readOrThrow(enabledEnv({ VVR_REALESRGAN_BINARY: cmd })))
    assert.equal(disallowed.ok, false)
    if (!disallowed.ok) {
      assert.match(disallowed.reason, /does not allow/)
      assert.equal(disallowed.reason.includes('System32'), false)
      assert.equal(disallowed.reason.includes(cmd), false)
    }

    const empty = path.join(root, 'empty-models')
    await mkdir(empty)
    const missing = await resolveRealesrganFiles(readOrThrow(enabledEnv({ VVR_REALESRGAN_MODEL_DIR: empty })))
    assert.equal(missing.ok, false)
    if (!missing.ok) {
      assert.match(missing.reason, /missing the model files/)
      assert.equal(missing.reason.includes(empty), false)
    }

    const unknown = readRealesrgan(enabledEnv({ VVR_REALESRGAN_MODEL_NAME: '../upscayl-lite-4x' }))
    assert.equal(unknown.ok, false)
    if (!unknown.ok) {
      assert.match(unknown.reason, /does not allow/)
      assert.equal(unknown.model, null)
    }
    const other = readRealesrgan(enabledEnv({ VVR_REALESRGAN_MODEL_NAME: 'remacri-4x' }))
    assert.equal(other.ok, false)
  })

  it('reports an unsupported platform and a program that cannot start', async () => {
    const darwin = await assessRealesrgan(enabledEnv(), async () => ({ ok: true, vulkanFailed: false }), 'darwin')
    assert.equal(darwin.capability.available, false)
    assert.match(darwin.capability.reason ?? '', /Windows and Linux/)

    const broken = await assessRealesrgan(enabledEnv(), async () => ({ ok: false, vulkanFailed: false }), 'win32')
    assert.equal(broken.capability.available, false)
    assert.match(broken.capability.reason ?? '', /could not be started/)
    assert.equal(broken.capability.model, 'upscayl-lite-4x')

    const vulkan = await assessRealesrgan(enabledEnv(), async () => ({ ok: false, vulkanFailed: true }), 'win32')
    assert.match(vulkan.capability.reason ?? '', /Vulkan/)

    const official = await assessRealesrgan(
      enabledEnv({ VVR_REALESRGAN_MODEL_NAME: 'realesrgan-x4plus' }),
      async () => ({ ok: true, vulkanFailed: false }),
      'win32',
    )
    assert.equal(official.capability.available, true)
    assert.equal(official.capability.matchesUpscaylLite, false)
    assert.equal(official.capability.model, 'realesrgan-x4plus')
  })

  it('leaves a 1972×1109 image at native 4× and shrinks only when the temporary image would be too large', () => {
    const full = planAiInputSize(1972, 1109, 4, 8192, 8192 * 8192)
    assert.deepEqual(full, { width: 1972, height: 1109, reduced: false })
    const shrunk = planAiInputSize(4000, 2000, 4, 8192, 8192 * 8192)
    assert.equal(shrunk.reduced, true)
    assert.ok(shrunk.width * 4 <= 8192)
    assert.ok(shrunk.height * 4 <= 8192)
  })
})

describe('realesrgan engine', () => {
  it('writes an exact 3840×2160 PNG after a native 4× pass', async () => {
    const source = path.join(root, 'art.png')
    const output = path.join(root, 'art-4k.png')
    await solid(source, 160, 90)
    const engine = createRealesrganEngine({ env: () => enabledEnv(), run: scaleRun(), platform: 'win32' })
    const result = await engine.process(source, output, options({ preset: 'uhd4k', paddingColor: '#123456' }), limits)
    assert.equal(result.skippedResize, false)
    assert.deepEqual([result.width, result.height, result.format], [3840, 2160, 'png'])
    const meta = await sharp(output).metadata()
    assert.deepEqual([meta.width, meta.height, meta.format], [3840, 2160, 'png'])
    assert.equal((await readFile(output)).subarray(0, 8)[0], 0x89)
    assert.equal((await readdir(path.dirname(output))).some((name) => name.includes('aiwork')), false)
  })

  it('contains, covers, and fills after the model pass', async () => {
    const source = path.join(root, 'split.png')
    const width = 20
    const height = 10
    const raw = Buffer.alloc(width * height * 3, 220)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 3
        const blue = x < 10
        raw[index] = blue ? 0 : 220
        raw[index + 1] = blue ? 0 : 20
        raw[index + 2] = blue ? 220 : 20
      }
    }
    await sharp(raw, { raw: { width, height, channels: 3 } }).png().toFile(source)
    const engine = createRealesrganEngine({ env: () => enabledEnv(), run: scaleRun(), platform: 'win32' })

    const cover = path.join(root, 'ai-cover.png')
    await engine.process(source, cover, options({ width: 20, height: 20, mode: 'cover', cropPosition: 'left' }), limits)
    const coverPixel = await pixel(cover, 0, 10)
    assert.equal(coverPixel.width, 20)
    assert.equal(coverPixel.height, 20)
    assert.ok(coverPixel.b > coverPixel.r)

    const contain = path.join(root, 'ai-contain.png')
    await engine.process(source, contain, options({ width: 20, height: 20, mode: 'contain', padding: 'black' }), limits)
    const pad = await pixel(contain, 10, 0)
    const kept = await pixel(contain, 10, 10)
    assert.ok(pad.r < 8 && pad.g < 8 && pad.b < 8)
    assert.ok(kept.r > 150 || kept.b > 150)

    const fill = path.join(root, 'ai-fill.png')
    await engine.process(source, fill, options({ width: 10, height: 10, mode: 'fill' }), limits)
    const filled = await pixel(fill, 0, 0)
    assert.equal(filled.width, 10)
    assert.equal(filled.height, 10)
  })

  it('still runs when the image is already the target size', async () => {
    const source = path.join(root, 'same.png')
    const output = path.join(root, 'same-out.png')
    await solid(source, 16, 16)
    let calls = 0
    const engine = createRealesrganEngine({
      env: () => enabledEnv(),
      platform: 'win32',
      run: async (command, args, runOptions) => {
        calls += 1
        return scaleRun()(command, args, runOptions)
      },
    })
    const result = await engine.process(source, output, options({ width: 16, height: 16, preserveWhenMatched: true }), limits)
    assert.equal(calls, 1)
    assert.equal(result.skippedResize, false)
    assert.deepEqual([result.width, result.height], [16, 16])
  })

  it('keeps transparency when the model output has alpha, and says so when it does not', async () => {
    const source = path.join(root, 'clear.png')
    const output = path.join(root, 'clear-out.png')
    await solid(source, 8, 8, { r: 0, g: 0, b: 0, alpha: 0 })
    const engine = createRealesrganEngine({ env: () => enabledEnv(), run: scaleRun(), platform: 'win32' })
    await engine.process(source, output, options({ width: 16, height: 16, mode: 'fill', format: 'png' }), limits)
    assert.equal((await pixel(output, 4, 4)).a, 0)

    const flat = path.join(root, 'flat-out.png')
    const dropping = createRealesrganEngine({
      env: () => enabledEnv(),
      platform: 'win32',
      run: async (_command, args) => {
        const input = arg(args, '-i')
        const outputPath = arg(args, '-o')
        const meta = await sharp(input).metadata()
        await sharp(input)
          .removeAlpha()
          .resize((meta.width ?? 1) * 4, (meta.height ?? 1) * 4, { kernel: 'nearest' })
          .png()
          .toFile(outputPath)
        return { code: 0, stdout: '', stderr: '', timedOut: false, cancelled: false }
      },
    })
    const dropped = await dropping.process(source, flat, options({ width: 8, height: 8, mode: 'fill' }), limits)
    assert.match(dropped.note ?? '', /did not keep transparency/)
  })

  it('normalizes JPEG orientation before the model sees the file', async () => {
    const source = path.join(root, 'turned.jpg')
    const output = path.join(root, 'turned-out.png')
    await sharp({ create: { width: 8, height: 4, channels: 3, background: { r: 200, g: 10, b: 10 } } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toFile(source)
    let preparedWidth = 0
    let preparedHeight = 0
    const engine = createRealesrganEngine({
      env: () => enabledEnv(),
      platform: 'win32',
      run: async (command, args, runOptions) => {
        const meta = await sharp(arg(args, '-i')).metadata()
        preparedWidth = meta.width ?? 0
        preparedHeight = meta.height ?? 0
        assert.equal(meta.orientation ?? 1, 1)
        return scaleRun()(command, args, runOptions)
      },
    })
    const result = await engine.process(source, output, options({ width: 8, height: 16, mode: 'fill' }), limits)
    assert.equal(preparedWidth, 4)
    assert.equal(preparedHeight, 8)
    assert.deepEqual([result.width, result.height], [8, 16])
  })

  it('does not replace a failed AI run with Lanczos3 and removes temporary files', async () => {
    const source = path.join(root, 'fail.png')
    const output = path.join(root, 'fail-out.png')
    await solid(source, 8, 8)
    const engine = createRealesrganEngine({
      env: () => enabledEnv(),
      platform: 'win32',
      run: async (_command, args) => {
        await writeFile(arg(args, '-o'), 'partial')
        return { code: 2, stdout: '', stderr: 'vkEnumeratePhysicalDevices failed at C:\\secret\\model', timedOut: false, cancelled: false }
      },
    })
    await assert.rejects(() => engine.process(source, output, options({ width: 16, height: 16 }), limits), /Vulkan/)
    await assert.rejects(() => stat(output))
    assert.equal((await readdir(root)).some((name) => name.includes('aiwork')), false)
  })

  it('stops on timeout and on cancellation', async () => {
    const source = path.join(root, 'wait.png')
    await solid(source, 8, 8)
    const timed = createRealesrganEngine({
      env: () => enabledEnv(),
      platform: 'win32',
      run: async () => ({ code: null, stdout: '', stderr: '', timedOut: true, cancelled: false }),
    })
    await assert.rejects(() => timed.process(source, path.join(root, 'timed-out.png'), options(), limits), /too long/)

    const controller = new AbortController()
    const cancelled = createRealesrganEngine({
      env: () => enabledEnv(),
      platform: 'win32',
      run: async (_command, args, runOptions) => {
        await writeFile(arg(args, '-o'), 'partial')
        controller.abort()
        return { code: null, stdout: '', stderr: '', timedOut: false, cancelled: Boolean(runOptions.signal?.aborted) }
      },
    })
    await assert.rejects(
      () => cancelled.process(source, path.join(root, 'cancel-out.png'), options(), limits, { signal: controller.signal }),
      /cancelled/,
    )
    assert.equal((await readdir(root)).some((name) => name.includes('aiwork')), false)
  })

  it('reduces the model input when a native 4× image would exceed the memory cap', async () => {
    const source = path.join(root, 'big.png')
    const output = path.join(root, 'big-out.png')
    await solid(source, 400, 200)
    let seenWidth = 0
    const engine = createRealesrganEngine({
      env: () => enabledEnv({ VVR_REALESRGAN_MAX_INTERMEDIATE_EDGE: '1024' }),
      platform: 'win32',
      run: async (command, args, runOptions) => {
        seenWidth = (await sharp(arg(args, '-i')).metadata()).width ?? 0
        return scaleRun()(command, args, runOptions)
      },
    })
    const result = await engine.process(source, output, options({ width: 40, height: 20, mode: 'fill' }), limits)
    assert.ok(seenWidth < 400)
    assert.ok(seenWidth * 4 <= 1024)
    assert.match(result.note ?? '', /reduced before AI/)
    assert.deepEqual([result.width, result.height], [40, 20])
  })
})

describe('realesrgan jobs', () => {
  it('processes a batch, writes a ZIP, and keeps the full file for Screensaver transfer', async () => {
    const jobsRoot = path.join(root, 'batch-jobs')
    const engine = createRealesrganEngine({ env: () => enabledEnv(), run: scaleRun(), platform: 'win32' })
    const runtime = createUpscalerRuntime(jobsRoot, engine, limits)
    const first = path.join(root, 'batch-a.png')
    const second = path.join(root, 'batch-b.png')
    await solid(first, 12, 8)
    await solid(second, 10, 10)
    const submitted = await runtime.submit(
      [
        { path: first, originalName: 'photo.png' },
        { path: second, originalName: 'photo.png' },
      ],
      options({ width: 24, height: 16, mode: 'contain', format: 'png', engine: 'realesrgan-lite' }),
    )
    assert.equal(submitted.engine, 'realesrgan-lite')
    const done = await settle(runtime, submitted.id)
    assert.equal(done.status, 'done')
    assert.equal(done.items.every((item) => item.status === 'completed' && item.skippedResize === false), true)
    const file = runtime.itemOutput(submitted.id, done.items[0]!.id)
    assert.ok(file)
    const meta = await sharp(file!.path).metadata()
    assert.deepEqual([meta.width, meta.height, meta.format], [24, 16, 'png'])
    const names = done.items.map((item) => item.outputName)
    assert.match(names[0] ?? '', /photo_custom_24x16\.png/)
    assert.match(names[1] ?? '', /photo_custom_24x16_2\.png/)
    const zipPath = path.join(root, 'ai-batch.zip')
    await streamZipToFile(runtime, submitted.id, zipPath)
    assert.deepEqual(zipEntryNames(await readFile(zipPath)), names)
    const nested = await readdir(path.join(jobsRoot, submitted.id), { recursive: true })
    assert.equal(nested.some((name) => String(name).includes('aiwork')), false)
    await runtime.remove(submitted.id)
  })

  it('runs AI jobs one at a time and cancels the native process', async () => {
    let current = 0
    let max = 0
    const slow: ImageUpscaleEngine = {
      id: 'lanczos3',
      async process() {
        current += 1
        max = Math.max(max, current)
        await new Promise((resolve) => setTimeout(resolve, 80))
        current -= 1
        return { width: 8, height: 8, format: 'png', bytes: 1, skippedResize: false }
      },
    }
    const slowRoot = path.join(root, 'serial-jobs')
    const slowRuntime = createUpscalerRuntime(slowRoot, slow, { ...limits, concurrency: 2 })
    const left = path.join(root, 'serial-a.png')
    const right = path.join(root, 'serial-b.png')
    await solid(left, 8, 8)
    await solid(right, 8, 8)
    const submitted = await slowRuntime.submit(
      [
        { path: left, originalName: 'a.png' },
        { path: right, originalName: 'b.png' },
      ],
      options({ width: 8, height: 8, engine: 'realesrgan-lite' }),
    )
    const done = await settle(slowRuntime, submitted.id)
    assert.equal(done.status, 'done')
    assert.equal(max, 1)
    await slowRuntime.remove(submitted.id)

    let signal: AbortSignal | undefined
    const waiting = createRealesrganEngine({
      env: () => enabledEnv(),
      platform: 'win32',
      run: async (_command, args, runOptions) => {
        signal = runOptions.signal
        await writeFile(arg(args, '-o'), 'partial')
        await new Promise<void>((resolve) => {
          if (runOptions.signal?.aborted) {
            resolve()
            return
          }
          runOptions.signal?.addEventListener('abort', () => resolve(), { once: true })
        })
        return { code: null, stdout: '', stderr: '', timedOut: false, cancelled: true }
      },
    })
    const cancelRoot = path.join(root, 'cancel-jobs')
    const cancelRuntime = createUpscalerRuntime(cancelRoot, waiting, limits)
    const image = path.join(root, 'cancel-me.png')
    await solid(image, 8, 8)
    const job = await cancelRuntime.submit([{ path: image, originalName: 'cancel.png' }], options({ engine: 'realesrgan-lite' }))
    const deadline = Date.now() + 5000
    while (!signal && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20))
    assert.ok(signal)
    const cancelled = cancelRuntime.requestCancel(job.id)
    assert.ok(cancelled)
    const finished = await settle(cancelRuntime, job.id)
    assert.equal(finished.status, 'cancelled')
    assert.equal(finished.items[0]?.status, 'cancelled')
    assert.equal(finished.items[0]?.error, null)
    assert.equal(signal?.aborted, true)
    const nested = await readdir(path.join(cancelRoot, job.id), { recursive: true }).catch(() => [])
    assert.equal(nested.some((name) => String(name).includes('aiwork')), false)
    await cancelRuntime.remove(job.id)
  })

  it('refuses AI Lite over HTTP when it is unavailable and still accepts a job with no engine', async () => {
    const httpRoot = path.join(root, 'http-jobs')
    const incoming = path.join(root, 'http-incoming')
    await mkdir(incoming, { recursive: true })
    const registry: UpscaleEngineRegistry = {
      resolve: (id) => (id === 'realesrgan-lite' ? createRealesrganEngine() : { id: 'lanczos3', process: async () => ({ width: 8, height: 8, format: 'png', bytes: 1, skippedResize: false }) }),
      async unavailableReason(id) {
        return id === 'realesrgan-lite' ? 'AI Lite is not available on this server.' : null
      },
      async capabilities() {
        return {
          engines: {
            lanczos3: { available: true, model: null, scale: null, matchesUpscaylLite: false, reason: null },
            'realesrgan-lite': { available: false, model: 'upscayl-lite-4x', scale: 4, matchesUpscaylLite: true, reason: 'AI Lite is turned off on this server.' },
          },
        }
      },
    }
    const runtime = createUpscalerRuntime(httpRoot, registry, limits)
    const router = createImageUpscalerRouter({ runtime, incomingDir: incoming, capabilities: () => registry.capabilities() })
    const app = express()
    app.use('/api/image-upscaler', router)
    const server: Server = createServer(app)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    try {
      const report = await fetch(`http://127.0.0.1:${port}/api/image-upscaler/capabilities`)
      const body = await report.json()
      assert.equal(body.engines.lanczos3.available, true)
      assert.equal(body.engines['realesrgan-lite'].available, false)
      assert.equal(body.engines['realesrgan-lite'].model, 'upscayl-lite-4x')
      assert.equal(JSON.stringify(body).includes(':\\'), false)

      const source = path.join(root, 'http.png')
      await solid(source, 8, 8)
      const rejected = new FormData()
      rejected.append('file', new Blob([await readFile(source)], { type: 'image/png' }), 'x.png')
      rejected.append('options', JSON.stringify(options({ engine: 'realesrgan-lite' })))
      const denied = await fetch(`http://127.0.0.1:${port}/api/image-upscaler/process`, { method: 'POST', body: rejected })
      assert.equal(denied.status, 400)
      const deniedBody = (await denied.json()) as { error?: string }
      assert.match(deniedBody.error ?? '', /not available/)
      assert.equal((deniedBody.error ?? '').includes(root), false)

      const legacy = new FormData()
      const raw = options() as unknown as Record<string, unknown>
      delete raw.engine
      legacy.append('file', new Blob([await readFile(source)], { type: 'image/png' }), 'x.png')
      legacy.append('options', JSON.stringify(raw))
      const created = await fetch(`http://127.0.0.1:${port}/api/image-upscaler/process`, { method: 'POST', body: legacy })
      assert.equal(created.status, 200)
      const job = (await created.json()) as { id: string; engine: string }
      assert.equal(job.engine, 'lanczos3')
      await runtime.remove(job.id)
    } finally {
      server.close()
      await once(server, 'close')
    }
  })
})

describe('native process control', () => {
  it('rejects a relative command', async () => {
    await assert.rejects(() => runNativeProcess('node', ['-e', '0'], { timeoutMs: 1000 }), /absolute/)
  })

  it('stops a process on timeout and on cancel', async () => {
    let timedPid = 0
    const timed = await runNativeProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      timeoutMs: 400,
      onSpawn(pid) {
        timedPid = pid
      },
    })
    assert.equal(timed.timedOut, true)
    assert.equal(await gone(timedPid), true)

    const controller = new AbortController()
    let cancelPid = 0
    const pending = runNativeProcess(process.execPath, ['-e', 'setInterval(() => {}, 20000)'], {
      timeoutMs: 20_000,
      signal: controller.signal,
      onSpawn(pid) {
        cancelPid = pid
      },
    })
    const deadline = Date.now() + 5000
    while (!cancelPid && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20))
    assert.ok(cancelPid)
    controller.abort()
    const cancelled = await pending
    assert.equal(cancelled.cancelled, true)
    assert.equal(await gone(cancelPid), true)
  })
})

describe('installed realesrgan binary', { skip: process.env.VVR_AI_UPSCALER_INTEGRATION !== '1' }, () => {
  it('upscales a small PNG to the requested size with the configured model', async () => {
    const source = path.join(root, 'live.png')
    const output = path.join(root, 'live-out.png')
    await solid(source, 32, 18)
    const engine = createRealesrganEngine()
    const result = await engine.process(source, output, options({ width: 64, height: 36, mode: 'fill', format: 'png' }), limits)
    assert.deepEqual([result.width, result.height, result.format], [64, 36, 'png'])
  })
})

function readOrThrow(env: AppEnv) {
  const read = readRealesrgan(env, 'win32')
  if (!read.ok) throw new Error(read.reason)
  return read.config
}

async function gone(pid: number): Promise<boolean> {
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    if (!alive(pid)) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return !alive(pid)
}

after(async () => {
  await rm(root, { recursive: true, force: true })
})
