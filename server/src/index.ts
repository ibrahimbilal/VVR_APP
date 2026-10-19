import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { moduleDir } from './moduleDir'
import multer from 'multer'
import { frameMetrics, isAllowedFps, isAllowedOutput } from '../../shared/frame'
import { resolveFade, sequenceDuration } from '../../shared/timeline'
import { checkFfmpeg } from './binaries'
import { cancelJob, createJob, getJob, jobOutput } from './jobs'
import { lookupUrl } from './oembed'
import { probeAudioFile, probeMedia, probeStill } from './probe'
import {
  addClip,
  clipIsBusy,
  ensureStorage,
  getClip,
  incomingDir,
  jobsDir,
  removeStoredClip,
  safeAudioExt,
  safeDownloadName,
  sweepStorage,
} from './storage'

const app = express()
app.disable('x-powered-by')
app.use(cors())
app.use(express.json({ limit: '1mb' }))

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HEX = /^#[0-9a-fA-F]{6}$/

const clipUpload = multer({
  dest: incomingDir,
  limits: { fileSize: 500 * 1024 * 1024, files: 1 },
})

const exportUpload = multer({
  dest: incomingDir,
  limits: { fileSize: 40 * 1024 * 1024, files: 31 },
})

app.get('/api/health', async (_req, res) => {
  const ffmpeg = await checkFfmpeg()
  res.json({ ok: ffmpeg, ffmpeg })
})

app.post('/api/clips', clipUpload.single('file'), async (req, res) => {
  const file = req.file
  if (!file) {
    res.status(400).json({ error: 'Choose a video file.' })
    return
  }
  try {
    if (!isVideoUpload(file)) throw new Error('Use an MP4, MOV, or WebM file.')
    const probed = await probeMedia(file.path)
    if (probed.duration > 20 * 60) throw new Error('Clips must be 20 minutes or shorter.')
    const stored = await addClip(file.path, file.originalname, probed)
    res.json({
      id: stored.id,
      duration: stored.duration,
      width: stored.width,
      height: stored.height,
      hasAudio: stored.hasAudio,
      size: stored.size,
      codec: probed.codec,
    })
  } catch (error) {
    await rm(file.path, { force: true }).catch(() => undefined)
    res.status(400).json({ error: messageOf(error, 'This file could not be imported.') })
  }
})

app.get('/api/clips/:id', (req, res) => {
  if (!UUID.test(req.params.id)) {
    res.status(400).json({ error: 'Unknown clip.' })
    return
  }
  const stored = getClip(req.params.id)
  if (!stored) {
    res.status(404).json({ error: 'That clip is no longer on the server. Upload it again.' })
    return
  }
  res.json({
    ok: true,
    id: stored.id,
    duration: stored.duration,
    width: stored.width,
    height: stored.height,
    hasAudio: stored.hasAudio,
    size: stored.size,
  })
})

app.delete('/api/clips/:id', async (req, res) => {
  if (!UUID.test(req.params.id)) {
    res.status(400).json({ error: 'Unknown clip.' })
    return
  }
  if (clipIsBusy(req.params.id)) {
    res.status(409).json({ error: 'This clip is part of a render that is still running.' })
    return
  }
  const removed = await removeStoredClip(req.params.id)
  if (!removed) {
    res.status(404).json({ error: 'That clip is already gone.' })
    return
  }
  res.json({ ok: true })
})

app.post('/api/import-url', async (req, res) => {
  const result = await lookupUrl(String(req.body?.url ?? ''))
  if (!result.ok) {
    res.status(400).json({ error: result.error })
    return
  }
  res.json(result)
})

app.post('/api/export', exportUpload.fields([{ name: 'overlays', maxCount: 30 }, { name: 'music', maxCount: 1 }]), async (req, res) => {
  const uploaded = collectUploads(req)
  try {
    if (!(await checkFfmpeg())) {
      throw new Error('FFmpeg is missing. Reinstall dependencies with npm install, then restart the server.')
    }
    const project = parseProject(req.body?.project)
    const overlays = sortedOverlays(uploaded.overlays, project.clips.length)
    const prepared = prepareClips(project)
    const id = randomUUID()
    const dir = path.join(jobsDir, id)
    await mkdir(dir, { recursive: true })
    const overlayPaths: string[] = []
    try {
      for (const overlay of overlays) {
        const destination = path.join(dir, `overlay-${overlay.index}.png`)
        await rename(overlay.file.path, destination)
        overlay.file.path = destination
        const still = await probeStill(destination)
        if (still.width !== prepared.metrics.width || still.height !== prepared.metrics.height) {
          throw new Error('A title overlay did not match the output resolution. Try the export again.')
        }
        overlayPaths[overlay.index] = destination
      }
      let musicPath: string | null = null
      const music = uploaded.music[0]
      if (music) {
        const ext = safeAudioExt(music.originalname)
        if (!ext) throw new Error('Background music must be an MP3, WAV, M4A, AAC, or OGG file.')
        musicPath = path.join(dir, `music${ext}`)
        await rename(music.path, musicPath)
        music.path = musicPath
        await probeAudioFile(musicPath)
      }
      const job = createJob(id, {
        clips: prepared.clips,
        overlays: overlayPaths,
        musicPath,
        width: prepared.metrics.width,
        height: prepared.metrics.height,
        fps: project.video.fps,
        bannerHeight: prepared.metrics.bannerHeight,
        bannerColor: project.video.bannerColor,
        scaleMode: project.video.scaleMode,
        backgroundColor: project.video.backgroundColor,
        transition: project.video.transition,
        fadeDuration: project.video.fadeDuration,
        keepAudio: project.video.keepAudio,
        normalize: project.video.normalize,
        originalVolume: project.video.originalVolume,
        musicVolume: project.video.musicVolume,
        downloadName: safeDownloadName(project.filename),
      })
      res.json({ jobId: job.id })
    } catch (error) {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined)
      throw error
    }
  } catch (error) {
    await Promise.all(uploaded.all.map((file) => rm(file.path, { force: true }).catch(() => undefined)))
    const status = error instanceof ClientError ? error.status : 400
    res.status(status).json({ error: messageOf(error, 'The export could not be started.') })
  }
})

app.get('/api/jobs/:id', (req, res) => {
  if (!UUID.test(req.params.id)) {
    res.status(400).json({ error: 'Unknown render.' })
    return
  }
  const job = getJob(req.params.id)
  if (!job) {
    res.status(404).json({ error: 'That render no longer exists.' })
    return
  }
  res.json(job)
})

app.post('/api/jobs/:id/cancel', (req, res) => {
  if (!UUID.test(req.params.id)) {
    res.status(400).json({ error: 'Unknown render.' })
    return
  }
  const job = cancelJob(req.params.id)
  if (!job) {
    res.status(404).json({ error: 'That render no longer exists.' })
    return
  }
  res.json(job)
})

app.get('/api/jobs/:id/download', (req, res) => {
  if (!UUID.test(req.params.id)) {
    res.status(400).json({ error: 'Unknown render.' })
    return
  }
  const output = jobOutput(req.params.id)
  if (!output) {
    res.status(409).json({ error: 'The export is not ready yet.' })
    return
  }
  res.download(output.path, output.name)
})

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found.' })
})

const clientDist = path.resolve(moduleDir(import.meta.url), '../../client/dist')
if (existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist))
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      next()
      return
    }
    res.sendFile(path.join(clientDist, 'index.html'), (error) => {
      if (error) next()
    })
  })
}

app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    const tooLarge = error.code === 'LIMIT_FILE_SIZE'
    res.status(tooLarge ? 413 : 400).json({
      error: tooLarge
        ? 'That file is too large. Videos must be 500 MB or smaller. Music and overlays must be 40 MB or smaller.'
        : 'The upload could not be accepted.',
    })
    return
  }
  next(error)
})

class ClientError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface ProjectClipInput {
  id: string
  trimStart: number
  trimEnd: number
}

interface ProjectInput {
  filename: string
  clips: ProjectClipInput[]
  video: {
    width: number
    height: number
    fps: number
    bannerHeight: number
    bannerColor: string
    scaleMode: 'crop' | 'fit' | 'blur'
    backgroundColor: string
    transition: 'cut' | 'fade'
    fadeDuration: number
    keepAudio: boolean
    normalize: boolean
    originalVolume: number
    musicVolume: number
  }
}

function parseProject(raw: unknown): ProjectInput {
  if (typeof raw !== 'string') throw new ClientError(400, 'The export settings were missing.')
  let data: Partial<ProjectInput>
  try {
    data = JSON.parse(raw) as Partial<ProjectInput>
  } catch {
    throw new ClientError(400, 'The export settings could not be read.')
  }
  if (!Array.isArray(data.clips) || data.clips.length < 2) {
    throw new ClientError(400, 'Add at least two clips before exporting.')
  }
  if (data.clips.length > 30) throw new ClientError(400, 'A compilation can include up to 30 clips.')
  const video = data.video
  if (!video || typeof video !== 'object') throw new ClientError(400, 'Video settings are missing.')
  if (!isAllowedOutput(Number(video.width), Number(video.height))) {
    throw new ClientError(400, 'Choose a 1080×1920 or 720×1280 export.')
  }
  if (!isAllowedFps(Number(video.fps))) throw new ClientError(400, 'Choose 24, 30, or 60 fps.')
  if (!HEX.test(String(video.bannerColor)) || !HEX.test(String(video.backgroundColor))) {
    throw new ClientError(400, 'Use hex colors for the banner and background.')
  }
  if (video.scaleMode !== 'crop' && video.scaleMode !== 'fit' && video.scaleMode !== 'blur') {
    throw new ClientError(400, 'Choose crop, fit, or blur for the video scale.')
  }
  if (video.transition !== 'cut' && video.transition !== 'fade') {
    throw new ClientError(400, 'Choose a hard cut or a crossfade.')
  }
  const clips = data.clips.map((clip) => {
    if (!clip || typeof clip.id !== 'string' || !UUID.test(clip.id)) {
      throw new ClientError(400, 'One of the clips is missing from the server. Upload it again.')
    }
    return {
      id: clip.id,
      trimStart: Number(clip.trimStart),
      trimEnd: Number(clip.trimEnd),
    }
  })
  return {
    filename: typeof data.filename === 'string' ? data.filename : 'ranking',
    clips,
    video: {
      width: Number(video.width),
      height: Number(video.height),
      fps: Number(video.fps),
      bannerHeight: Number(video.bannerHeight),
      bannerColor: String(video.bannerColor),
      scaleMode: video.scaleMode,
      backgroundColor: String(video.backgroundColor),
      transition: video.transition,
      fadeDuration: Number(video.fadeDuration),
      keepAudio: Boolean(video.keepAudio),
      normalize: Boolean(video.normalize),
      originalVolume: clampUnit(video.originalVolume),
      musicVolume: clampUnit(video.musicVolume),
    },
  }
}

function prepareClips(project: ProjectInput) {
  const metrics = frameMetrics(project.video.width, project.video.height, project.video.bannerHeight)
  if (
    metrics.width !== project.video.width ||
    metrics.height !== project.video.height ||
    metrics.bannerHeight !== project.video.bannerHeight
  ) {
    throw new ClientError(400, 'The layout numbers do not line up. Try the export again.')
  }
  const clips = project.clips.map((clip) => {
    const stored = getClip(clip.id)
    if (!stored) throw new ClientError(400, 'A source video is missing. Upload it again.')
    if (!Number.isFinite(clip.trimStart) || !Number.isFinite(clip.trimEnd)) {
      throw new ClientError(400, 'A clip has an invalid trim.')
    }
    const trimStart = Math.max(0, Math.min(clip.trimStart, stored.duration))
    const trimEnd = Math.max(0, Math.min(clip.trimEnd, stored.duration))
    if (trimEnd - trimStart < 0.3) throw new ClientError(400, 'Each clip must keep at least 0.3 seconds.')
    return {
      id: stored.id,
      path: stored.path,
      trimStart,
      trimEnd,
      hasAudio: stored.hasAudio,
    }
  })
  const durations = clips.map((clip) => clip.trimEnd - clip.trimStart)
  const fade = resolveFade(durations, project.video.transition, project.video.fadeDuration)
  const total = sequenceDuration(durations, fade)
  if (total > 30 * 60) throw new ClientError(400, 'Compilations must be 30 minutes or shorter.')
  return { clips, metrics, total }
}

function sortedOverlays(files: Express.Multer.File[], count: number): { index: number; file: Express.Multer.File }[] {
  const overlays = files.map((file) => {
    const match = /^overlay-(\d+)\.png$/i.exec(file.originalname)
    if (!match) throw new ClientError(400, 'Title overlays were missing or misnamed.')
    return { index: Number(match[1]), file }
  })
  overlays.sort((a, b) => a.index - b.index)
  if (overlays.length !== count || overlays.some((overlay, index) => overlay.index !== index)) {
    throw new ClientError(400, 'Each clip needs a title overlay. Try the export again.')
  }
  return overlays
}

function collectUploads(req: Request): { overlays: Express.Multer.File[]; music: Express.Multer.File[]; all: Express.Multer.File[] } {
  const files = req.files as { overlays?: Express.Multer.File[]; music?: Express.Multer.File[] } | undefined
  const overlays = files?.overlays ?? []
  const music = files?.music ?? []
  return { overlays, music, all: [...overlays, ...music] }
}

function isVideoUpload(file: Express.Multer.File): boolean {
  const ext = path.extname(file.originalname).toLowerCase()
  const extOk = ext === '.mp4' || ext === '.mov' || ext === '.webm' || ext === '.m4v'
  const typeOk = /^video\/(mp4|quicktime|webm|x-m4v)$/.test(file.mimetype)
  return extOk || typeOk
}

function clampUnit(value: unknown): number {
  const number = Number(value)
  if (!Number.isFinite(number)) return 1
  return Math.max(0, Math.min(1, number))
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

const port = Number(process.env.PORT) || 3001
const host = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1')

async function main(): Promise<void> {
  await ensureStorage()
  await sweepStorage()
  setInterval(() => {
    void sweepStorage()
  }, 10 * 60 * 1000)
  const ffmpegReady = await checkFfmpeg()
  const server = app.listen(port, host, () => {
    console.log(`VVR renderer at http://${host}:${port} (ffmpeg: ${ffmpegReady ? 'ready' : 'missing'})`)
  })
  server.requestTimeout = 0
  server.headersTimeout = 0
}

void main()
