export const WAVEFORM_MAX_BYTES = 16 * 1024 * 1024
export const WAVEFORM_BINS = 2048
export const WAVEFORM_UNPLAYED_OPACITY = 0.5
export const WAVEFORM_PLAYED_OPACITY = 1

export type WaveformMeta = {
  peaks: Float32Array
  duration: number
  channels: number
  sampleRate: number
}

export async function peaksFromAudioFile(file: File): Promise<WaveformMeta | null> {
  if (file.size > WAVEFORM_MAX_BYTES) return null
  const context = new AudioContext()
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer())
    const peaks = downsamplePeaks(buffer, WAVEFORM_BINS)
    return {
      peaks,
      duration: buffer.duration,
      channels: buffer.numberOfChannels,
      sampleRate: buffer.sampleRate,
    }
  } catch {
    return null
  } finally {
    await context.close().catch(() => undefined)
  }
}

export function playbackProgress(currentTime: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  if (!Number.isFinite(currentTime) || currentTime <= 0) return 0
  return Math.min(1, currentTime / duration)
}

export type SequencePeakTrack = {
  peaks: ArrayLike<number> | null
  /** Full decoded length that `peaks` covers. */
  duration: number
  trimStart: number
  /** Trimmed length placed on the sequence. */
  length: number
}

/**
 * One sequence period as a single peak envelope.
 * Tracks are laid out in order. A crossfade overlaps neighbors and keeps the louder sample.
 * The wrap overlap past the period is left off this cycle, matching the playhead.
 */
export function combineSequencePeaks(
  tracks: SequencePeakTrack[],
  crossfadeSeconds: number,
  bins = WAVEFORM_BINS,
): Float32Array | null {
  if (!tracks.some((track) => track.peaks && track.peaks.length > 0 && track.length > 0)) return null
  const count = Math.max(1, Math.floor(bins))
  const fade = tracks.length >= 2 ? Math.max(0, crossfadeSeconds) : 0
  let period = 0
  for (const track of tracks) period += Math.max(0, track.length)
  if (fade > 0) period -= tracks.length * fade
  if (!(period > 0)) return null

  const out = new Float32Array(count)
  let offset = 0
  for (const track of tracks) {
    const length = Math.max(0, track.length)
    const peaks = track.peaks
    if (peaks && peaks.length > 0 && track.duration > 0 && length > 0) {
      const visibleEnd = Math.min(period, offset + length)
      const binStart = Math.max(0, Math.floor((Math.max(0, offset) / period) * count))
      const binEnd = Math.min(count, Math.ceil((visibleEnd / period) * count))
      for (let bin = binStart; bin < binEnd; bin += 1) {
        const t0 = (bin / count) * period
        const t1 = ((bin + 1) / count) * period
        const file0 = track.trimStart + Math.max(0, t0 - offset)
        const file1 = track.trimStart + Math.min(length, t1 - offset)
        if (!(file1 > file0)) continue
        let i0 = Math.floor((file0 / track.duration) * peaks.length)
        let i1 = Math.ceil((file1 / track.duration) * peaks.length)
        i0 = Math.max(0, Math.min(peaks.length - 1, i0))
        i1 = Math.max(i0 + 1, Math.min(peaks.length, i1))
        let peak = 0
        for (let sample = i0; sample < i1; sample += 1) {
          const value = peaks[sample] ?? 0
          if (value > peak) peak = value
        }
        if (peak > (out[bin] ?? 0)) out[bin] = peak
      }
    }
    offset += Math.max(0, length - fade)
  }
  return out
}

export function resamplePeaks(peaks: ArrayLike<number>, bins: number): Float32Array {
  const count = Math.max(1, Math.floor(bins))
  const out = new Float32Array(count)
  const length = peaks.length
  if (length === 0) return out
  if (length === count) {
    for (let i = 0; i < count; i += 1) out[i] = peaks[i] ?? 0
    return out
  }
  const block = length / count
  for (let i = 0; i < count; i += 1) {
    const start = Math.floor(i * block)
    const end = Math.max(start + 1, Math.floor((i + 1) * block))
    let peak = 0
    for (let sample = start; sample < end && sample < length; sample += 1) {
      const value = peaks[sample] ?? 0
      if (value > peak) peak = value
    }
    out[i] = peak
  }
  return out
}

function downsamplePeaks(buffer: AudioBuffer, bins: number): Float32Array {
  const length = buffer.length
  const channels = buffer.numberOfChannels
  const peaks = new Float32Array(bins)
  const block = Math.max(1, Math.floor(length / bins))
  for (let i = 0; i < bins; i += 1) {
    const start = i * block
    const end = Math.min(length, start + block)
    let peak = 0
    for (let channel = 0; channel < channels; channel += 1) {
      const data = buffer.getChannelData(channel)
      for (let sample = start; sample < end; sample += 1) {
        const value = Math.abs(data[sample] ?? 0)
        if (value > peak) peak = value
      }
    }
    peaks[i] = peak
  }
  return peaks
}
