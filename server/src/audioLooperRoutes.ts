import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import express, { type NextFunction, type Request, type Response, type Router } from 'express'
import multer from 'multer'
import {
  alignExportTrims,
  DEFAULT_AUDIO_LOOPER_LIMITS,
  importExtension,
  MAX_AUDIO_LOOPER_TRACKS,
  MIN_DURATION_SECONDS,
  normalizeSettings,
  outputExtension,
  TEST_MIN_DURATION_SECONDS,
  type AudioLooperSettings,
} from '../../shared/audioLooper'
import { assertPlaylistTimeline, playlistPeriod } from '../../shared/audioLooperPlaylist'
import { checkFfmpeg } from './binaries'
import { createAudioLooperJob, renderQueueBusy } from './jobs'
import { probeAudioDetails, type AudioDetails } from './probe'
import { renderAudioLooper, type AudioLooperPlaylistSource } from './renderAudioLooper'
import { incomingDir, jobsDir, looperPreviewDir, safeAudioExt } from './storage'

export function createAudioLooperRouter(): Router {
  const router = express.Router()
  const upload = multer({
    dest: incomingDir,
    limits: { fileSize: DEFAULT_AUDIO_LOOPER_LIMITS.maxFileBytes, files: MAX_AUDIO_LOOPER_TRACKS },
  })
  const fields = upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'files', maxCount: MAX_AUDIO_LOOPER_TRACKS },
  ])

  router.post('/export', fields, async (req, res) => {
    const files = uploadedFiles(req)
    const pending = files.map((file) => file.path)
    let moved = false
    try {
      const prepared = await prepareUpload(files, req.body?.settings)
      const id = randomUUID()
      const dir = path.join(jobsDir, id)
      await mkdir(dir, { recursive: true })
      let created = false
      try {
        const stored = await moveSources(files, dir, prepared.sources)
        moved = true
        const job = createAudioLooperJob(id, {
          sourcePath: stored[0]?.path ?? '',
          sourceDuration: prepared.fileDuration,
          sourceSampleRate: prepared.sampleRate,
          sourceChannels: prepared.channels,
          settings: prepared.settings,
          sources: stored.length >= 2 ? stored : undefined,
          downloadName: prepared.settings.filename,
          outputExt: outputExtension(prepared.settings.format),
        })
        created = true
        res.json({ jobId: job.id })
      } catch (error) {
        if (!created) await rm(dir, { recursive: true, force: true }).catch(() => undefined)
        throw error
      }
    } catch (error) {
      if (!moved) await removePaths(pending)
      const status = statusOf(error)
      res.status(status).json({ error: messageOf(error, 'The loop could not be started.') })
    }
  })

  router.post('/preview', fields, async (req, res) => {
    const files = uploadedFiles(req)
    const pending = files.map((file) => file.path)
    let jobDir: string | null = null
    let previewPath: string | null = null
    let cancelled = false
    const cancel = () => {
      cancelled = true
    }
    req.on('close', () => {
      if (!res.writableEnded) cancel()
    })
    try {
      if (renderQueueBusy()) {
        res.status(409).json({ error: 'Wait for the current render to finish, then preview again.' })
        await removePaths(pending)
        return
      }
      const prepared = await prepareUpload(files, req.body?.settings)
      if (prepared.sources.length < 2 || !prepared.settings.normalizeLoudness) {
        throw new Error('Mix preview is for a playlist with loudness matching on.')
      }
      const period = playlistPeriod(
        prepared.sources.map((source) => source.trimEnd - source.trimStart),
        prepared.settings.playlistCrossfade ? prepared.settings.playlistCrossfadeSeconds : 0,
      )
      const previewTarget = period <= 20 ? Math.max(1, Math.round(period)) : 12
      const settings: AudioLooperSettings = {
        ...prepared.settings,
        format: 'wav',
        fadeInSeconds: 0,
        fadeOutSeconds: 0,
        targetDurationSeconds: previewTarget,
      }
      const id = randomUUID()
      jobDir = path.join(jobsDir, id)
      await mkdir(jobDir, { recursive: true })
      await mkdir(looperPreviewDir, { recursive: true })
      const stored = await moveSources(files, jobDir, prepared.sources)
      if (cancelled) throw new Error('The preview was cancelled.')
      const rendered = await renderAudioLooper(
        {
          id,
          sourcePath: stored[0]?.path ?? '',
          sourceDuration: prepared.fileDuration,
          sourceSampleRate: 48000,
          sourceChannels: 2,
          settings,
          sources: stored,
        },
        {
          cancelled: () => cancelled,
          onProgress: () => undefined,
          onStatus: () => undefined,
          registerKill: (kill) => {
            if (cancelled) kill()
            req.on('close', () => {
              if (!res.writableEnded) kill()
            })
          },
        },
      )
      previewPath = path.join(looperPreviewDir, `${id}.wav`)
      await rename(rendered.outputPath, previewPath)
      if (cancelled) throw new Error('The preview was cancelled.')
      const bytes = await readFile(previewPath)
      res.setHeader('Content-Type', 'audio/wav')
      res.setHeader('Cache-Control', 'no-store')
      res.send(bytes)
    } catch (error) {
      if (!res.headersSent) {
        const status = statusOf(error)
        res.status(status).json({ error: messageOf(error, 'The preview could not be created.') })
      }
    } finally {
      if (!res.headersSent) await removePaths(pending)
      if (previewPath) await rm(previewPath, { force: true }).catch(() => undefined)
      if (jobDir) await rm(jobDir, { recursive: true, force: true }).catch(() => undefined)
    }
  })

  router.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === 'LIMIT_FILE_SIZE'
      const tooMany = error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE'
      res.status(tooLarge ? 413 : 400).json({
        error: tooLarge
          ? `Audio files must be ${DEFAULT_AUDIO_LOOPER_LIMITS.maxFileBytes / (1024 * 1024)} MB or smaller.`
          : tooMany
            ? `Choose at most ${MAX_AUDIO_LOOPER_TRACKS} tracks.`
            : 'The upload could not be accepted.',
      })
      return
    }
    next(error)
  })

  return router
}

interface PreparedUpload {
  settings: AudioLooperSettings
  sources: AudioLooperPlaylistSource[]
  fileDuration: number
  sampleRate: number
  channels: number
}

async function prepareUpload(files: Express.Multer.File[], settingsField: unknown): Promise<PreparedUpload> {
  if (!(await checkFfmpeg())) {
    throw new Error('FFmpeg is missing. Reinstall dependencies with npm install, then restart the server.')
  }
  if (files.length === 0) {
    throw new Error('Choose an audio file to loop.')
  }
  if (files.length > MAX_AUDIO_LOOPER_TRACKS) {
    throw new Error(`Choose at most ${MAX_AUDIO_LOOPER_TRACKS} tracks.`)
  }
  for (const file of files) {
    if (file.size < 64) throw new Error('That audio file looks empty.')
    if (file.size > DEFAULT_AUDIO_LOOPER_LIMITS.maxFileBytes) {
      throw new Error(`Audio files must be ${DEFAULT_AUDIO_LOOPER_LIMITS.maxFileBytes / (1024 * 1024)} MB or smaller.`)
    }
  }

  let settingsRaw: unknown = settingsField
  if (typeof settingsRaw === 'string') {
    try {
      settingsRaw = JSON.parse(settingsRaw) as unknown
    } catch {
      throw new Error('Loop settings are not valid JSON.')
    }
  }

  const minDuration = process.env.RIBO_AUDIO_LOOPER_TEST === '1' ? TEST_MIN_DURATION_SECONDS : MIN_DURATION_SECONDS
  const settings = normalizeSettings(settingsRaw, { minDurationSeconds: minDuration })
  const probed: AudioDetails[] = []
  for (const file of files) {
    const details = await probeAudioDetails(file.path)
    if (!details.codec || details.duration <= 0) {
      throw new Error('This file does not contain a readable audio stream.')
    }
    probed.push(details)
  }

  const trims = alignExportTrims(
    settings.tracks,
    probed.map((item) => item.duration),
  )
  settings.tracks = trims
  const trimmedDurations = trims.map((trim) => trim.trimEnd - trim.trimStart)
  if (files.length >= 2) {
    assertPlaylistTimeline(trimmedDurations, settings.playlistCrossfade, settings.playlistCrossfadeSeconds)
  } else {
    const trimmed = trimmedDurations[0] ?? probed[0]?.duration ?? 0
    normalizeSettings(settings, { sourceDuration: trimmed, minDurationSeconds: minDuration })
  }

  const sources: AudioLooperPlaylistSource[] = files.map((file, index) => {
    const details = probed[index]
    const trim = trims[index]
    return {
      path: file.path,
      duration: details?.duration ?? 0,
      sampleRate: details?.sampleRate ?? 0,
      channels: details?.channels ?? 0,
      trimStart: trim?.trimStart ?? 0,
      trimEnd: trim?.trimEnd ?? details?.duration ?? 0,
    }
  })
  const first = probed[0]
  return {
    settings,
    sources,
    fileDuration: first?.duration ?? 0,
    sampleRate: files.length >= 2 ? 48000 : (first?.sampleRate ?? 0),
    channels: files.length >= 2 ? 2 : (first?.channels ?? 0),
  }
}

async function moveSources(
  files: Express.Multer.File[],
  dir: string,
  sources: AudioLooperPlaylistSource[],
): Promise<AudioLooperPlaylistSource[]> {
  const moved: AudioLooperPlaylistSource[] = []
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    const source = sources[index]
    if (!file || !source) continue
    const ext = safeAudioExt(file.originalname) || looperExt(file.originalname)
    const sourcePath = path.join(dir, `source-${index}${ext || '.bin'}`)
    await rename(file.path, sourcePath)
    file.path = sourcePath
    moved.push({ ...source, path: sourcePath })
  }
  return moved
}

function uploadedFiles(req: Request): Express.Multer.File[] {
  const bag = req.files as Record<string, Express.Multer.File[]> | undefined
  const many = bag?.files ?? []
  if (many.length > 0) return many
  return bag?.file ?? []
}

function looperExt(name: string): string {
  const ext = importExtension(name)
  return ext ? `.${ext}` : ''
}

async function removePaths(paths: string[]): Promise<void> {
  await Promise.all(paths.map((file) => rm(file, { force: true }).catch(() => undefined)))
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function statusOf(error: unknown): number {
  const text = error instanceof Error ? error.message : ''
  if (/too large|smaller/i.test(text)) return 413
  if (/wait for the current render/i.test(text)) return 409
  if (/missing|FFmpeg/i.test(text) && /reinstall/i.test(text)) return 500
  return 400
}

export const audioLooperRouter = createAudioLooperRouter()
