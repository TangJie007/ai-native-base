<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import type { AgentName, TracesPayload } from '@specforge/shared'
import { AGENT_META } from '@specforge/shared'
import { listTraces } from '@/api/traces'
import { useProjectStore } from '@/stores/project'
import StatCard from '@/components/StatCard.vue'
import EmptyState from '@/components/EmptyState.vue'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()

const projectId = computed(
  () => (route.query.projectId as string | undefined) || projectStore.currentId,
)

const loading = ref(false)
const data = ref<TracesPayload | null>(null)
const expanded = ref<Set<string>>(new Set())

// Agent 标签配色（与原型一致）
const agentStyle: Record<AgentName, string> = {
  parser: 'bg-brand text-ink',
  contract: 'bg-brand-deep text-white',
  architect: 'bg-ink text-white',
  scaffold: 'bg-brand text-ink',
  backend: 'bg-ink text-brand',
  frontend: 'bg-ink text-brand',
  test: 'bg-brand text-ink',
  fixer: 'bg-amber-400 text-ink',
  reviewer: 'bg-red-500 text-white',
}

const summaryStats = computed(() => {
  const s = data.value?.summary
  if (!s) return []
  return [
    { value: `${s.totalCalls}`, suffix: '次', label: 'Agent 调用' },
    { value: `${formatTokens(s.inputTokens)} / ${formatTokens(s.outputTokens)}`, suffix: '', label: 'Token 消耗（in / out）' },
    { value: s.cost, suffix: '', label: '本次流水线成本' },
    { value: `${s.modelCount}`, suffix: '个', label: '按环节分档调用的模型' },
  ]
})

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return `${n}`
}

function toggle(id: string) {
  if (expanded.value.has(id)) expanded.value.delete(id)
  else expanded.value.add(id)
}

function isExpanded(id: string) {
  return expanded.value.has(id)
}

async function load() {
  if (!projectId.value) return
  loading.value = true
  try {
    data.value = await listTraces(projectId.value)
    expanded.value = new Set(data.value.entries.slice(0, 1).map((e) => e.id))
  } catch {
    data.value = null
  } finally {
    loading.value = false
  }
}

watch(projectId, load, { immediate: true })
</script>

<template>
  <div v-if="!projectId">
    <EmptyState title="未选择项目" description="请先在项目列表中选择或创建一个项目。">
      <el-button type="primary" round @click="router.push({ name: 'projects' })">
        前往项目列表
      </el-button>
    </EmptyState>
  </div>

  <div v-else v-loading="loading" class="space-y-6">
    <template v-if="data">
      <div class="grid grid-cols-4 gap-6">
        <StatCard
          v-for="s in summaryStats"
          :key="s.label"
          :value="s.value"
          :label="s.label"
          :suffix="s.suffix"
          value-class="text-[26px] font-medium tracking-tight text-txt-primary"
        />
      </div>

      <div class="rounded-card bg-shell p-7 shadow-soft">
        <div class="mb-6 flex items-center justify-between">
          <span class="text-[16px] font-medium text-txt-primary">Agent 调用轨迹</span>
          <span class="text-[12px] text-txt-faint">默认收起 · 点击展开输入输出摘要</span>
        </div>

        <div v-if="data.entries.length" class="relative space-y-3 pl-6">
          <div class="absolute bottom-3 left-[7px] top-3 w-0.5 rounded-full bg-page"></div>

          <div v-for="t in data.entries" :key="t.id" class="relative">
            <span
              class="absolute -left-6 top-6 h-3.5 w-3.5 rounded-full border-[3px] border-shell"
              :class="t.status === 'failed' ? 'bg-red-500' : t.status === 'running' ? 'bg-amber-400' : 'bg-brand'"
            ></span>

            <div class="rounded-2xl bg-page p-5 transition-colors hover:bg-[#eeedf4]">
              <div class="flex items-center gap-3">
                <span
                  class="rounded-full px-3 py-1 text-[12px] font-medium"
                  :class="agentStyle[t.agentName] || 'bg-ink text-white'"
                >
                  {{ AGENT_META[t.agentName].label }}
                </span>
                <el-tag size="small" effect="plain" round>{{ t.model }}</el-tag>
                <span class="flex-1 truncate text-[13.5px] text-txt-primary">{{ t.action }}</span>
                <span class="shrink-0 text-[12px] text-txt-mute">
                  {{ formatTokens(t.inputTokens) }} in · {{ formatTokens(t.outputTokens) }} out · {{ t.durationMs }}ms
                </span>
                <el-button text size="small" class="!text-brand-deep" @click="toggle(t.id)">
                  <el-icon><component :is="isExpanded(t.id) ? ArrowUp : ArrowDown" /></el-icon>
                </el-button>
              </div>

              <div v-if="isExpanded(t.id)" class="mt-4 grid grid-cols-2 gap-4 rounded-xl bg-shell p-4">
                <div>
                  <div class="mb-1 text-[11px] text-txt-faint">输入摘要</div>
                  <p class="text-[13px] leading-relaxed text-txt-body">{{ t.inputSummary }}</p>
                </div>
                <div>
                  <div class="mb-1 text-[11px] text-txt-faint">输出摘要</div>
                  <p class="text-[13px] leading-relaxed text-txt-body">{{ t.outputSummary }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <EmptyState
          v-else
          title="暂无 Agent 轨迹"
          description="流水线开始生成后，各 Agent 的调用记录会实时汇入这里。"
        >
          <el-button type="primary" round @click="router.push({ name: 'pipeline', query: { projectId } })">
            前往生成监控
          </el-button>
        </EmptyState>
      </div>
    </template>

    <EmptyState v-else title="暂无轨迹数据" description="该项目尚未产生 Agent 调用记录。" />
  </div>
</template>
