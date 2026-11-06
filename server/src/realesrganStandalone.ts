import { existsSync } from 'node:fs'
import path from 'node:path'
import { vvrProjectRootFromThisModule } from './projectRoot'

export const STANDALONE_ENGINE_RELATIVE = path.join('tools', 'realesrgan')

/** Platform subdirectory under `tools/realesrgan` or under `VVR_REALESRGAN_ENGINE_DIR`. */
export function standalonePlatformDir(platform: NodeJS.Platform): string | null {
  if (platform === 'win32') return 'win-x64'
  if (platform === 'linux') return 'linux-x64'
  return null
}

function binaryName(platform: NodeJS.Platform): string | null {
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
}): StandalonePaths | null {
  const plat = standalonePlatformDir(opts.platform)
  const exe = binaryName(opts.platform)
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
 * Resolves VVR project root for AI Lite path logic: explicit env, then the server install (from import.meta.url).
 */
export function resolveVvrProjectRootForRealesrgan(
  env: Record<string, string | undefined>,
  metaUrl: string,
): { root: string | null; source: ProjectRootSource } {
  const fromEnv = env.VVR_REALESRGAN_PROJECT_ROOT?.trim()
  if (fromEnv) return { root: path.resolve(fromEnv), source: { kind: 'env', path: fromEnv } }

  const fromModule = vvrProjectRootFromThisModule(metaUrl)
  if (fromModule) return { root: fromModule, source: { kind: 'module', path: fromModule } }

  return { root: null, source: null }
}
