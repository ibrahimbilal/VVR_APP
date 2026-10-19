import ffmpegPath from 'ffmpeg-static'
import ffprobe from 'ffprobe-static'
import { execFile, type ExecFileOptions } from 'node:child_process'

export function execFileAsync(file: string, args: readonly string[], options: ExecFileOptions = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { ...options, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        reject(error)
        return
      }
      resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
    })
  })
}

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

export async function logEncodeCheck(): Promise<void> {
  const attempts: [string, string[]][] = [
    [
      'limited',
      ['-hide_banner', '-loglevel', 'error', '-threads', '1', '-filter_threads', '1', '-filter_complex_threads', '1', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=0.1:r=24', '-frames:v', '1', '-f', 'null', '-'],
    ],
    [
      'plain',
      ['-hide_banner', '-loglevel', 'error', '-threads', '1', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=0.1:r=24', '-frames:v', '1', '-f', 'null', '-'],
    ],
  ]
  for (const [name, args] of attempts) {
    try {
      await execFileAsync(ffmpegBinary(), args, { windowsHide: true, maxBuffer: 2 * 1024 * 1024 })
      console.log(`ffmpeg smoke ${name}: ok`)
    } catch (error) {
      const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr ?? '') : ''
      console.error(`ffmpeg smoke ${name}: ${(stderr || (error instanceof Error ? error.message : 'failed')).trim().slice(-1500)}`)
    }
  }
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
