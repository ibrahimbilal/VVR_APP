'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { describe, it, after } = require('node:test')
const {
  detectStandaloneEngine,
  aiLiteEnvPatch,
} = require('./ai-lite-env.cjs')
const { resolveStandaloneLayout } = require('./ai-lite-platform.cjs')

const root = path.join(os.tmpdir(), `ribo-ai-lite-env-${process.pid}`)

after(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

function layoutFor(platform) {
  const sub = platform === 'win32' ? 'win-x64' : 'linux-x64'
  const exe = platform === 'win32' ? 'realesrgan-ncnn-vulkan.exe' : 'realesrgan-ncnn-vulkan'
  const repo = path.join(root, platform)
  const binDir = path.join(repo, 'tools', 'realesrgan', sub)
  fs.mkdirSync(binDir, { recursive: true })
  const binPath = path.join(binDir, exe)
  fs.writeFileSync(binPath, '#!/bin/sh\necho usage realesrgan\n')
  if (platform === 'linux') {
    fs.chmodSync(binPath, 0o755)
  }
  const modelDir = path.join(repo, 'tools', 'realesrgan', 'models')
  fs.mkdirSync(modelDir, { recursive: true })
  fs.writeFileSync(path.join(modelDir, 'upscayl-lite-4x.param'), 'p')
  fs.writeFileSync(path.join(modelDir, 'upscayl-lite-4x.bin'), 'b')
  return { repo, binPath, modelDir }
}

describe('ai-lite-env (Windows)', () => {
  it('detects win-x64 layout', () => {
    const { repo, binPath, modelDir } = layoutFor('win32')
    const env = { RIBO_AI_UPSCALER_ENABLED: 'true' }
    const detected = detectStandaloneEngine(repo, env, { platform: 'win32', arch: 'x64' })
    assert.ok(detected)
    assert.equal(detected.binary, binPath)
    assert.equal(detected.modelDir, modelDir)
    const { patch } = aiLiteEnvPatch(repo, {})
    assert.equal(patch.RIBO_REALESRGAN_BINARY, binPath)
    assert.equal(patch.RIBO_REALESRGAN_PROJECT_ROOT, repo)
  })
})

describe('ai-lite-env (Linux)', () => {
  it('detects linux-x64 layout and shares models/', () => {
    const { repo, binPath, modelDir } = layoutFor('linux')
    const detected = detectStandaloneEngine(repo, {}, { platform: 'linux', arch: 'x64' })
    assert.ok(detected)
    assert.equal(detected.binary, binPath)
    assert.equal(detected.modelDir, modelDir)
    const layout = resolveStandaloneLayout(repo, {}, { platform: 'linux', arch: 'x64' })
    assert.equal(layout.sub, 'linux-x64')
    assert.equal(layout.binaryName, 'realesrgan-ncnn-vulkan')
  })

  it('skips unsupported arm64 hosts', () => {
    const { repo } = layoutFor('linux')
    assert.equal(detectStandaloneEngine(repo, {}, { platform: 'linux', arch: 'arm64' }), null)
  })
})

describe('ai-lite-env preserves overrides', () => {
  it('does not patch keys already set in the environment', () => {
    const { repo } = layoutFor('win32')
    const customBin = path.join(repo, 'custom-bin')
    fs.writeFileSync(customBin, 'x')
    const { patch } = aiLiteEnvPatch(repo, {
      RIBO_AI_UPSCALER_ENABLED: 'true',
      RIBO_REALESRGAN_BINARY: customBin,
      RIBO_REALESRGAN_MODEL_DIR: '/abs/models',
    })
    assert.equal(patch.RIBO_REALESRGAN_BINARY, undefined)
    assert.equal(patch.RIBO_REALESRGAN_MODEL_DIR, undefined)
    assert.equal(patch.RIBO_AI_UPSCALER_ENABLED, undefined)
  })
})
