import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import {
  isSupportedAiLiteArch,
  realesrganBinaryBaseName,
  resolveStandalonePaths,
  standalonePlatformDir,
  unsupportedAiLiteHostReason,
} from './realesrganStandalone'

describe('AI Lite host detection', () => {
  it('accepts win32/linux on x64 only', () => {
    assert.equal(isSupportedAiLiteArch('x64'), true)
    assert.equal(isSupportedAiLiteArch('arm64'), false)
    assert.equal(unsupportedAiLiteHostReason('darwin', 'x64'), 'AI Lite supports Windows and Linux only.')
    assert.equal(unsupportedAiLiteHostReason('linux', 'arm64')?.includes('x64'), true)
    assert.equal(unsupportedAiLiteHostReason('win32', 'x64'), null)
    assert.equal(unsupportedAiLiteHostReason('linux', 'x64'), null)
  })

  it('maps platform to install subdirs and binary names', () => {
    assert.equal(standalonePlatformDir('win32', 'x64'), 'win-x64')
    assert.equal(standalonePlatformDir('linux', 'x64'), 'linux-x64')
    assert.equal(standalonePlatformDir('linux', 'arm64'), null)
    assert.equal(realesrganBinaryBaseName('win32'), 'realesrgan-ncnn-vulkan.exe')
    assert.equal(realesrganBinaryBaseName('linux'), 'realesrgan-ncnn-vulkan')
  })
})

const root = path.join(os.tmpdir(), `vvr-standalone-${process.pid}`)
after(async () => {
  const { rm } = await import('node:fs/promises')
  await rm(root, { recursive: true, force: true })
})

describe('standalone path resolution', () => {
  it('resolves Windows and Linux layouts from project root', async () => {
    for (const plat of ['win32', 'linux'] as const) {
      const sub = plat === 'win32' ? 'win-x64' : 'linux-x64'
      const exe = plat === 'win32' ? 'realesrgan-ncnn-vulkan.exe' : 'realesrgan-ncnn-vulkan'
      const repo = path.join(root, plat)
      const binDir = path.join(repo, 'tools', 'realesrgan', sub)
      await mkdir(binDir, { recursive: true })
      await writeFile(path.join(binDir, exe), 'stub')
      await mkdir(path.join(repo, 'tools', 'realesrgan', 'models'), { recursive: true })

      const resolved = resolveStandalonePaths({
        projectRoot: repo,
        engineRootOverride: null,
        platform: plat,
        arch: 'x64',
      })
      assert.ok(resolved)
      assert.equal(resolved!.binary, path.join(binDir, exe))
      assert.equal(existsSync(resolved!.binary), true)
    }
  })
})
