<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowRight, CircleCheckFilled, Edit, WarningFilled } from '@element-plus/icons-vue'
import type { Assumption, AssumptionsGate } from '@specforge/shared'
import { ASSUMPTION_CATEGORY_META, ASSUMPTION_STATUS_META } from '@specforge/shared'
import { metaOf } from '@/utils/meta'
import {
  confirmAllAssumptions,
  getAssumptionsGate,
  listAssumptions,
  updateAssumption,
} from '@/api/assumptions'
import { useProjectStore } from '@/stores/project'
import RingProgress from '@/components/RingProgress.vue'
import StatusTag from '@/components/StatusTag.vue'
import EmptyState from '@/components/EmptyState.vue'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()

// 项目上下文优先取路由 query，其次取全局当前项目
const projectId = computed(
  () => (route.query.projectId as string | undefined) || projectStore.currentId,
)

const loading = ref(false)
const acting = ref(false)
const assumptions = ref<Assumption[]>([])
const gate = ref<AssumptionsGate | null>(null)

const totalCount = computed(() => gate.value?.total ?? assumptions.value.length)
const resolvedCount = computed(
  () => gate.value?.resolved ?? assumptions.value.filter((a) => a.status !== 'pending').length,
)
const pendingCount = computed(
  () => gate.value?.pending ?? assumptions.value.filter((a) => a.status === 'pending').length,
)
const progress = computed(() => (totalCount.value ? (resolvedCount.value / totalCount.value) * 100 : 0))
const allResolved = computed(() => totalCount.value > 0 && pendingCount.value === 0)

// 手动修改弹窗
const editVisible = ref(false)
const editTarget = ref<Assumption | null>(null)
const editAnswer = ref('')

// 请求序号：快速切换项目时丢弃过期响应
let loadSeq = 0

async function load() {
  const pid = projectId.value
  if (!pid) return
  const seq = ++loadSeq
  loading.value = true
  try {
    const [list, gateInfo] = await Promise.all([
      listAssumptions(pid),
      getAssumptionsGate(pid),
    ])
    if (seq !== loadSeq) return
    assumptions.value = list
    gate.value = gateInfo
  } catch {
    // 拦截器已提示
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

async function confirmOne(a: Assumption) {
  acting.value = true
  try {
    await updateAssumption(a.id, { status: 'confirmed', userAnswer: a.aiDefault })
    ElMessage.success(`${a.code} 已确认`)
    await load()
  } catch {
    // 拦截器已提示
  } finally {
    acting.value = false
  }
}

async function keepDefault(a: Assumption) {
  acting.value = true
  try {
    await updateAssumption(a.id, { status: 'default', userAnswer: null })
    ElMessage.info(`${a.code} 沿用 AI 默认值`)
    await load()
  } catch {
    // 拦截器已提示
  } finally {
    acting.value = false
  }
}

function openEdit(a: Assumption) {
  editTarget.value = a
  editAnswer.value = a.userAnswer || a.aiDefault
  editVisible.value = true
}

async function submitEdit() {
  if (!editTarget.value) return
  if (!editAnswer.value.trim()) {
    ElMessage.warning('请填写确认值')
    return
  }
  acting.value = true
  try {
    await updateAssumption(editTarget.value.id, {
      status: 'confirmed',
      userAnswer: editAnswer.value.trim(),
    })
    editVisible.value = false
    ElMessage.success('已保存确认值')
    await load()
  } catch {
    // 拦截器已提示
  } finally {
    acting.value = false
  }
}

async function confirmAll() {
  if (!projectId.value) return
  acting.value = true
  try {
    const list = await confirmAllAssumptions(projectId.value)
    assumptions.value = list
    await load()
    ElMessage.success('全部假设已确认，可以进入契约生成')
  } catch {
    // 拦截器已提示
  } finally {
    acting.value = false
  }
}

function goContract() {
  router.push({ name: 'contract', query: { projectId: projectId.value } })
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
    <div class="flex items-center gap-6 rounded-card bg-brand p-6 shadow-card">
      <RingProgress :value="progress" :size="80" :stroke-width="8" color="#0B0B0F">
        <span class="text-[18px] font-medium leading-none text-ink">
          {{ resolvedCount }}/{{ totalCount }}
        </span>
      </RingProgress>
      <div class="flex-1">
        <div class="text-[18px] font-medium text-ink">假设清单确认</div>
        <div class="mt-1.5 text-[13px] leading-relaxed text-ink/75">
          AI 已列出全部不确定项并给出默认值。<span class="font-medium">全部处理完成前无法进入契约生成阶段</span>——
          这一步决定了后面所有条目的生成方向，跳过它等于把返工留到最后。
        </div>
      </div>
      <div class="flex shrink-0 gap-2">
        <span class="flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[12px] text-white">
          <el-icon :size="12" class="text-brand"><CircleCheckFilled /></el-icon>已处理 {{ resolvedCount }}
        </span>
        <span class="flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[12px] text-white">
          <el-icon :size="12" class="text-brand"><WarningFilled /></el-icon>待处理 {{ pendingCount }}
        </span>
      </div>
    </div>

    <div class="rounded-card bg-shell p-7 shadow-soft">
      <div class="mb-5 flex items-center justify-between">
        <span class="text-[16px] font-medium text-txt-primary">全部假设 · {{ totalCount }} 项</span>
        <el-button
          type="primary"
          round
          :disabled="!allResolved || acting"
          @click="goContract"
        >
          全部确认，进入契约生成
          <el-icon class="ml-1"><ArrowRight /></el-icon>
        </el-button>
      </div>

      <div v-if="assumptions.length" class="space-y-3">
        <div
          v-for="a in assumptions"
          :key="a.id"
          class="rounded-2xl bg-page p-5"
          :class="a.status === 'pending' ? '' : 'opacity-90'"
        >
          <div class="flex items-start gap-4">
            <div class="flex-1">
              <div class="mb-2 flex items-center gap-2">
                <StatusTag :meta="metaOf(ASSUMPTION_CATEGORY_META, a.category)" :effect="'dark'" />
                <StatusTag :meta="metaOf(ASSUMPTION_STATUS_META, a.status)" />
                <span class="text-[11px] text-txt-faint">{{ a.code }}</span>
              </div>
              <div class="text-[14px] font-medium leading-relaxed text-txt-primary">{{ a.question }}</div>
              <div class="mt-3 grid grid-cols-[1fr_240px] gap-4">
                <div>
                  <div class="mb-1 text-[11px] text-txt-faint">
                    {{ a.userAnswer ? '确认值' : 'AI 默认值' }}
                  </div>
                  <div class="rounded-xl bg-brand-soft px-4 py-2.5 text-[13px] leading-relaxed text-brand-deep">
                    {{ a.userAnswer || a.aiDefault }}
                  </div>
                </div>
                <div>
                  <div class="mb-1 text-[11px] text-txt-faint">不确认的影响</div>
                  <div class="rounded-xl bg-shell px-4 py-2.5 text-[13px] leading-relaxed text-txt-body">
                    {{ a.impact }}
                  </div>
                </div>
              </div>
            </div>
            <div class="flex w-32 shrink-0 flex-col gap-2">
              <el-button v-if="a.status === 'confirmed'" type="success" round disabled>已确认</el-button>
              <el-button
                v-else
                type="primary"
                round
                :disabled="acting"
                @click="confirmOne(a)"
              >
                确认此值
              </el-button>
              <el-button round :disabled="acting" @click="keepDefault(a)">沿用默认</el-button>
              <el-button text class="!text-brand-deep" @click="openEdit(a)">
                <el-icon class="mr-1"><Edit /></el-icon>手动修改
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <EmptyState
        v-else
        title="暂无假设清单"
        description="请先在「需求解析」导入需求文档，AI 会列出需要确认的不确定项。"
      >
        <el-button
          type="primary"
          round
          @click="router.push({ name: 'requirements', query: { projectId } })"
        >
          前往需求解析
        </el-button>
      </EmptyState>

      <div v-if="assumptions.length" class="mt-6 flex justify-end">
        <el-button type="primary" round :disabled="allResolved || acting" :loading="acting" @click="confirmAll">
          全部沿用默认并确认
          <el-icon class="ml-1"><ArrowRight /></el-icon>
        </el-button>
      </div>
    </div>

    <el-dialog v-model="editVisible" title="手动修改假设" width="520px">
      <div v-if="editTarget" class="space-y-3">
        <div class="text-[13.5px] font-medium text-txt-primary">{{ editTarget.question }}</div>
        <div class="rounded-xl bg-brand-soft px-4 py-2.5 text-[12.5px] leading-relaxed text-brand-deep">
          AI 默认值：{{ editTarget.aiDefault }}
        </div>
        <el-input
          v-model="editAnswer"
          type="textarea"
          :rows="3"
          maxlength="500"
          placeholder="填写你的确认值"
        />
      </div>
      <template #footer>
        <el-button round @click="editVisible = false">取消</el-button>
        <el-button type="primary" round :loading="acting" @click="submitEdit">保存并确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>
