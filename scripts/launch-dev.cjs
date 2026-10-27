'use strict'

const { spawn } = require('node:child_process')
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
        if (pkg.name === 'vvr-app') return dir
      } catch {
        /* ignore invalid package.json */
      }
    }
    dir = path.dirname(dir)
  }
  return null
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
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/d', '/s', '/c', 'npm run dev'], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: process.env,
      windowsHide: false,
    })
  }
  return spawn('npm', ['run', 'dev'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  })
}

function fail(message) {
  console.error('\n[VVR launcher]', message)
  console.error('\nPress Enter to close.')
  process.stdin.resume()
  process.stdin.once('data', () => process.exit(1))
}

const projectRoot = findProjectRoot(launcherStartDir())
if (!projectRoot) {
  fail(
    'Could not find the VVR project folder.\n' +
      'Keep VVR-Dev.exe inside this repo (for example in dist\\) or run npm install once from the repo root.',
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
    console.log('[VVR launcher] Project:', projectRoot)
    console.log('[VVR launcher] Starting dev server (same as npm run dev)...')
    console.log('[VVR launcher] Close this window to stop.\n')

    const child = spawnDev(projectRoot)

    let browserOpened = false
    const tryOpenBrowser = () => {
      if (browserOpened) return
      waitForHttp(HEALTH_URL, 120_000)
        .then(() => {
          browserOpened = true
          console.log('\n[VVR launcher] Opening', APP_URL)
          openBrowser(APP_URL)
        })
        .catch(() => {
          console.warn(
            '\n[VVR launcher] Editor did not respond in time; open manually:',
            APP_URL,
          )
        })
    }
    tryOpenBrowser()

    child.on('error', (err) => {
      console.error('[VVR launcher] Failed to start npm:', err.message)
      process.exit(1)
    })

    child.on('exit', (code, signal) => {
      if (signal) process.exit(1)
      process.exit(code ?? 0)
    })
  }
}
