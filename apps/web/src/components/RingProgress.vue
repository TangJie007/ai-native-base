<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 进度百分比 0-100 */
    value: number
    size?: number
    strokeWidth?: number
    color?: string
    trackColor?: string
  }>(),
  {
    size: 96,
    strokeWidth: 8,
    color: '#0B0B0F',
    trackColor: 'rgba(11, 11, 15, 0.15)',
  },
)

const radius = computed(() => (props.size - props.strokeWidth) / 2)
const center = computed(() => props.size / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const dash = computed(() => {
  const ratio = Math.min(100, Math.max(0, props.value)) / 100
  return `${ratio * circumference.value} ${circumference.value}`
})
</script>

<template>
  <div class="relative shrink-0" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg :viewBox="`0 0 ${size} ${size}`" class="h-full w-full -rotate-90">
      <circle
        :cx="center"
        :cy="center"
        :r="radius"
        fill="none"
        :stroke="trackColor"
        :stroke-width="strokeWidth"
      />
      <circle
        :cx="center"
        :cy="center"
        :r="radius"
        fill="none"
        :stroke="color"
        :stroke-width="strokeWidth"
        stroke-linecap="round"
        :stroke-dasharray="dash"
      />
    </svg>
    <div class="absolute inset-0 flex flex-col items-center justify-center">
      <slot>
        <span class="text-[18px] font-medium text-ink">{{ Math.round(value) }}%</span>
      </slot>
    </div>
  </div>
</template>
