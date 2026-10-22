export const FRAME_IDS = ['none', 'classic', 'mat', 'rounded', 'arch'] as const

export type FrameId = (typeof FRAME_IDS)[number]

export interface NormRect {
  x: number
  y: number
  w: number
  h: number
}

export type FrameClip =
  | { kind: 'rect'; rect: NormRect }
  | { kind: 'round'; rect: NormRect; radius: number }
  | { kind: 'arch'; rect: NormRect }

export interface FramePreset {
  id: FrameId
  label: string
  clip: FrameClip
  /** Region filled between this rectangle and the opening. Null when there is no mat. */
  mat: NormRect | null
  matColor: string
  borderColor: string
  innerColor: string
}

export const FRAME_PRESETS: readonly FramePreset[] = [
  {
    id: 'none',
    label: 'No frame',
    clip: { kind: 'rect', rect: { x: 0, y: 0, w: 1, h: 1 } },
    mat: null,
    matColor: '#000000',
    borderColor: '#000000',
    innerColor: '#000000',
  },
  {
    id: 'classic',
    label: 'Classic',
    clip: { kind: 'rect', rect: { x: 0.055, y: 0.07, w: 0.89, h: 0.86 } },
    mat: null,
    matColor: '#1a120c',
    borderColor: '#1a120c',
    innerColor: '#c4a574',
  },
  {
    id: 'mat',
    label: 'Mat board',
    clip: { kind: 'rect', rect: { x: 0.14, y: 0.16, w: 0.72, h: 0.68 } },
    mat: { x: 0.045, y: 0.06, w: 0.91, h: 0.88 },
    matColor: '#f3ead7',
    borderColor: '#2a2118',
    innerColor: '#d8c7a2',
  },
  {
    id: 'rounded',
    label: 'Rounded',
    clip: { kind: 'round', rect: { x: 0.07, y: 0.09, w: 0.86, h: 0.82 }, radius: 0.06 },
    mat: null,
    matColor: '#111111',
    borderColor: '#161616',
    innerColor: '#3a3a3a',
  },
  {
    id: 'arch',
    label: 'Arch',
    clip: { kind: 'arch', rect: { x: 0.18, y: 0.08, w: 0.64, h: 0.84 } },
    mat: { x: 0.08, y: 0.04, w: 0.84, h: 0.92 },
    matColor: '#efe4d4',
    borderColor: '#3e2a1a',
    innerColor: '#c4a574',
  },
]

export function isFrameId(value: unknown): value is FrameId {
  return typeof value === 'string' && (FRAME_IDS as readonly string[]).includes(value)
}

export function framePreset(id: FrameId): FramePreset {
  return FRAME_PRESETS.find((preset) => preset.id === id) ?? FRAME_PRESETS[0]
}
