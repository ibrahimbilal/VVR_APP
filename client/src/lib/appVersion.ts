/** Application SemVer from root package.json (injected by Vite). */
export const APP_VERSION: string = __APP_VERSION__

export function formatAppVersion(prefix = 'v'): string {
  return `${prefix}${APP_VERSION}`
}
