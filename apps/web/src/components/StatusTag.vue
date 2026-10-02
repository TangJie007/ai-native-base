<script setup lang="ts">
import type { StatusMeta } from '@specforge/shared'

withDefaults(
  defineProps<{
    /** 来自 @specforge/shared 的展示元数据（ITEM_STATUS_META / PROJECT_STATUS_META 等） */
    meta: StatusMeta
    /** 覆盖默认文案 */
    label?: string
    size?: 'small' | 'default' | 'large'
    effect?: 'dark' | 'light' | 'plain'
    round?: boolean
  }>(),
  {
    label: undefined,
    size: 'small',
    effect: 'light',
    round: true,
  },
)
</script>

<template>
  <el-tag :type="meta.type" :size="size" :effect="effect" :round="round">
    {{ label ?? meta.label }}
  </el-tag>
</template>
