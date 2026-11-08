<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { navItems } from '../app/navigation'

const apps = computed(() => navItems.filter((item) => item.description))
</script>

<template>
  <div class="h-full overflow-y-auto p-6 md:p-10">
    <div class="mx-auto max-w-4xl">
      <h2 class="text-2xl font-black tracking-tight text-zinc-100">Applications</h2>
      <p class="mt-2 max-w-2xl text-sm text-zinc-400">
        Choose a video production tool. Each editor keeps its own project and export settings.
      </p>
      <div class="mt-8 grid gap-4 sm:grid-cols-2">
        <RouterLink
          v-for="app in apps"
          :key="app.path"
          :to="app.path"
          class="group flex flex-col rounded-xl border border-zinc-800 bg-elevated p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/50 hover:bg-elevated-hover hover:shadow-lg hover:shadow-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        >
          <div
            class="mb-4 grid h-11 w-11 place-items-center rounded-lg bg-brand/15 text-brand transition-colors group-hover:bg-brand/25"
          >
            <component :is="app.icon" :size="22" />
          </div>
          <h3 class="text-lg font-bold text-zinc-100">{{ app.label }}</h3>
          <p class="mt-2 flex-1 text-sm leading-relaxed text-zinc-400">{{ app.description }}</p>
        </RouterLink>
      </div>
    </div>
  </div>
</template>
