import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const launcherDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(launcherDir, '..')
const iconPath = path.join(launcherDir, 'icon.ico')
const faviconIco = path.join(root, 'client', 'public', 'favicon.ico')
const outExe = path.join(root, 'Video factory.exe')
const projectFile = path.join(launcherDir, 'Launcher.csproj')

function findDotnet() {
  const candidates = []
  if (process.env.DOTNET_ROOT) candidates.push(path.join(process.env.DOTNET_ROOT, 'dotnet.exe'))
  if (process.env.ProgramFiles) candidates.push(path.join(process.env.ProgramFiles, 'dotnet', 'dotnet.exe'))
  if (process.env['ProgramFiles(x86)']) {
    candidates.push(path.join(process.env['ProgramFiles(x86)'], 'dotnet', 'dotnet.exe'))
  }
  try {
    const lines = execFileSync('where.exe', ['dotnet'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim()
      .split(/\r?\n/)
    for (const line of lines) candidates.push(line.trim())
  } catch {
    // not on PATH in this shell
  }
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate
  }
  return null
}

function ensureIcon() {
  if (fs.existsSync(iconPath)) return
  if (fs.existsSync(faviconIco)) {
    fs.copyFileSync(faviconIco, iconPath)
    console.log('[build:launcher] Copied client/public/favicon.ico → launcher/icon.ico')
    return
  }
  console.warn(
    '[build:launcher] No launcher/icon.ico — build without embedded icon.\n' +
      '  Add launcher/icon.ico (or client/public/favicon.ico) and rebuild.',
  )
}

function main() {
  ensureIcon()

  const dotnet = findDotnet()
  if (!dotnet) {
    console.error('[build:launcher] .NET SDK not found.')
    console.error('  Install .NET 8 SDK: https://dotnet.microsoft.com/download/dotnet/8.0')
    console.error('  Then run: npm run build:launcher')
    process.exit(1)
  }

  console.log('[build:launcher] Publishing self-contained launcher with', dotnet)
  const publishDir = path.join(launcherDir, 'bin', 'publish', 'Release')
  fs.rmSync(publishDir, { recursive: true, force: true })

  const args = [
    'publish',
    projectFile,
    '-c',
    'Release',
    '-r',
    'win-x64',
    '--self-contained',
    'true',
    '-p:PublishSingleFile=true',
    '-o',
    publishDir,
  ]

  const result = spawnSync(dotnet, args, { stdio: 'inherit', cwd: launcherDir })
  if (result.status !== 0) process.exit(result.status ?? 1)

  const built = path.join(publishDir, 'Video factory.exe')
  if (!fs.existsSync(built)) {
    console.error('[build:launcher] Missing output:', built)
    process.exit(1)
  }

  if (fs.existsSync(outExe)) fs.unlinkSync(outExe)
  fs.copyFileSync(built, outExe)
  console.log('[build:launcher] Done:', outExe)
}

main()
