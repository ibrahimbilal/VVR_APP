<script setup lang="ts">
import { ArrowRight, Image as ThumbnailIcon, Sparkles, ListVideo, MonitorPlay } from '@lucide/vue'
import { RouterLink } from 'vue-router'

const apps = [
  {
    path: '/ranking-videos',
    title: 'Shorts',
    description:
      'Create vertical ranking and compilation videos with customizable titles, numbered clips, transitions, and audio.',
    icon: ListVideo,
  },
  {
    path: '/frame-screensaver',
    title: 'Screensaver',
    description:
      'Create long-form 16:9 ambient videos, digital art displays, and TV screensavers from images and videos.',
    icon: MonitorPlay,
  },
  {
    path: '/thumbnail-studio',
    title: 'Thumbnail Studio',
    description: 'Design YouTube thumbnails from your own images or from a Shorts or Screensaver project.',
    icon: ThumbnailIcon,
  },
  {
    path: '/image-upscaler',
    title: 'Image Upscaler',
    description:
      'Resize PNG, JPEG, and WebP images to exact Full HD, 2K, 4K, or 8K pixels with Lanczos3 resampling. It interpolates existing pixels and does not invent missing detail.',
    icon: Sparkles,
  },
]
</script>

<template>
  <div class="h-full overflow-y-auto p-6 md:p-10">
    <div class="mx-auto max-w-4xl">
      <h2 class="text-2xl font-black tracking-tight text-zinc-100">Applications</h2>
      <p class="mt-2 max-w-2xl text-sm text-zinc-400">
        Choose a video production tool. Each editor keeps its own project and export settings.
      </p>
      <div class="mt-8 grid gap-4 sm:grid-cols-2">
        <article
          v-for="app in apps"
          :key="app.path"
          class="flex flex-col rounded-xl border border-zinc-800 bg-[#14161c] p-5 transition-colors hover:border-zinc-700"
        >
          <div class="mb-4 grid h-11 w-11 place-items-center rounded-lg bg-brand/15 text-brand">
            <component :is="app.icon" :size="22" />
          </div>
          <h3 class="text-lg font-bold text-zinc-100">{{ app.title }}</h3>
          <p class="mt-2 flex-1 text-sm leading-relaxed text-zinc-400">{{ app.description }}</p>
          <RouterLink :to="app.path" class="btn btn-primary mt-5 w-full cursor-pointer sm:w-auto">
            Open Editor
            <ArrowRight :size="16" />
          </RouterLink>
        </article>
      </div>
    </div>
  </div>
</template>
