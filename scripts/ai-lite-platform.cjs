'use strict'

/**
 * Standalone AI Lite host detection (mirrors server/src/realesrganStandalone.ts).
 * Uses process.platform and process.arch unless overrides are passed.
 */

function isSupportedAiLiteArch(arch) {
  return arch === 'x64'
}

function unsupportedAiLiteHostReason(platform, arch) {
  if (!isSupportedAiLiteArch(arch)) {
    return 'AI Lite supports 64-bit x86 (x64) only.'
  }
  if (platform !== 'win32' && platform !== 'linux') {
    return 'AI Lite supports Windows and Linux only.'
  }
  return null
}

function standalonePlatformSubdir(platform, arch) {
  if (unsupportedAiLiteHostReason(platform, arch)) return null
  if (platform === 'win32') return 'win-x64'
  if (platform === 'linux') return 'linux-x64'
  return null
}

function realesrganBinaryBaseName(platform) {
  if (platform === 'win32') return 'realesrgan-ncnn-vulkan.exe'
  if (platform === 'linux') return 'realesrgan-ncnn-vulkan'
  return null
}

function resolveStandaloneLayout(projectRoot, env = process.env, host = { platform: process.platform, arch: process.arch }) {
  const reason = unsupportedAiLiteHostReason(host.platform, host.arch)
  if (reason) return { ok: false, reason, sub: null, binaryName: null }

  const sub = standalonePlatformSubdir(host.platform, host.arch)
  const binaryName = realesrganBinaryBaseName(host.platform)
  if (!sub || !binaryName) return { ok: false, reason: 'AI Lite is not supported on this host.', sub: null, binaryName: null }

  const engineRoot = env.RIBO_REALESRGAN_ENGINE_DIR
    ? require('node:path').resolve(env.RIBO_REALESRGAN_ENGINE_DIR)
  : require('node:path').join(projectRoot, 'tools', 'realesrgan')

  return {
    ok: true,
    reason: null,
    sub,
    binaryName,
    engineRoot,
    defaultBinary: require('node:path').join(engineRoot, sub, binaryName),
    defaultModelDir: require('node:path').join(engineRoot, 'models'),
  }
}

module.exports = {
  isSupportedAiLiteArch,
  unsupportedAiLiteHostReason,
  standalonePlatformSubdir,
  realesrganBinaryBaseName,
  resolveStandaloneLayout,
}
