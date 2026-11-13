/**
 * Optional fetch: official NCNN runner (Real-ESRGAN release zip) + upscayl-lite-4x from the Upscayl repo.
 * Run from repo root: npm run setup:ai-lite
 *
 * Uses process.platform and process.arch; supports win32/x64 and linux/x64.
 */
import { chmodSync, createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { Extract } from 'unzipper'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { unsupportedAiLiteHostReason, standalonePlatformSubdir } = require('./ai-lite-platform.cjs')

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = path.join(repoRoot, 'tools', 'realesrgan', 'MANIFEST.json')
const layoutRoot = path.join(repoRoot, 'tools', 'realesrgan')

function httpsGetRedirect(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const fetch = (current, left) => {
      const lib = current.startsWith('https:') ? https : http
      lib
        .get(current, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && left > 0) {
            res.resume()
            fetch(new URL(res.headers.location, current).href, left - 1)
            return
          }
          if (res.statusCode !== 200) {
            res.resume()
            reject(new Error(`HTTP ${res.statusCode} for ${current}`))
            return
          }
          resolve(res)
        })
        .on('error', reject)
    }
    fetch(url, maxRedirects)
  })
}

async function downloadToFile(url, dest) {
  const res = await httpsGetRedirect(url)
  await mkdirSync(path.dirname(dest), { recursive: true })
  const file = createWriteStream(dest)
  await pipeline(res, file)
}

async function extractZip(zipPath, destDir) {
  await mkdirSync(destDir, { recursive: true })
  await pipeline(createReadStream(zipPath), Extract({ path: destDir }))
}

async function findFileRecursive(root, baseName) {
  const { readdir } = await import('node:fs/promises')
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        const hit = await walk(full)
        if (hit) return hit
      } else if (ent.name.toLowerCase() === baseName.toLowerCase()) {
        return full
      }
    }
    return null
  }
  return walk(root)
}

async function ensureModels(modelDir, manifest) {
  await mkdirSync(modelDir, { recursive: true })
  const urls = manifest.upscaylLite4xModel.files
  const paramPath = path.join(modelDir, 'upscayl-lite-4x.param')
  const binPath = path.join(modelDir, 'upscayl-lite-4x.bin')
  if (!existsSync(paramPath)) {
    console.log('Downloading', urls.param)
    await downloadToFile(urls.param, paramPath)
  } else {
    console.log('Reusing', paramPath)
  }
  if (!existsSync(binPath)) {
    console.log('Downloading', urls.bin)
    await downloadToFile(urls.bin, binPath)
  } else {
    console.log('Reusing', binPath)
  }
}

async function main() {
  const hostReason = unsupportedAiLiteHostReason(process.platform, process.arch)
  if (hostReason) {
    console.error(hostReason)
    process.exit(1)
  }
  if (!existsSync(manifestPath)) {
    console.error('Missing', manifestPath)
    process.exit(1)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const platformKey = process.platform === 'win32' ? 'win32' : 'linux'
  const platManifest = manifest.platforms?.[platformKey]
  if (!platManifest?.ncnnExecutable?.source) {
    console.error('No NCNN executable entry for', platformKey, 'in MANIFEST.json')
    process.exit(1)
  }

  const sub = standalonePlatformSubdir(process.platform, process.arch)
  const exeName = platManifest.ncnnExecutable.binaryName
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'ribo-ai-lite-'))
  const zipPath = path.join(tmp, 'ncnn.zip')
  try {
    console.log('Downloading', platManifest.ncnnExecutable.source)
    await downloadToFile(platManifest.ncnnExecutable.source, zipPath)
    const extractRoot = path.join(tmp, 'zip')
    await extractZip(zipPath, extractRoot)

    const foundExe = await findFileRecursive(extractRoot, exeName)
    if (!foundExe) throw new Error(`Could not find ${exeName} inside the zip`)

    const sourceDir = path.dirname(foundExe)
    const platDir = path.join(layoutRoot, sub)
    await rm(platDir, { recursive: true, force: true }).catch(() => undefined)
    await mkdirSync(path.dirname(platDir), { recursive: true })
    await cp(sourceDir, platDir, { recursive: true })

    const installedExe = path.join(platDir, exeName)
    if (process.platform === 'linux') {
      chmodSync(installedExe, 0o755)
      console.log('Set executable bit on', installedExe)
    }

    const modelDir = path.join(layoutRoot, 'models')
    await ensureModels(modelDir, manifest)

    if (platManifest.ncnnExecutable.compatibilityNotes) {
      console.log('\nCompatibility:', platManifest.ncnnExecutable.compatibilityNotes)
    }

    console.log('\nDone. Engine:', platDir)
    console.log('Models:', modelDir)
    console.log('Read tools/realesrgan/THIRD_PARTY_NOTICES.md before redistributing these files.')
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
