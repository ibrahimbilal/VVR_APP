import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readdir, rename, rm, stat, statfs } from 'node:fs/promises'
import path from 'node:path'
import type { Writable } from 'node:stream'
import {
  limitsFromEnv,
  uniqueOutputName,
  type ImageUpscaleEngine,
  type OutputFormat,
  type PublicUpscaleItem,
  type PublicUpscaleJob,
  type UpscaleItemStatus,
  type UpscaleJobStatus,
  type UpscaleLimits,
  type UpscaleOptions,
} from '../../shared/imageUpscaler'
import { jobIdsInUse } from './jobs'
import {
  createLanczosEngine,
  inspectImage,
  processLanczos,
  publicError,
  UpscaleError,
  verifyOutputFile,
  writeComparisonPreview,
} from './imageUpscaler'
import { pipeStoredZip } from './storedZip'

interface ItemRecord {
  id: string
  name: string
  inputPath: string
  outputPath: string | null
  previewPath: string | null
  outputName: string | null
  status: UpscaleItemStatus
  error: string | null
  warning: string | null
  outputBytes: number | null
  inputWidth: number | null
  inputHeight: number | null
  width: number | null
  height: number | null
  format: OutputFormat | null
  skippedResize: boolean
}

interface JobRecord {
  id: string
  dir: string
  createdAt: number
  status: UpscaleJobStatus
  options: UpscaleOptions
  warnings: string[]
  items: ItemRecord[]
  cancelRequested: boolean
}

export interface SubmittedFile {
  path: string
  originalName: string
}

export interface UpscalerRuntime {
  limits: UpscaleLimits
  submit(files: SubmittedFile[], options: UpscaleOptions, warnings?: string[]): Promise<PublicUpscaleJob>
  get(id: string): PublicUpscaleJob | null
  requestCancel(id: string): PublicUpscaleJob | null
  remove(id: string): Promise<boolean>
  itemOutput(jobId: string, itemId: string): { path: string; name: string; format: OutputFormat } | null
  itemPreview(jobId: string, itemId: string): string | null
  writeZip(jobId: string, output: Writable): Promise<string>
  sweep(now?: number): Promise<void>
  purgeAll(): Promise<void>
  whenIdle(): Promise<void>
}

export function createUpscalerRuntime(rootDir: string, engine: ImageUpscaleEngine = createLanczosEngine(), limits = limitsFromEnv()): UpscalerRuntime {
  const jobs = new Map<string, JobRecord>()
  const queue: Array<{ jobId: string; itemId: string }> = []
  let active = 0
  let idleWaiters: Array<() => void> = []
  let renderWait: ReturnType<typeof setTimeout> | null = null

  function view(job: JobRecord): PublicUpscaleJob {
    return {
      id: job.id,
      status: job.status,
      createdAt: job.createdAt,
      items: job.items.map(publicItem),
    }
  }

  function refresh(job: JobRecord): void {
    const busy = job.items.some((item) => item.status === 'pending' || item.status === 'processing')
    if (busy) {
      job.status = job.items.some((item) => item.status === 'processing') ? 'running' : 'queued'
      return
    }
    if (job.cancelRequested) job.status = 'cancelled'
    else if (job.items.every((item) => item.status === 'failed')) job.status = 'error'
    else job.status = 'done'
  }

  function pump(): void {
    if (active >= limits.concurrency) return
    if (jobIdsInUse().size > 0 && queue.length > 0) {
      if (renderWait) return
      renderWait = setTimeout(() => {
        renderWait = null
        pump()
      }, 400)
      return
    }
    while (active < limits.concurrency && queue.length > 0) {
      const next = queue.shift()
      if (!next) break
      active += 1
      void processQueued(next.jobId, next.itemId).finally(() => {
        active -= 1
        const job = jobs.get(next.jobId)
        if (job) refresh(job)
        if (active === 0 && queue.length === 0) {
          const waiters = idleWaiters
          idleWaiters = []
          for (const wake of waiters) wake()
        }
        pump()
      })
    }
  }

  async function processQueued(jobId: string, itemId: string): Promise<void> {
    const job = jobs.get(jobId)
    const item = job?.items.find((entry) => entry.id === itemId)
    if (!job || !item) return
    if (job.cancelRequested || item.status === 'cancelled') {
      item.status = 'cancelled'
      await rm(item.inputPath, { force: true }).catch(() => undefined)
      return
    }
    item.status = 'processing'
    job.status = 'running'
    const ext = job.options.format === 'jpeg' ? 'jpg' : job.options.format
    const outputPath = path.join(job.dir, 'out', `${item.id}.${ext}`)
    const previewPath = path.join(job.dir, 'out', `${item.id}.preview.webp`)
    try {
      const info = await inspectImage(item.inputPath, limits)
      item.inputWidth = info.width
      item.inputHeight = info.height
      if (job.options.format === 'jpeg' && info.hasAlpha) {
        item.warning = appendWarning(item.warning, 'JPEG cannot store transparency. Transparent pixels were flattened onto the background color.')
      }
      for (const warning of job.warnings) item.warning = appendWarning(item.warning, warning)
      const result = engine.id === 'lanczos3'
        ? await processLanczos(item.inputPath, outputPath, job.options, limits)
        : await engine.process(item.inputPath, outputPath, job.options, limits)
      if (job.cancelRequested) {
        item.status = 'cancelled'
        await rm(outputPath, { force: true }).catch(() => undefined)
        return
      }
      if (engine.id !== 'lanczos3') await verifyOutputFile(outputPath, job.options)
      try {
        const preview = await writeComparisonPreview(outputPath, previewPath, limits.previewMaxEdge)
        if (preview.width > result.width || preview.height > result.height) {
          throw new UpscaleError('The comparison preview is larger than the processed image.')
        }
        item.previewPath = previewPath
      } catch {
        item.previewPath = null
        await rm(previewPath, { force: true }).catch(() => undefined)
      }
      item.outputPath = outputPath
      item.outputBytes = result.bytes
      item.width = result.width
      item.height = result.height
      item.format = result.format
      item.skippedResize = result.skippedResize
      item.status = 'completed'
    } catch (error) {
      item.status = job.cancelRequested ? 'cancelled' : 'failed'
      item.error = item.status === 'failed' ? publicError(error, 'This image could not be processed.') : null
      await rm(outputPath, { force: true }).catch(() => undefined)
      await rm(previewPath, { force: true }).catch(() => undefined)
    } finally {
      await rm(item.inputPath, { force: true }).catch(() => undefined)
    }
  }

  return {
    limits,
    async submit(files, options, warnings = []) {
      if (files.length < 1) throw new UpscaleError('Choose at least one image.')
      if (files.length > limits.maxBatch) throw new UpscaleError(`Upload at most ${limits.maxBatch} images at a time.`)
      await mkdir(rootDir, { recursive: true })
      const free = await freeBytes(rootDir)
      if (free != null && free < limits.minFreeBytes) {
        throw new UpscaleError('Not enough free disk space to upscale images.')
      }
      const id = randomUUID()
      const dir = path.join(rootDir, id)
      await mkdir(path.join(dir, 'in'), { recursive: true })
      await mkdir(path.join(dir, 'out'), { recursive: true })
      const used = new Set<string>()
      const items: ItemRecord[] = []
      try {
        for (const file of files) {
          const itemId = randomUUID()
          const inputPath = path.join(dir, 'in', itemId)
          await rename(file.path, inputPath).catch(async () => {
            const { copyFile } = await import('node:fs/promises')
            await copyFile(file.path, inputPath)
            await rm(file.path, { force: true })
          })
          const display = path.basename(file.originalName).slice(0, 180) || 'image'
          items.push({
            id: itemId,
            name: display,
            inputPath,
            outputPath: null,
            previewPath: null,
            outputName: uniqueOutputName(display, options, used),
            status: 'pending',
            error: null,
            warning: null,
            outputBytes: null,
            inputWidth: null,
            inputHeight: null,
            width: null,
            height: null,
            format: null,
            skippedResize: false,
          })
        }
      } catch (error) {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined)
        throw new UpscaleError(publicError(error, 'The upload could not be stored.'))
      }
      const job: JobRecord = {
        id,
        dir,
        createdAt: Date.now(),
        status: 'queued',
        options,
        warnings,
        items,
        cancelRequested: false,
      }
      jobs.set(id, job)
      for (const item of items) queue.push({ jobId: id, itemId: item.id })
      pump()
      return view(job)
    },
    get(id) {
      const job = jobs.get(id)
      return job ? view(job) : null
    },
    requestCancel(id) {
      const job = jobs.get(id)
      if (!job) return null
      job.cancelRequested = true
      for (const item of job.items) {
        if (item.status === 'pending') item.status = 'cancelled'
      }
      for (let i = queue.length - 1; i >= 0; i -= 1) {
        if (queue[i]?.jobId === id) queue.splice(i, 1)
      }
      refresh(job)
      return view(job)
    },
    async remove(id) {
      const job = jobs.get(id)
      if (!job) return false
      job.cancelRequested = true
      for (const item of job.items) {
        if (item.status === 'pending') item.status = 'cancelled'
      }
      for (let i = queue.length - 1; i >= 0; i -= 1) {
        if (queue[i]?.jobId === id) queue.splice(i, 1)
      }
      const busy = job.items.some((item) => item.status === 'processing')
      if (busy) {
        await new Promise<void>((resolve) => {
          const timer = setInterval(() => {
            if (!job.items.some((item) => item.status === 'processing')) {
              clearInterval(timer)
              resolve()
            }
          }, 50)
        })
      }
      jobs.delete(id)
      await rm(job.dir, { recursive: true, force: true })
      return true
    },
    itemOutput(jobId, itemId) {
      const job = jobs.get(jobId)
      const item = job?.items.find((entry) => entry.id === itemId)
      if (!job || !item || item.status !== 'completed' || !item.outputPath || !item.outputName || !item.format) return null
      if (!isInside(job.dir, item.outputPath)) return null
      return { path: item.outputPath, name: item.outputName, format: item.format }
    },
    itemPreview(jobId, itemId) {
      const job = jobs.get(jobId)
      const item = job?.items.find((entry) => entry.id === itemId)
      if (!item || item.status !== 'completed' || !item.previewPath) return null
      if (!job || !isInside(job.dir, item.previewPath)) return null
      return item.previewPath
    },
    async writeZip(jobId, output) {
      const job = jobs.get(jobId)
      if (!job) throw new UpscaleError('Unknown upscale job.')
      const entries = job.items.flatMap((item) => {
        if (item.status !== 'completed' || !item.outputPath || !item.outputName) return []
        if (!isInside(job.dir, item.outputPath)) return []
        return [{ name: item.outputName, path: item.outputPath }]
      })
      if (entries.length === 0) throw new UpscaleError('No finished images are ready to download.')
      await pipeStoredZip(entries, output)
      return 'upscaled-images.zip'
    },
    async sweep(now = Date.now()) {
      for (const job of [...jobs.values()]) {
        if (now - job.createdAt < limits.jobTtlMs) continue
        if (job.items.some((item) => item.status === 'processing')) continue
        job.cancelRequested = true
        jobs.delete(job.id)
        await rm(job.dir, { recursive: true, force: true }).catch(() => undefined)
      }
      await deleteStaleDirs(rootDir, limits.jobTtlMs, now, new Set(jobs.keys()))
    },
    async purgeAll() {
      for (const job of jobs.values()) job.cancelRequested = true
      queue.splice(0, queue.length)
      await whenIdle()
      for (const job of [...jobs.values()]) {
        jobs.delete(job.id)
        await rm(job.dir, { recursive: true, force: true }).catch(() => undefined)
      }
      await deleteStaleDirs(rootDir, 0, Date.now(), new Set())
    },
    whenIdle,
  }

  function whenIdle(): Promise<void> {
    if (active === 0 && queue.length === 0) return Promise.resolve()
    return new Promise((resolve) => {
      idleWaiters.push(resolve)
    })
  }
}

function publicItem(item: ItemRecord): PublicUpscaleItem {
  return {
    id: item.id,
    name: item.name,
    status: item.status,
    error: item.error,
    warning: item.warning,
    outputName: item.status === 'completed' ? item.outputName : null,
    outputBytes: item.outputBytes,
    inputWidth: item.inputWidth,
    inputHeight: item.inputHeight,
    width: item.width,
    height: item.height,
    format: item.format,
    skippedResize: item.skippedResize,
  }
}

function appendWarning(current: string | null, next: string): string {
  if (!current) return next
  if (current.includes(next)) return current
  return `${current} ${next}`
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

async function freeBytes(dir: string): Promise<number | null> {
  try {
    const space = await statfs(dir)
    return Number(space.bavail) * Number(space.bsize)
  } catch {
    return null
  }
}

async function deleteStaleDirs(root: string, ttlMs: number, now: number, keep: Set<string>): Promise<void> {
  let names: string[] = []
  try {
    names = await readdir(root)
  } catch {
    return
  }
  for (const name of names) {
    if (keep.has(name)) continue
    const full = path.join(root, name)
    try {
      const info = await stat(full)
      if (!info.isDirectory()) continue
      if (ttlMs > 0 && now - info.mtimeMs < ttlMs) continue
      await rm(full, { recursive: true, force: true })
    } catch {
      // The next sweep retries a file that is still open.
    }
  }
}

export async function streamZipToFile(runtime: UpscalerRuntime, jobId: string, filePath: string): Promise<void> {
  const stream = createWriteStream(filePath)
  try {
    await runtime.writeZip(jobId, stream)
    await new Promise<void>((resolve, reject) => {
      stream.on('error', reject)
      stream.end(() => resolve())
    })
  } catch (error) {
    stream.destroy()
    throw error
  }
}
