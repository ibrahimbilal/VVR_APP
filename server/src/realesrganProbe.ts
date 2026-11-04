import { runNativeProcess } from './nativeProcess'

export interface RealesrganProbeResult {
  ok: boolean
  vulkanFailed: boolean
}

export type RealesrganProbe = (binary: string) => Promise<RealesrganProbeResult>

/** Starts the program with `-h` only. This does not upscale an image. */
export async function probeRealesrganBinary(binary: string): Promise<RealesrganProbeResult> {
  const result = await runNativeProcess(binary, ['-h'], { timeoutMs: 8000 })
  const text = `${result.stdout}\n${result.stderr}`
  if (/no vulkan|vulkan.*not (?:available|found)|vkEnumeratePhysicalDevices failed|failed to create .*vulkan/i.test(text)) {
    return { ok: false, vulkanFailed: true }
  }
  if (result.cancelled || result.timedOut) return { ok: false, vulkanFailed: false }
  if (result.code === 0 || /usage|realesrgan|upscayl|-i input/i.test(text)) return { ok: true, vulkanFailed: false }
  return { ok: false, vulkanFailed: false }
}
