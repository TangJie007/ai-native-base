<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, CircleCheckFilled, VideoPlay } from '@element-plus/icons-vue'
import type { DashboardData } from '@specforge/shared'
import { PROJECT_STATUS_META } from '@specforge/shared'
import { getDashboard } from '@/api/projects'
import { metaOf } from '@/utils/meta'
import { useProjectStore } from '@/stores/project'
import RingProgress from '@/components/RingProgress.vue'
import StatCard from '@/components/StatCard.vue'
import StatusTag from '@/components/StatusTag.vue'
import EmptyState from '@/components/EmptyState.vue'

const router = useRouter()
const projectStore = useProjectStore()

const loading = ref(true)
const data = ref<DashboardData | null>(null)

async function load() {
  loading.value = true
  try {
    data.value = await getDashboard()
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

function continueProject(id: string) {
  projectStore.setCurrentId(id)
  router.push({ name: 'pipeline', query: { projectId: id } })
}

function openProject(id: string) {
  projectStore.setCurrentId(id)
  router.push({ name: 'requirements', query: { projectId: id } })
}

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="space-y-6">
    <template v-if="data">
      <div v-if="data.projects.length" class="grid grid-cols-2 gap-6">
        <div
          v-for="p in data.projects"
          :key="p.id"
          class="relative flex flex-col overflow-hidden rounded-card bg-brand p-7 shadow-card"
        >
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-3">
              <div class="flex h-11 w-11 items-center justify-center rounded-full bg-ink">
                <svg
                  viewBox="0 0 24 24"
                  class="h-5 w-5"
                  fill="none"
                  stroke="#7CE262"
                  stroke-width="2.4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M13 2 L5 14 h6 l-1 8 8-12 h-6 z" />
                </svg>
              </div>
              <div>
                <div class="text-[20px] font-medium leading-tight text-ink">{{ p.name }}</div>
                <div class="mt-0.5 text-[12px] text-ink/70">{{ p.subtitle }}</div>
              </div>
            </div>
            <span class="rounded-full bg-ink px-3 py-1 text-[11px] text-brand">{{ p.stage }}</span>
          </div>

          <div class="mt-5 flex flex-wrap gap-2">
            <span
              v-for="b in [
                { k: '通过率', v: p.passRate },
                { k: '条目', v: `${p.itemsDone}/${p.itemsTotal}` },
                { k: '成本', v: p.cost },
                { k: '耗时', v: p.duration },
              ]"
              :key="b.k"
              class="flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[12px] text-white"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-brand"></span>
              {{ b.k }} <span class="font-medium">{{ b.v }}</span>
            </span>
          </div>

          <div class="mt-5 flex items-center gap-6">
            <ul class="flex-1 space-y-2.5">
              <li v-for="f in p.features" :key="f" class="flex items-center gap-2 text-[13px] text-ink">
                <el-icon :size="14" class="shrink-0 text-ink"><CircleCheckFilled /></el-icon>
                {{ f }}
              </li>
            </ul>
            <RingProgress :value="p.progress" :size="96" color="#0B0B0F" />
          </div>

          <div class="mt-6 flex gap-3">
            <el-button
              class="!h-auto flex-1 !rounded-full !border-none !bg-ink !py-3.5 !text-[14px] !font-medium !text-white"
              @click="continueProject(p.id)"
            >
              <el-icon class="mr-2"><VideoPlay /></el-icon>
              继续生成
            </el-button>
            <el-button round class="!h-auto !py-3.5" @click="openProject(p.id)">查看需求</el-button>
          </div>
        </div>
      </div>

      <EmptyState
        v-else
        title="还没有项目"
        description="创建第一个项目，导入需求文档即可开始锻造。"
      >
        <el-button type="primary" round @click="router.push({ name: 'projects' })">
          去创建项目
        </el-button>
      </EmptyState>

      <div v-if="data.stats.length" class="grid grid-cols-4 gap-6">
        <StatCard
          v-for="s in data.stats"
          :key="s.label"
          :value="s.value"
          :label="s.label"
          :suffix="s.suffix"
        />
      </div>

      <div class="rounded-card bg-shell p-7 shadow-soft">
        <div class="mb-5 flex items-center justify-between">
          <div class="text-[16px] font-medium text-txt-primary">最近项目</div>
          <el-button text class="!text-brand-deep" @click="router.push({ name: 'projects' })">
            全部项目
            <el-icon class="ml-1"><ArrowRight /></el-icon>
          </el-button>
        </div>
        <el-table
          :data="data.recentProjects"
          style="width: 100%"
          :header-cell-style="{ background: 'transparent', color: '#8D8D99', fontSize: '12px' }"
          empty-text="暂无最近项目"
        >
          <el-table-column prop="name" label="项目" min-width="180" />
          <el-table-column prop="stage" label="当前阶段" min-width="140" />
          <el-table-column label="通过率" width="110">
            <template #default="{ row }">
              <span
                class="font-medium"
                :class="row.passRate === '—' ? 'text-txt-faint' : 'text-brand-deep'"
              >
                {{ row.passRate }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="130">
            <template #default="{ row }">
              <StatusTag :meta="metaOf(PROJECT_STATUS_META, row.status)" :label="row.statusLabel" />
            </template>
          </el-table-column>
          <el-table-column prop="updatedAt" label="更新时间" width="180" />
        </el-table>
      </div>
    </template>
  </div>
</template>
