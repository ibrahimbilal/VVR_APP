/**
 * Hostinger deploy archive (vvr-app.zip). Standard ZIP via archiver — opens in Windows Explorer.
 * Run from repo root: node scripts/make-deploy-archive.mjs
 */
import { ZipArchive } from 'archiver'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outPath = path.join(repoRoot, 'vvr-app.zip')

const SKIP_ROOT = new Set(['vvr-app.zip', 'node_modules', 'launcher', '.git'])

function archivePath(rel) {
  return rel.split(path.sep).join('/')
}

function shouldSkip(rel, entryName, isDirectory) {
  const norm = archivePath(rel)
  const parts = norm.split('/').filter(Boolean)
  if (parts.length === 0) return true
  if (parts[0] === 'launcher') return true
  if (parts.includes('.git')) return true
  if (parts.includes('node_modules')) return true
  if (parts[0] === 'server' && parts[1] === 'tmp') return true
  // Windows NCNN runner + DLLs — do not ship to Linux shared hosting
  if (parts[0] === 'tools' && parts[1] === 'realesrgan' && parts[2] === 'win-x64') return true
  if (!isDirectory && /\.exe$/i.test(entryName)) return true
  return false
}

function collectFiles(dir, relBase, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = relBase ? path.join(relBase, ent.name) : ent.name
    if (shouldSkip(rel, ent.name, ent.isDirectory())) continue
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      collectFiles(full, rel, out)
    } else {
      out.push({ full, name: archivePath(rel) })
    }
  }
}

const files = []
for (const ent of fs.readdirSync(repoRoot, { withFileTypes: true })) {
  if (SKIP_ROOT.has(ent.name)) continue
  if (ent.isFile() && /\.exe$/i.test(ent.name)) continue
  const full = path.join(repoRoot, ent.name)
  const rel = ent.name
  if (shouldSkip(rel, ent.name, ent.isDirectory())) continue
  if (ent.isDirectory()) {
    collectFiles(full, rel, files)
  } else {
    files.push({ full, name: archivePath(rel) })
  }
}

if (files.length === 0) {
  console.error('Nothing to archive.')
  process.exit(1)
}

if (fs.existsSync(outPath)) {
  fs.unlinkSync(outPath)
}

await new Promise((resolve, reject) => {
  const output = fs.createWriteStream(outPath)
  const archive = new ZipArchive({ zlib: { level: 9 } })

  output.on('close', resolve)
  archive.on('error', reject)
  output.on('error', reject)

  archive.pipe(output)
  for (const { full, name } of files) {
    archive.file(full, { name })
  }
  archive.finalize()
})

const bytes = fs.statSync(outPath).size
console.log(`Created vvr-app.zip (${bytes} bytes, ${files.length} files)`)
