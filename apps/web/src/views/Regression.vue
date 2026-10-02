<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { CircleCheckFilled, Finished, WarningFilled } from '@element-plus/icons-vue'
import type { PipelineStatus, RegressionItem, RequirementItem } from '@specforge/shared'
import { checkRegression, getRegression, getPipeline } from '@/api/pipeline'
import { listItems } from '@/api/requirements'
import { useProjectStore } from '@/stores/project'
import RingProgress from '@/components/RingProgress.vue'
import EmptyState from '@/components/EmptyState.vue'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()

const projectId = computed(
  () => (route.query.projectId as string | undefined) || projectStore.currentId,
)

const loading = ref(false)
const acting = ref<string | null>(null)
const checklist = ref<RegressionItem[]>([])
const items = ref<RequirementItem[]>([])
const pipeline = ref<PipelineStatus | null>(null)

interface RegressionGroup {
  itemId: string
  code: string
  title: string
  entries: RegressionItem[]
}

const groups = computed<RegressionGroup[]>(() =>
  Object.values(
    checklist.value.reduce<Record<string, RegressionGroup>>((acc, entry) => {
      const item = items.value.find((i) => i.id === entry.itemId)
      const group = (acc[entry.itemId] ||= {
        itemId: entry.itemId,
        code: item?.code || '—',
        title: item?.title || '未关联条目',
        entries: [],
      })
      group.entries.push(entry)
      return acc
    }, {}),
  ),
)

const totalCount = computed(() => checklist.value.length)
const checkedCount = computed(() => checklist.value.filter((c) => c.checked).length)
const progress = computed(() => (totalCount.value ? (checkedCount.value / totalCount.value) * 100 : 0))
const allChecked = computed(() => totalCount.value > 0 && checkedCount.value === totalCount.value)
const delivered = computed(() => allChecked.value)

async function load() {
  if (!projectId.value) return
  loading.value = true
  try {
    const [list, itemList, pipelineInfo] = await Promise.all([
      getRegression(projectId.value),
      listItems(projectId.value),
      getPipeline(projectId.value),
    ])
    checklist.value = list
    items.value = itemList
    pipeline.value = pipelineInfo
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

async function toggle(entry: RegressionItem, checked: boolean) {
  if (!projectId.value) return
  acting.value = entry.id
  try {
    const updated = await checkRegression(projectId.value, {
      itemId: entry.itemId,
      text: entry.text,
      checked,
    })
    entry.checked = checked
    pipeline.value = updated
    if (checked && updated.regressionChecklist.every((c) => c.checked)) {
      ElMessage.success('全部回归项已确认，项目已交付')
    }
  } catch {
    // 拦截器已提示，回滚复选框状态
    entry.checked = !checked
  } finally {
    acting.value = null
  }
}

function onToggle(entry: RegressionItem, val: unknown) {
  void toggle(entry, Boolean(val))
}
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
    <div class="flex items-center gap-6 rounded-card bg-brand p-6 shadow-card">
      <RingProgress :value="progress" :size="80" :stroke-width="8" color="#0B0B0F">
        <span class="text-[18px] font-medium leading-none text-ink">
          {{ checkedCount }}/{{ totalCount }}
        </span>
      </RingProgress>
      <div class="flex-1">
        <div class="text-[18px] font-medium text-ink">
          人工回归确认{{ delivered ? ' · 已交付' : '' }}
        </div>
        <div class="mt-1.5 text-[13px] leading-relaxed text-ink/75">
          验证通过后由<span class="font-medium">人工逐项回归</span>——
          这是交付前最后一道卡点。带你亲自跑一遍关键场景，确认 Agent 的产出真的可用。
        </div>
      </div>
      <div class="flex shrink-0 gap-2">
        <span class="flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[12px] text-white">
          <el-icon :size="12" class="text-brand"><CircleCheckFilled /></el-icon>已确认 {{ checkedCount }}
        </span>
        <span class="flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[12px] text-white">
          <el-icon :size="12" class="text-brand"><WarningFilled /></el-icon>待确认
          {{ totalCount - checkedCount }}
        </span>
      </div>
    </div>

    <div class="rounded-card bg-shell p-7 shadow-soft">
      <div class="mb-5 flex items-center justify-between">
        <span class="text-[16px] font-medium text-txt-primary">
          回归清单 · {{ groups.length }} 个条目
        </span>
        <el-tag v-if="delivered" effect="dark" type="success" round>
          <el-icon class="mr-1"><Finished /></el-icon>已交付
        </el-tag>
      </div>

      <div v-if="groups.length" class="space-y-3">
        <div v-for="g in groups" :key="g.itemId" class="rounded-2xl bg-page p-5">
          <div class="mb-3 flex items-center gap-2">
            <span class="text-[11px] text-txt-faint">{{ g.code }}</span>
            <span class="text-[14px] font-medium text-txt-primary">{{ g.title }}</span>
          </div>
          <div class="space-y-2">
            <label
              v-for="entry in g.entries"
              :key="entry.id"
              class="flex cursor-pointer items-start gap-3 rounded-xl bg-shell px-4 py-3"
            >
              <el-checkbox
                :model-value="entry.checked"
                :disabled="acting === entry.id"
                class="mt-0.5"
                @change="onToggle(entry, $event)"
              />
              <span
                class="flex-1 text-[13px] leading-relaxed"
                :class="entry.checked ? 'text-txt-faint line-through' : 'text-txt-body'"
              >
                {{ entry.text }}
              </span>
            </label>
          </div>
        </div>
      </div>

      <EmptyState
        v-else
        title="暂无回归清单"
        description="请在「生成监控」启动流水线，验证通过后会自动生成人工回归清单。"
      >
        <el-button type="primary" round @click="router.push({ name: 'pipeline', query: { projectId } })">
          前往生成监控
        </el-button>
      </EmptyState>
    </div>
  </div>
</template>
