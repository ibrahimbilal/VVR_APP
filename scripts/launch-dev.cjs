'use strict'

const { spawn } = require('node:child_process')
const { aiLiteEnvPatch } = require('./ai-lite-env.cjs')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const APP_URL = 'http://127.0.0.1:5173/'
const HEALTH_URL = 'http://127.0.0.1:5173/'

function findProjectRoot(startDir) {
  let dir = path.resolve(startDir)
  const root = path.parse(dir).root
  while (dir !== root) {
    const pkgPath = path.join(dir, 'package.json')
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
        if (pkg.name === 'ribo-studio') return dir
      } catch {
        /* ignore invalid package.json */
      }
    }
    dir = path.dirname(dir)
  }
  return null
}

function promoteLegacyEnvKeys() {
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('VVR_') || value === undefined) continue
    const riboKey = `RIBO_${key.slice(4)}`
    const existing = process.env[riboKey]
    if (existing !== undefined && String(existing).trim() !== '') continue
    process.env[riboKey] = value
  }
}

function loadRepoDotenv(projectRoot) {
  try {
    // Resolved via workspace hoisting (server depends on dotenv).
    require('dotenv').config({ path: path.join(projectRoot, '.env') })
    promoteLegacyEnvKeys()
    const clearIfEmpty = [
      'RIBO_REALESRGAN_BINARY',
      'RIBO_REALESRGAN_MODEL_DIR',
      'RIBO_REALESRGAN_ENGINE_DIR',
      'RIBO_REALESRGAN_PROJECT_ROOT',
    ]
    for (const key of clearIfEmpty) {
      if (process.env[key] !== undefined && String(process.env[key]).trim() === '') {
        delete process.env[key]
      }
    }
  } catch {
    /* optional until npm install */
  }
}

function runningAsSea() {
  try {
    return require('node:sea').isSea()
  } catch {
    return false
  }
}

function launcherStartDir() {
  if (process.pkg || runningAsSea()) return path.dirname(process.execPath)
  return path.join(__dirname, '..')
}

function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume()
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          resolve()
          return
        }
        schedule()
      })
      req.on('error', schedule)
      req.setTimeout(4000, () => {
        req.destroy()
        schedule()
      })
    }
    const schedule = () => {
      if (Date.now() >= deadline) {
        reject(new Error(`Timed out waiting for ${url}`))
        return
      }
      setTimeout(attempt, 500)
    }
    attempt()
  })
}

function openBrowser(url) {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref()
    return
  }
  const opener =
    process.platform === 'darwin' ? 'open' : process.platform === 'linux' ? 'xdg-open' : null
  if (opener) {
    spawn(opener, [url], { detached: true, stdio: 'ignore' }).unref()
  }
}

function spawnDev(projectRoot) {
  const { patch, standalone, probe } = aiLiteEnvPatch(projectRoot, process.env)
  const env = { ...process.env, ...patch }

  if (standalone) {
    if (probe?.ok) {
      console.log('[Ribo] AI Lite: Ready (standalone engine)')
    } else {
      console.log('[Ribo] AI Lite: Unavailable — missing engine, model, or Vulkan support')
    }
  }

  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/d', '/s', '/c', 'npm run dev'], {
      cwd: projectRoot,
      stdio: 'inherit',
      env,
      windowsHide: false,
    })
  }
  return spawn('npm', ['run', 'dev'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env,
  })
}

function fail(message) {
  console.error('\n[Ribo]', message)
  console.error('\nPress Enter to close.')
  process.stdin.resume()
  process.stdin.once('data', () => process.exit(1))
}

const projectRoot = findProjectRoot(launcherStartDir())
if (!projectRoot) {
  fail(
    'Could not find the Ribo project folder.\n' +
      'Keep RIBO-Dev.exe inside this repo (for example in dist\\) or run npm install once from the repo root.',
  )
  process.exitCode = 1
} else {
  const nodeModules = path.join(projectRoot, 'node_modules')
  if (!fs.existsSync(nodeModules)) {
    fail(
      `Dependencies are missing in:\n  ${projectRoot}\n\nRun once:\n  npm install`,
    )
    process.exitCode = 1
  } else {
    loadRepoDotenv(projectRoot)
    console.log('[Ribo] Project:', projectRoot)
    console.log('[Ribo] Starting dev server (same as npm run dev)...')
    console.log('[Ribo] Close this window to stop.\n')

    const child = spawnDev(projectRoot)

    let browserOpened = false
    const tryOpenBrowser = () => {
      if (browserOpened) return
      waitForHttp(HEALTH_URL, 120_000)
        .then(() => {
          browserOpened = true
          console.log('\n[Ribo] Opening', APP_URL)
          openBrowser(APP_URL)
        })
        .catch(() => {
          console.warn(
            '\n[Ribo] Editor did not respond in time; open manually:',
            APP_URL,
          )
        })
    }
    tryOpenBrowser()

    child.on('error', (err) => {
      console.error('[Ribo] Failed to start npm:', err.message)
      process.exit(1)
    })

    child.on('exit', (code, signal) => {
      if (signal) process.exit(1)
      process.exit(code ?? 0)
    })
  }
}
