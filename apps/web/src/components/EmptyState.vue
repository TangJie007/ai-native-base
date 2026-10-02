<script setup lang="ts">
import { Box } from '@element-plus/icons-vue'

defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div
    class="flex flex-col items-center justify-center rounded-card bg-shell px-6 py-16 text-center shadow-soft"
  >
    <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-page">
      <el-icon :size="26" class="text-txt-faint"><Box /></el-icon>
    </div>
    <div class="mt-4 text-[14px] font-medium text-txt-primary">{{ title }}</div>
    <div v-if="description" class="mt-1.5 max-w-md text-[12.5px] leading-relaxed text-txt-mute">
      {{ description }}
    </div>
    <div class="mt-5">
      <slot />
    </div>
  </div>
</template>
