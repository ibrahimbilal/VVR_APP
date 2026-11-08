import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { createWriteStream } from 'node:fs'
import { mkdir, readdir, rename, rm, stat, statfs } from 'node:fs/promises'
import path from 'node:path'
import type { Writable } from 'node:stream'
import {
  limitsFromEnv,
  resolveEffectiveScale,
  resolveExportDimensions,
  serializeUpscaleParamsForHash,
  uniqueOutputName,
  type ExportStageStatus,
  type ImageUpscaleEngine,
  type OutputFormat,
  type PublicUpscaleItem,
  type PublicUpscaleJob,
  type UpscaleEngineId,
  type UpscaleItemStatus,
  type UpscaleJobStatus,
  type UpscaleLimits,
  type UpscaleOptions,
  type UpscaleStageStatus,
  type UpscalerCapabilities,
} from '../../shared/imageUpscaler'
import { jobIdsInUse } from './jobs'
import {
  createLanczosEngine,
  inspectImage,
  publicError,
  runExportStage,
  UpscaleError,
  verifyOutputFile,
  writeComparisonPreview,
} from './imageUpscaler'
import { pipeStoredZip } from './storedZip'

interface ItemRecord {
  id: string
  name: string
  inputPath: string
  intermediatePath: string | null
  outputPath: string | null
  previewPath: string | null
  outputName: string | null
  status: UpscaleItemStatus
  error: string | null
  warning: string | null
  outputBytes: number | null
  outputRevision: number | null
  inputWidth: number | null
  inputHeight: number | null
  intermediateWidth: number | null
  intermediateHeight: number | null
  effectiveScale: number | null
  width: number | null
  height: number | null
  format: OutputFormat | null
  skippedResize: boolean
  upscaleStage: UpscaleStageStatus
  exportStage: ExportStageStatus
  intermediateReused: boolean
  aiRan: boolean
  contentSha256: string | null
  upscaleHash: string | null
  exportOnly: boolean
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

export interface UpscaleEngineRegistry {
  resolve(id: UpscaleEngineId): ImageUpscaleEngine
  unavailableReason(id: UpscaleEngineId): Promise<string | null>
  capabilities(): Promise<UpscalerCapabilities>
}

export interface UpscalerRuntime {
  limits: UpscaleLimits
  submit(files: SubmittedFile[], options: UpscaleOptions, warnings?: string[]): Promise<PublicUpscaleJob>
  reexportExportOnly(id: string, options: UpscaleOptions, warnings?: string[]): Promise<PublicUpscaleJob>
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

function isRegistry(value: ImageUpscaleEngine | UpscaleEngineRegistry): value is UpscaleEngineRegistry {
  return 'resolve' in value && 'unavailableReason' in value
}

export function createUpscalerRuntime(
  rootDir: string,
  engine: ImageUpscaleEngine | UpscaleEngineRegistry = createLanczosEngine(),
  limits = limitsFromEnv(),
): UpscalerRuntime {
  const registry = isRegistry(engine) ? engine : null
  const single = registry ? null : engine
  const jobs = new Map<string, JobRecord>()
  const activeAborts = new Map<string, AbortController>()
  const queue: Array<{ jobId: string; itemId: string }> = []
  let active = 0
  let idleWaiters: Array<() => void> = []
  let renderWait: ReturnType<typeof setTimeout> | null = null

  async function tryReuseIntermediate(intermediatePath: string, item: ItemRecord): Promise<boolean> {
    try {
      const info = await stat(intermediatePath)
      if (!info.isFile()) return false
      const meta = await inspectImage(intermediatePath, limits, {
        maxEdge: limits.maxIntermediateEdge,
        maxPixels: limits.maxIntermediatePixels,
      })
      item.intermediateWidth = meta.width
      item.intermediateHeight = meta.height
      item.aiRan = false
      return true
    } catch {
      return false
    }
  }

  function view(job: JobRecord): PublicUpscaleJob {
    return {
      id: job.id,
      status: job.status,
      engine: job.options.engine,
      options: job.options,
      createdAt: job.createdAt,
      items: job.items.map(publicItem),
    }
  }

  function refresh(job: JobRecord): void {
    const busy = job.items.some((item) => item.status === 'pending' || item.status === 'processing')
    if (!busy) activeAborts.delete(job.id)
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
      const next = queue[0]
      if (!next) break
      const nextJob = jobs.get(next.jobId)
      if (nextJob?.options.engine === 'realesrgan-lite' && active > 0) return
      queue.shift()
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
      return
    }
    item.status = 'processing'
    job.status = 'running'
    const ext = job.options.format === 'jpeg' ? 'jpg' : job.options.format
    const outputPath = path.join(job.dir, 'out', `${item.id}.${ext}`)
    const previewPath = path.join(job.dir, 'out', `${item.id}.preview.webp`)
    const signal = activeAborts.get(job.id)?.signal
    const midDir = path.join(job.dir, 'mid')
    try {
      if (!item.inputWidth || !item.inputHeight) {
        const info = await inspectImage(item.inputPath, limits)
        item.inputWidth = info.width
        item.inputHeight = info.height
        if (job.options.format === 'jpeg' && info.hasAlpha) {
          item.warning = appendWarning(item.warning, 'JPEG cannot store transparency. Transparent pixels were flattened onto the background color.')
        }
      }
      const srcW = item.inputWidth ?? 0
      const srcH = item.inputHeight ?? 0
      for (const warning of job.warnings) item.warning = appendWarning(item.warning, warning)
      if (!item.contentSha256) item.contentSha256 = await sha256File(item.inputPath)
      if (!item.exportOnly) {
        const { effectiveScale, autoReason } = resolveEffectiveScale(job.options, srcW, srcH, limits)
        item.effectiveScale = effectiveScale
        if (autoReason) item.warning = appendWarning(item.warning, autoReason)
        item.upscaleHash = hashUpscale(job.options.engine, job.options.scaleFactor, effectiveScale, item.contentSha256)
        const sharedIntermediate = path.join(midDir, `${item.upscaleHash}.png`)
        const reused = await tryReuseIntermediate(sharedIntermediate, item)
        if (reused) {
          item.intermediatePath = sharedIntermediate
          item.upscaleStage = 'reused'
          item.intermediateReused = true
        } else {
          item.upscaleStage = 'processing'
          item.intermediateReused = false
          await mkdir(midDir, { recursive: true })
          const selected = engineFor(job)
          const stage = await selected.runUpscaleStage(item.inputPath, sharedIntermediate, job.options, effectiveScale, limits, { signal })
          if (job.cancelRequested || signal?.aborted) {
            item.status = 'cancelled'
            item.upscaleStage = 'failed'
            await rm(sharedIntermediate, { force: true }).catch(() => undefined)
            return
          }
          if (stage.note) item.warning = appendWarning(item.warning, stage.note)
          item.intermediatePath = sharedIntermediate
          item.intermediateWidth = stage.width
          item.intermediateHeight = stage.height
          item.aiRan = stage.aiRan
          item.upscaleStage = stage.skippedUpscale ? 'skipped' : 'completed'
        }
      } else if (!item.intermediatePath) {
        throw new UpscaleError('The upscaled intermediate is missing. Run a full upscale first.')
      }

      item.exportStage = 'processing'
      await rm(outputPath, { force: true }).catch(() => undefined)
      await rm(previewPath, { force: true }).catch(() => undefined)
      const interW = item.intermediateWidth ?? srcW
      const interH = item.intermediateHeight ?? srcH
      const exportDims = resolveExportDimensions(srcW, srcH, interW, interH, job.options)
      const result = await runExportStage(
        item.intermediatePath!,
        outputPath,
        job.options,
        srcW,
        srcH,
        interW,
        interH,
        limits,
      )
      if (job.cancelRequested || signal?.aborted) {
        item.status = 'cancelled'
        item.exportStage = 'failed'
        await rm(outputPath, { force: true }).catch(() => undefined)
        return
      }
      const exportOptions = { ...job.options, width: exportDims.width, height: exportDims.height }
      await verifyOutputFile(outputPath, exportOptions)
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
      item.outputRevision = (item.outputRevision ?? 0) + 1
      item.width = result.width
      item.height = result.height
      item.format = result.format
      item.skippedResize = result.skippedResize
      item.outputName = allocateOutputName(job, item, job.options, result.width, result.height)
      item.exportStage = 'completed'
      item.status = 'completed'
      item.exportOnly = false
    } catch (error) {
      const aborted = job.cancelRequested || Boolean(signal?.aborted)
      item.status = aborted ? 'cancelled' : 'failed'
      item.error = item.status === 'failed' ? publicError(error, 'This image could not be processed.') : null
      if (item.upscaleStage === 'processing') item.upscaleStage = 'failed'
      if (item.exportStage === 'processing') item.exportStage = 'failed'
      await rm(outputPath, { force: true }).catch(() => undefined)
      await rm(previewPath, { force: true }).catch(() => undefined)
    }
  }

  return {
    limits,
    async submit(files, options, warnings = []) {
      if (registry) {
        const reason = await registry.unavailableReason(options.engine)
        if (reason) throw new UpscaleError(reason)
      }
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
      await mkdir(path.join(dir, 'mid'), { recursive: true })
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
            intermediatePath: null,
            outputPath: null,
            previewPath: null,
            outputName: null,
            status: 'pending',
            error: null,
            warning: null,
            outputBytes: null,
            outputRevision: null,
            inputWidth: null,
            inputHeight: null,
            intermediateWidth: null,
            intermediateHeight: null,
            effectiveScale: null,
            width: null,
            height: null,
            format: null,
            skippedResize: false,
            upscaleStage: 'pending',
            exportStage: 'pending',
            intermediateReused: false,
            aiRan: false,
            contentSha256: null,
            upscaleHash: null,
            exportOnly: false,
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
      activeAborts.set(id, new AbortController())
      for (const item of items) queue.push({ jobId: id, itemId: item.id })
      pump()
      return view(job)
    },
    async reexportExportOnly(id, options, warnings = []) {
      const job = jobs.get(id)
      if (!job) throw new UpscaleError('Unknown upscale job.')
      if (job.items.some((item) => item.status === 'processing')) {
        throw new UpscaleError('Wait until the current upscale finishes before re-exporting.')
      }
      job.options = options
      job.warnings = warnings
      job.cancelRequested = false
      activeAborts.set(id, new AbortController())
      for (const item of job.items) {
        if (!item.intermediatePath) continue
        item.status = 'pending'
        item.error = null
        item.exportStage = 'pending'
        item.exportOnly = true
        item.outputPath = null
        item.previewPath = null
        item.outputBytes = null
        item.outputRevision = null
        item.width = null
        item.height = null
        item.format = null
        item.skippedResize = false
        item.outputName = null
        queue.push({ jobId: id, itemId: item.id })
      }
      job.status = 'queued'
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
      halt(job)
      refresh(job)
      return view(job)
    },
    async remove(id) {
      const job = jobs.get(id)
      if (!job) return false
      halt(job)
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
      activeAborts.delete(id)
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
        activeAborts.get(job.id)?.abort()
        activeAborts.delete(job.id)
        for (let i = queue.length - 1; i >= 0; i -= 1) {
          if (queue[i]?.jobId === job.id) queue.splice(i, 1)
        }
        jobs.delete(job.id)
        await rm(job.dir, { recursive: true, force: true }).catch(() => undefined)
      }
      await deleteStaleDirs(rootDir, limits.jobTtlMs, now, new Set(jobs.keys()))
    },
    async purgeAll() {
      for (const job of jobs.values()) halt(job)
      queue.splice(0, queue.length)
      await whenIdle()
      activeAborts.clear()
      for (const job of [...jobs.values()]) {
        jobs.delete(job.id)
        await rm(job.dir, { recursive: true, force: true }).catch(() => undefined)
      }
      await deleteStaleDirs(rootDir, 0, Date.now(), new Set())
    },
    whenIdle,
  }

  function engineFor(job: JobRecord): ImageUpscaleEngine {
    if (registry) return registry.resolve(job.options.engine)
    if (single && 'process' in single) return single
    return createLanczosEngine()
  }

  function halt(job: JobRecord): void {
    job.cancelRequested = true
    for (const item of job.items) {
      if (item.status === 'pending') item.status = 'cancelled'
    }
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (queue[i]?.jobId === job.id) queue.splice(i, 1)
    }
    activeAborts.get(job.id)?.abort()
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
    outputRevision: item.outputRevision,
    inputWidth: item.inputWidth,
    inputHeight: item.inputHeight,
    width: item.width,
    height: item.height,
    format: item.format,
    skippedResize: item.skippedResize,
    intermediateWidth: item.intermediateWidth,
    intermediateHeight: item.intermediateHeight,
    effectiveScale: item.effectiveScale,
    upscaleStage: item.upscaleStage,
    exportStage: item.exportStage,
    intermediateReused: item.intermediateReused,
    aiRan: item.aiRan,
  }
}

function allocateOutputName(
  job: JobRecord,
  item: ItemRecord,
  options: UpscaleOptions,
  exportWidth: number,
  exportHeight: number,
): string {
  const used = new Set<string>()
  for (const other of job.items) {
    if (other.id === item.id) continue
    if (other.outputName) used.add(other.outputName.toLowerCase())
  }
  return uniqueOutputName(item.name, options, used, exportWidth, exportHeight)
}

function hashUpscale(engine: UpscaleEngineId, scaleFactor: UpscaleOptions['scaleFactor'], effectiveScale: number, contentSha256: string): string {
  return createHash('sha256')
    .update(contentSha256)
    .update(serializeUpscaleParamsForHash(engine, scaleFactor, effectiveScale))
    .digest('hex')
    .slice(0, 32)
}

async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })
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
