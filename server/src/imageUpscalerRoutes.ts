import { rm } from 'node:fs/promises'
import express, { type NextFunction, type Request, type Response, type Router } from 'express'
import multer from 'multer'
import { contentTypeForFormat, limitsFromEnv, normalizeOptions } from '../../shared/imageUpscaler'
import { createUpscalerRuntime, type UpscalerRuntime } from './imageUpscalerJobs'
import { publicError, UpscaleError } from './imageUpscaler'
import { incomingDir, upscalerDir } from './storage'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface ImageUpscalerRouteOptions {
  runtime: UpscalerRuntime
  incomingDir: string
}

export function createImageUpscalerRouter(options: ImageUpscalerRouteOptions): Router {
  const router = express.Router()
  const upload = multer({
    dest: options.incomingDir,
    limits: { fileSize: options.runtime.limits.maxFileBytes, files: options.runtime.limits.maxBatch },
  })

  router.post('/process', upload.single('file'), async (req, res) => {
    const file = req.file
    await accept(req, res, options.runtime, file ? [file] : [])
  })

  router.post('/batch', upload.array('files', options.runtime.limits.maxBatch), async (req, res) => {
    const files = Array.isArray(req.files) ? req.files : []
    await accept(req, res, options.runtime, files)
  })

  router.get('/jobs/:id', (req, res) => {
    if (!UUID.test(req.params.id)) {
      res.status(400).json({ error: 'Unknown upscale job.' })
      return
    }
    const job = options.runtime.get(req.params.id)
    if (!job) {
      res.status(404).json({ error: 'Unknown upscale job.' })
      return
    }
    res.json(job)
  })

  router.get('/jobs/:id/items/:itemId/download', (req, res) => {
    if (!UUID.test(req.params.id) || !UUID.test(req.params.itemId)) {
      res.status(400).json({ error: 'Unknown image.' })
      return
    }
    const file = options.runtime.itemOutput(req.params.id, req.params.itemId)
    if (!file) {
      res.status(409).json({ error: 'That image is not ready to download.' })
      return
    }
    res.setHeader('Content-Type', contentTypeForFormat(file.format))
    res.setHeader('Cache-Control', 'private, no-store')
    res.download(file.path, file.name)
  })

  router.get('/jobs/:id/items/:itemId/preview', (req, res) => {
    if (!UUID.test(req.params.id) || !UUID.test(req.params.itemId)) {
      res.status(400).json({ error: 'Unknown image.' })
      return
    }
    const file = options.runtime.itemPreview(req.params.id, req.params.itemId)
    if (!file) {
      res.status(404).json({ error: 'The comparison preview is not ready.' })
      return
    }
    res.setHeader('Content-Type', 'image/webp')
    res.setHeader('Cache-Control', 'private, no-store')
    res.sendFile(file)
  })

  router.get('/jobs/:id/download', async (req, res) => {
    if (!UUID.test(req.params.id)) {
      res.status(400).json({ error: 'Unknown upscale job.' })
      return
    }
    const job = options.runtime.get(req.params.id)
    if (!job) {
      res.status(404).json({ error: 'Unknown upscale job.' })
      return
    }
    if (!job.items.some((item) => item.status === 'completed')) {
      res.status(409).json({ error: 'No finished images are ready to download.' })
      return
    }
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', 'attachment; filename="upscaled-images.zip"')
    res.setHeader('Cache-Control', 'private, no-store')
    try {
      await options.runtime.writeZip(req.params.id, res)
      res.end()
    } catch (error) {
      if (!res.headersSent) res.status(500).json({ error: publicError(error, 'The ZIP could not be created.') })
      else res.destroy()
    }
  })

  router.delete('/jobs/:id', async (req, res) => {
    if (!UUID.test(req.params.id)) {
      res.status(400).json({ error: 'Unknown upscale job.' })
      return
    }
    const current = options.runtime.get(req.params.id)
    if (!current) {
      res.status(404).json({ error: 'Unknown upscale job.' })
      return
    }
    const purge = req.query.purge === '1'
    const active = current.status === 'queued' || current.status === 'running'
    if (active && !purge) {
      res.json(options.runtime.requestCancel(req.params.id))
      return
    }
    const removed = await options.runtime.remove(req.params.id)
    if (!removed) {
      res.status(404).json({ error: 'Unknown upscale job.' })
      return
    }
    res.json({ ok: true })
  })

  router.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === 'LIMIT_FILE_SIZE'
      const tooMany = error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE'
      const mb = Math.round(options.runtime.limits.maxFileBytes / (1024 * 1024))
      res.status(tooLarge ? 413 : 400).json({
        error: tooLarge
          ? `Each image must be ${mb} MB or smaller.`
          : tooMany
            ? `Upload at most ${options.runtime.limits.maxBatch} images at a time.`
            : 'The upload could not be accepted.',
      })
      return
    }
    next(error)
  })

  return router
}

async function accept(req: Request, res: Response, runtime: UpscalerRuntime, files: Express.Multer.File[]): Promise<void> {
  try {
    if (files.length < 1) throw new UpscaleError('Choose at least one image.')
    const rawOptions = req.body?.options
    if (typeof rawOptions !== 'string' || rawOptions.length > 8000) throw new UpscaleError('Upscale settings are missing.')
    let parsed: unknown
    try {
      parsed = JSON.parse(rawOptions)
    } catch {
      throw new UpscaleError('Upscale settings could not be read.')
    }
    const normalized = normalizeOptions(parsed, runtime.limits)
    const job = await runtime.submit(
      files.map((file) => ({ path: file.path, originalName: file.originalname || 'image' })),
      normalized.options,
      normalized.warnings,
    )
    res.json(job)
  } catch (error) {
    await Promise.all(files.map((file) => rm(file.path, { force: true }).catch(() => undefined)))
    const status = error instanceof UpscaleError ? 400 : 500
    res.status(status).json({ error: publicError(error, 'The images could not be accepted.') })
  }
}

const runtime = createUpscalerRuntime(upscalerDir, undefined, limitsFromEnv())

export const imageUpscalerRouter = createImageUpscalerRouter({
  runtime,
  incomingDir,
})

export function imageUpscalerRuntime(): UpscalerRuntime {
  return runtime
}

export async function sweepImageUpscaler(): Promise<void> {
  await runtime.sweep()
}

export async function purgeImageUpscaler(): Promise<void> {
  await runtime.purgeAll()
}
