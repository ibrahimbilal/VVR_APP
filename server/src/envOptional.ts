/**
 * Treat missing or whitespace-only env values as unset (e.g. `.env` lines like `KEY=`).
 */
export function envOptional(env: Record<string, string | undefined>, key: string): string | undefined {
  const v = env[key]
  if (v === undefined) return undefined
  const t = v.trim()
  return t === '' ? undefined : t
}
