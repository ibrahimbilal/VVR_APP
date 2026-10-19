import ffmpegPath from 'ffmpeg-static'
import ffprobe from 'ffprobe-static'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

export const execFileAsync = promisify(execFile)

export function ffmpegBinary(): string {
  if (!ffmpegPath) {
    throw new Error('FFmpeg binary is missing. Reinstall dependencies with npm install.')
  }
  return ffmpegPath
}

export function ffprobeBinary(): string {
  if (!ffprobe?.path) {
    throw new Error('FFprobe binary is missing. Reinstall dependencies with npm install.')
  }
  return ffprobe.path
}

let ffmpegReady: boolean | null = null

export async function checkFfmpeg(): Promise<boolean> {
  if (ffmpegReady === true) return true
  try {
    await execFileAsync(ffmpegBinary(), ['-version'], { windowsHide: true })
    await execFileAsync(ffprobeBinary(), ['-version'], { windowsHide: true })
    ffmpegReady = true
  } catch {
    ffmpegReady = false
  }
  return ffmpegReady
}
