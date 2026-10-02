<script setup lang="ts">
withDefaults(
  defineProps<{
    value: string | number
    label: string
    suffix?: string
    /** 自定义数值区域样式（如字号、颜色） */
    valueClass?: string
  }>(),
  {
    suffix: '',
    valueClass: 'text-[26px] font-medium tracking-tight text-txt-primary',
  },
)
</script>

<template>
  <div class="rounded-card bg-shell p-6 shadow-soft">
    <div :class="valueClass">
      <slot>
        {{ value
        }}<span v-if="suffix" class="ml-0.5 text-[14px] text-txt-mute">{{ suffix }}</span>
      </slot>
    </div>
    <div class="mt-1 text-[12.5px] text-txt-mute">{{ label }}</div>
  </div>
</template>
