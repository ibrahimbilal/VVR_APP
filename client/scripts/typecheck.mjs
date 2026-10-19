// vue-tsc still loads the TypeScript 6 compiler API. TypeScript 7 is a native compiler and does not expose that API.
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const typescript6 = createRequire(require.resolve('@typescript/typescript6/package.json'))
const tscPath = typescript6.resolve('@typescript/old/lib/tsc.js')

process.argv = [process.argv[0], require.resolve('vue-tsc/bin/vue-tsc.js'), '--noEmit']
require('vue-tsc').run(tscPath)
