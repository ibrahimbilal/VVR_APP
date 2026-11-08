import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import express, { type NextFunction, type Request, type Response, type Router } from 'express'
import multer from 'multer'
import {
  DEFAULT_AUDIO_LOOPER_LIMITS,
  importExtension,
  MIN_DURATION_SECONDS,
  normalizeSettings,
  outputExtension,
  TEST_MIN_DURATION_SECONDS,
} from '../../shared/audioLooper'
import { checkFfmpeg } from './binaries'
import { createAudioLooperJob } from './jobs'
import { probeAudioDetails } from './probe'
import { incomingDir, jobsDir, safeAudioExt } from './storage'

export function createAudioLooperRouter(): Router {
  const router = express.Router()
  const upload = multer({
    dest: incomingDir,
    limits: { fileSize: DEFAULT_AUDIO_LOOPER_LIMITS.maxFileBytes, files: 1 },
  })

  router.post('/export', upload.single('file'), async (req, res) => {
    const file = req.file
    let moved = false
    try {
      if (!(await checkFfmpeg())) {
        throw new Error('FFmpeg is missing. Reinstall dependencies with npm install, then restart the server.')
      }
      if (!file) {
        res.status(400).json({ error: 'Choose an audio file to loop.' })
        return
      }
      if (file.size < 64) {
        throw new Error('That audio file looks empty.')
      }
      if (file.size > DEFAULT_AUDIO_LOOPER_LIMITS.maxFileBytes) {
        throw new Error(`Audio files must be ${DEFAULT_AUDIO_LOOPER_LIMITS.maxFileBytes / (1024 * 1024)} MB or smaller.`)
      }

      let settingsRaw: unknown = req.body?.settings
      if (typeof settingsRaw === 'string') {
        try {
          settingsRaw = JSON.parse(settingsRaw) as unknown
        } catch {
          throw new Error('Loop settings are not valid JSON.')
        }
      }

      const minDuration =
        process.env.VVR_AUDIO_LOOPER_TEST === '1' ? TEST_MIN_DURATION_SECONDS : MIN_DURATION_SECONDS

      const ext = safeAudioExt(file.originalname) || looperExt(file.originalname)
      const probed = await probeAudioDetails(file.path)
      if (!probed.codec || probed.duration <= 0) {
        throw new Error('This file does not contain a readable audio stream.')
      }

      const settings = normalizeSettings(settingsRaw, {
        sourceDuration: probed.duration,
        minDurationSeconds: minDuration,
        maxFileBytes: DEFAULT_AUDIO_LOOPER_LIMITS.maxFileBytes,
      })

      const id = randomUUID()
      const dir = path.join(jobsDir, id)
      await mkdir(dir, { recursive: true })
      let created = false
      try {
        const sourcePath = path.join(dir, `source${ext || '.bin'}`)
        await rename(file.path, sourcePath)
        moved = true
        file.path = sourcePath

        const job = createAudioLooperJob(id, {
          sourcePath,
          sourceDuration: probed.duration,
          sourceSampleRate: probed.sampleRate,
          sourceChannels: probed.channels,
          settings,
          downloadName: settings.filename,
          outputExt: outputExtension(settings.format),
        })
        created = true
        res.json({ jobId: job.id })
      } catch (error) {
        if (!created) await rm(dir, { recursive: true, force: true }).catch(() => undefined)
        throw error
      }
    } catch (error) {
      if (file && !moved) {
        await rm(file.path, { force: true }).catch(() => undefined)
      }
      const status = statusOf(error)
      res.status(status).json({ error: messageOf(error, 'The loop could not be started.') })
    }
  })

  router.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === 'LIMIT_FILE_SIZE'
      res.status(tooLarge ? 413 : 400).json({
        error: tooLarge
          ? `Audio files must be ${DEFAULT_AUDIO_LOOPER_LIMITS.maxFileBytes / (1024 * 1024)} MB or smaller.`
          : 'The upload could not be accepted.',
      })
      return
    }
    next(error)
  })

  return router
}

function looperExt(name: string): string {
  const ext = importExtension(name)
  return ext ? `.${ext}` : ''
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function statusOf(error: unknown): number {
  const text = error instanceof Error ? error.message : ''
  if (/too large|smaller/i.test(text)) return 413
  if (/missing|FFmpeg/i.test(text) && /reinstall/i.test(text)) return 500
  return 400
}

export const audioLooperRouter = createAudioLooperRouter()
