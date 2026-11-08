<script setup lang="ts">
import { type ScaleFactor, type UpscaleEngineId } from '@shared/imageUpscaler'
import { computed } from 'vue'
import { useImageUpscalerStore } from '../stores/imageUpscaler'

const store = useImageUpscalerStore()
const scaleChoices: Array<{ id: ScaleFactor; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 1, label: '1×' },
  { id: 2, label: '2×' },
  { id: 3, label: '3×' },
  { id: 4, label: '4×' },
]
const ai = computed(() => store.capabilities?.engines['realesrgan-lite'] ?? null)
const aiReady = computed(() => ai.value?.available === true)
const engines: Array<{ id: UpscaleEngineId; label: string }> = [
  { id: 'lanczos3', label: 'Standard' },
  { id: 'realesrgan-lite', label: 'AI Lite' },
]
</script>

<template>
  <div class="space-y-5 mb-6">
    <div>
      <h2 class="section-label">Upscaling</h2>
      <p class="mt-2 text-xs font-medium text-zinc-400">Engine</p>
      <div class="mt-2 grid grid-cols-2 gap-2">
        <button
          v-for="engine in engines"
          :key="engine.id"
          class="btn cursor-pointer"
          :class="store.settings.engine === engine.id ? 'btn-primary' : 'btn-ghost'"
          type="button"
          :disabled="engine.id === 'realesrgan-lite' && !aiReady"
          :title="engine.id === 'realesrgan-lite' && !aiReady ? (ai?.reason ?? 'AI Lite is not available on this server.') : engine.label"
          @click="store.setEngine(engine.id)"
        >
          {{ engine.label }}
        </button>
      </div>
      <p class="mt-3 text-xs leading-relaxed text-zinc-500">Standard: Fast traditional resizing.</p>
      <p class="mt-2 text-xs leading-relaxed text-zinc-500">AI Lite: AI-assisted reconstruction for cleaner edges and textures. May alter fine artistic details.</p>
      <p v-if="!store.capabilities" class="mt-2 text-xs text-zinc-500">Checking whether AI Lite is available.</p>
      <p v-else-if="!aiReady" class="mt-2 text-xs leading-relaxed text-amber-200">{{ ai?.reason ?? 'AI Lite is not available on this server.' }}</p>
      <p v-else-if="store.settings.engine === 'realesrgan-lite' && ai?.matchesUpscaylLite" class="mt-2 text-xs leading-relaxed text-zinc-400">
        Model {{ ai?.model }}. This is the Upscayl Lite model at {{ ai?.scale }}×. The final exact size is still fitted here, so pixels can differ slightly from the Upscayl app.
      </p>
      <p v-else-if="store.settings.engine === 'realesrgan-lite'" class="mt-2 text-xs leading-relaxed text-amber-200">
        Model {{ ai?.model }}. This is not the Upscayl Lite model, so the look can differ from an Upscayl Lite export.
      </p>
    </div>

    <div>
      <p class="text-xs font-medium text-zinc-400">Factor</p>
      <p class="mt-1 text-xs text-zinc-500">The finished file uses this size, in the same format as the upload. JPEG is written at quality 100.</p>
      <div class="mt-3 grid grid-cols-5 gap-2">
        <button
          v-for="scale in scaleChoices"
          :key="String(scale.id)"
          class="btn cursor-pointer px-2 text-xs"
          :class="store.settings.scaleFactor === scale.id ? 'btn-primary' : 'btn-ghost'"
          type="button"
          @click="store.settings.scaleFactor = scale.id"
        >
          {{ scale.label }}
        </button>
      </div>
      <p class="mt-3 text-xs text-zinc-500">Auto picks a uniform factor up to 4×. AI Lite always infers at native 4×, then resizes to the effective factor.</p>
    </div>
  </div>
</template>
