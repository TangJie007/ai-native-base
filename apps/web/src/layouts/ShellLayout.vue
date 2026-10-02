<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Box,
  CircleCheck,
  Cpu,
  Document,
  Folder,
  Key,
  MagicStick,
  Odometer,
  Setting,
  Share,
  SwitchButton,
  Timer,
  User,
} from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { useProjectStore } from '@/stores/project'

interface NavItem {
  name: string
  label: string
  icon: Component
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const projectStore = useProjectStore()

const groups: { title: string; items: NavItem[] }[] = [
  {
    title: '',
    items: [
      { name: 'dashboard', label: '工作台', icon: Odometer },
      { name: 'projects', label: '项目', icon: Folder },
      { name: 'requirements', label: '需求解析', icon: Document },
    ],
  },
  {
    title: '构建流水线',
    items: [
      { name: 'assumptions', label: '假设确认', icon: Key },
      { name: 'contract', label: '契约锁定', icon: MagicStick },
      { name: 'dependencies', label: '依赖编排', icon: Share },
      { name: 'pipeline', label: '生成监控', icon: Cpu },
      { name: 'regression', label: '人工回归', icon: CircleCheck },
      { name: 'sandbox', label: '沙箱预览', icon: Box },
    ],
  },
  {
    title: '洞察',
    items: [{ name: 'trace', label: 'Trace 轨迹', icon: Timer }],
  },
]

const pageTitle = computed(() => (route.meta.title as string) || '')

// 导航时携带当前项目上下文，保证页面切换不丢失 projectId
function navTarget(name: string) {
  return {
    name,
    query: projectStore.currentId ? { projectId: projectStore.currentId } : undefined,
  }
}

function handleLogout() {
  auth.logout()
  router.replace({ path: '/login' })
}
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-page">
    <aside class="flex w-60 shrink-0 flex-col bg-shell px-4 pb-4 pt-6">
      <div class="mb-8 flex items-center gap-2.5 px-2">
        <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-brand">
          <svg
            viewBox="0 0 24 24"
            class="h-5 w-5"
            fill="none"
            stroke="#0B0B0F"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M13 2 L5 14 h6 l-1 8 8-12 h-6 z" />
          </svg>
        </div>
        <div class="text-[17px] font-medium tracking-tight text-txt-primary">SpecForge</div>
      </div>

      <nav class="flex-1 space-y-6 overflow-y-auto">
        <div v-for="(group, gi) in groups" :key="gi">
          <div v-if="group.title" class="mb-1.5 px-3 text-[11px] text-txt-faint">
            {{ group.title }}
          </div>
          <div class="space-y-1">
            <router-link
              v-for="item in group.items"
              :key="item.name"
              :to="navTarget(item.name)"
              class="group flex w-full items-center gap-2.5 rounded-full px-3.5 py-2.5 text-[13.5px] transition-colors"
              :class="
                route.name === item.name
                  ? 'bg-ink font-medium text-white shadow-soft'
                  : 'text-txt-body hover:bg-page'
              "
            >
              <el-icon :size="16" :class="route.name === item.name ? 'text-brand' : 'text-txt-mute'">
                <component :is="item.icon" />
              </el-icon>
              <span class="flex-1 text-left">{{ item.label }}</span>
            </router-link>
          </div>
        </div>
      </nav>

      <div class="mt-4 space-y-1">
        <router-link
          :to="{ name: 'settings' }"
          class="flex w-full items-center gap-2.5 rounded-full px-3.5 py-2.5 text-[13.5px] transition-colors"
          :class="route.name === 'settings' ? 'bg-ink font-medium text-white shadow-soft' : 'text-txt-body hover:bg-page'"
        >
          <el-icon :size="16" :class="route.name === 'settings' ? 'text-brand' : 'text-txt-mute'">
            <Setting />
          </el-icon>
          设置
        </router-link>

        <div class="mt-2 flex items-center gap-2.5 rounded-card bg-page px-3.5 py-3">
          <div
            class="flex h-8 w-8 items-center justify-center rounded-full bg-brand-deep text-[12px] font-medium text-white"
          >
            <el-icon :size="14"><User /></el-icon>
          </div>
          <div class="min-w-0 flex-1">
            <div class="truncate text-[13px] font-medium text-txt-primary">
              {{ auth.user?.name || '未登录' }}
            </div>
            <div class="truncate text-[11px] text-txt-faint">{{ auth.user?.email || '—' }}</div>
          </div>
          <el-tooltip content="退出登录" placement="top">
            <button
              class="flex h-7 w-7 items-center justify-center rounded-full text-txt-mute transition-colors hover:bg-shell hover:text-txt-primary"
              @click="handleLogout"
            >
              <el-icon :size="14"><SwitchButton /></el-icon>
            </button>
          </el-tooltip>
        </div>
      </div>
    </aside>

    <main class="flex-1 overflow-y-auto">
      <div class="mx-auto max-w-[1200px] px-10 py-9">
        <h1 class="mb-7 text-[28px] font-medium tracking-tight text-txt-primary">
          {{ pageTitle }}
        </h1>
        <router-view />
      </div>
    </main>
  </div>
</template>
