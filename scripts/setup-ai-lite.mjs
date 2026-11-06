/**
 * Optional fetch: official NCNN runner (Real-ESRGAN release zip) + upscayl-lite-4x from the Upscayl repo.
 * Run from repo root: npm run setup:ai-lite
 */
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { Extract } from 'unzipper'

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

async function main() {
  if (process.platform !== 'win32') {
    console.error('This script only unpacks the Windows NCNN zip. Use Linux assets manually or extend the script.')
    process.exit(1)
  }
  if (!existsSync(manifestPath)) {
    console.error('Missing', manifestPath)
    process.exit(1)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

  const tmp = await mkdtemp(path.join(os.tmpdir(), 'vvr-ai-lite-'))
  const zipPath = path.join(tmp, 'ncnn.zip')
  try {
    console.log('Downloading', manifest.ncnnExecutable.source)
    await downloadToFile(manifest.ncnnExecutable.source, zipPath)
    const extractRoot = path.join(tmp, 'zip')
    await extractZip(zipPath, extractRoot)

    const exeName = path.basename(manifest.layout.binaryRelative)
    const foundExe = await findFileRecursive(extractRoot, exeName)
    if (!foundExe) throw new Error(`Could not find ${exeName} inside the zip`)

    const sourceDir = path.dirname(foundExe)
    const winDir = path.join(layoutRoot, 'win-x64')
    await rm(winDir, { recursive: true, force: true }).catch(() => undefined)
    await mkdirSync(path.dirname(winDir), { recursive: true })
    await cp(sourceDir, winDir, { recursive: true })

    const modelDir = path.join(layoutRoot, 'models')
    await mkdirSync(modelDir, { recursive: true })
    const urls = manifest.upscaylLite4xModel.files
    const paramUrl = urls.param
    const binUrl = urls.bin
    console.log('Downloading', paramUrl)
    await downloadToFile(paramUrl, path.join(modelDir, 'upscayl-lite-4x.param'))
    console.log('Downloading', binUrl)
    await downloadToFile(binUrl, path.join(modelDir, 'upscayl-lite-4x.bin'))

    console.log('\nDone. Engine:', winDir)
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
