import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'

export interface NativeRunOptions {
  timeoutMs: number
  signal?: AbortSignal
  /** Captured stdout and stderr are each truncated to this many characters. */
  maxOutputBytes?: number
  onSpawn?: (pid: number) => void
}

export interface NativeRunResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  cancelled: boolean
}

/**
 * Runs one fixed executable. Arguments are an array, never a shell string.
 * The command must already be an absolute path chosen by the server.
 */
export async function runNativeProcess(command: string, args: readonly string[], options: NativeRunOptions): Promise<NativeRunResult> {
  if (!path.isAbsolute(command)) throw new Error('The program path must be absolute.')
  for (const arg of args) {
    if (typeof arg !== 'string' || arg.includes('\0')) throw new Error('Invalid program argument.')
  }
  if (options.signal?.aborted) {
    return { code: null, stdout: '', stderr: '', timedOut: false, cancelled: true }
  }

  const maxOutput = options.maxOutputBytes ?? 8192
  const stdout = { text: '' }
  const stderr = { text: '' }
  let timedOut = false
  let cancelled = false
  let settled = false

  const child = spawn(command, [...args], {
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  })
  if (child.pid) options.onSpawn?.(child.pid)

  collect(child.stdout, stdout, maxOutput)
  collect(child.stderr, stderr, maxOutput)

  const stop = (): void => {
    killProcessTree(child)
  }
  const onAbort = (): void => {
    if (settled) return
    cancelled = true
    stop()
  }
  options.signal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => {
    if (settled) return
    timedOut = true
    stop()
  }, Math.max(1, options.timeoutMs))

  const code = await new Promise<number | null>((resolve) => {
    child.once('error', () => {
      stop()
      resolve(null)
    })
    child.once('close', (exitCode) => resolve(exitCode))
  })

  settled = true
  clearTimeout(timer)
  options.signal?.removeEventListener('abort', onAbort)
  return {
    code,
    stdout: stdout.text,
    stderr: stderr.text,
    timedOut: timedOut && !cancelled,
    cancelled,
  }
}

export function killProcessTree(child: ChildProcess): void {
  const pid = child.pid
  if (!pid) return
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
      shell: false,
      windowsHide: true,
      stdio: 'ignore',
    })
    killer.unref()
    killer.on('error', () => {
      try {
        child.kill()
      } catch {
        // The process has already exited.
      }
    })
    try {
      child.kill()
    } catch {
      // The process has already exited.
    }
    return
  }
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    try {
      child.kill('SIGKILL')
    } catch {
      // The process has already exited.
    }
  }
}

function collect(stream: NodeJS.ReadableStream | null, bucket: { text: string }, maxOutput: number): void {
  stream?.on('data', (chunk: Buffer | string) => {
    if (bucket.text.length >= maxOutput) return
    const piece = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
    bucket.text += piece.slice(0, maxOutput - bucket.text.length)
  })
}
