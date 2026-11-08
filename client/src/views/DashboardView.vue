<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { navItems } from '../app/navigation'

const apps = computed(() => navItems.filter((item) => item.description))
const featured = computed(() => apps.value.filter((item) => item.path === '/ranking-videos' || item.path === '/screensaver'))
const rest = computed(() => apps.value.filter((item) => item.path !== '/ranking-videos' && item.path !== '/screensaver'))
</script>

<template>
  <div class="studio-shell h-full overflow-y-auto">
    <div class="mx-auto grid max-w-6xl gap-10 px-5 py-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:px-10 lg:py-12">
      <section class="lg:sticky lg:top-12 lg:self-start">
        <img src="/logo.png" alt="" class="h-16 w-16 object-contain" />
        <p class="mt-8 text-xs font-semibold uppercase tracking-[0.22em] text-brand">Creative studio</p>
        <h2 class="mt-3 text-4xl font-black leading-none tracking-tight text-zinc-50">Video's Factory</h2>
        <p class="mt-4 max-w-xs text-sm leading-relaxed text-zinc-400">
          A workspace for vertical compilations, ambient video, thumbnails, stills, and long audio beds. Each tool keeps its own project.
        </p>
      </section>

      <div class="grid gap-3">
        <div class="grid gap-3 md:grid-cols-2">
          <RouterLink
            v-for="app in featured"
            :key="app.path"
            :to="app.path"
            class="group relative min-h-52 overflow-hidden rounded-2xl border border-white/10 bg-elevated p-6 transition duration-200 hover:-translate-y-0.5 hover:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Open</p>
            <h3 class="mt-3 text-2xl font-black text-zinc-50">{{ app.label }}</h3>
            <p class="relative mt-2 max-w-sm text-sm leading-relaxed text-zinc-400">{{ app.description }}</p>
          </RouterLink>
        </div>
        <div class="grid gap-3 md:grid-cols-3">
          <RouterLink
            v-for="app in rest"
            :key="app.path"
            :to="app.path"
            class="group flex flex-col rounded-2xl border border-white/10 bg-[#12141a] p-5 transition duration-200 hover:-translate-y-0.5 hover:border-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <component :is="app.icon" class="text-brand" :size="22" />
            <h3 class="mt-4 text-lg font-bold text-zinc-50">{{ app.label }}</h3>
            <p class="mt-2 flex-1 text-sm leading-relaxed text-zinc-400">{{ app.description }}</p>
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
