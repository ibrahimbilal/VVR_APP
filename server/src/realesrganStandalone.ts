import { existsSync } from 'node:fs'
import path from 'node:path'
import { riboProjectRootFromThisModule } from './projectRoot'

export const STANDALONE_ENGINE_RELATIVE = path.join('tools', 'realesrgan')

/** AI Lite standalone targets: Windows and Ubuntu-class Linux on x86-64 only. */
export function isSupportedAiLiteArch(arch: NodeJS.Architecture | string): boolean {
  return arch === 'x64'
}

export function unsupportedAiLiteHostReason(platform: NodeJS.Platform, arch: NodeJS.Architecture | string): string | null {
  if (!isSupportedAiLiteArch(arch)) {
    return `AI Lite supports 64-bit x86 (${arch}) hosts only when arch is x64.`
  }
  if (platform !== 'win32' && platform !== 'linux') {
    return 'AI Lite supports Windows and Linux only.'
  }
  return null
}

/**
 * Subfolder under `tools/realesrgan` for the current host OS + CPU, e.g. `win-x64` or `linux-x64`.
 */
export function standalonePlatformDir(platform: NodeJS.Platform, arch: NodeJS.Architecture | string = process.arch): string | null {
  if (unsupportedAiLiteHostReason(platform, arch)) return null
  if (platform === 'win32') return 'win-x64'
  if (platform === 'linux') return 'linux-x64'
  return null
}

export function realesrganBinaryBaseName(platform: NodeJS.Platform): string | null {
  if (platform === 'win32') return 'realesrgan-ncnn-vulkan.exe'
  if (platform === 'linux') return 'realesrgan-ncnn-vulkan'
  return null
}

export interface StandalonePaths {
  binary: string
  modelDir: string
}

/**
 * Resolves bundled / copied engine paths under the repo:
 * `<engineRoot>/<plat>/realesrgan-ncnn-vulkan[.exe]` and `<engineRoot>/models/`.
 */
export function resolveStandalonePaths(opts: {
  projectRoot: string | null
  engineRootOverride: string | null
  platform: NodeJS.Platform
  arch?: NodeJS.Architecture | string
}): StandalonePaths | null {
  const plat = standalonePlatformDir(opts.platform, opts.arch ?? process.arch)
  const exe = realesrganBinaryBaseName(opts.platform)
  if (!plat || !exe) return null

  const roots: string[] = []
  if (opts.engineRootOverride) roots.push(opts.engineRootOverride)
  if (opts.projectRoot) roots.push(path.join(opts.projectRoot, STANDALONE_ENGINE_RELATIVE))

  for (const root of roots) {
    const binary = path.join(root, plat, exe)
    const modelDir = path.join(root, 'models')
    if (existsSync(binary) && existsSync(modelDir)) return { binary, modelDir }
  }
  return null
}

export type ProjectRootSource = { kind: 'env'; path: string } | { kind: 'module'; path: string } | null

/**
 * Resolves Ribo project root for AI Lite path logic: explicit env, then the server install (from import.meta.url).
 */
export function resolveRiboProjectRootForRealesrgan(
  env: Record<string, string | undefined>,
  metaUrl: string,
): { root: string | null; source: ProjectRootSource } {
  const fromEnv = env.RIBO_REALESRGAN_PROJECT_ROOT?.trim()
  if (fromEnv) return { root: path.resolve(fromEnv), source: { kind: 'env', path: fromEnv } }

  const fromModule = riboProjectRootFromThisModule(metaUrl)
  if (fromModule) return { root: fromModule, source: { kind: 'module', path: fromModule } }

  return { root: null, source: null }
}
