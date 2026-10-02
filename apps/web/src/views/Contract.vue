<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowRight, CircleCheckFilled, Lock, RefreshRight } from '@element-plus/icons-vue'
import type { Contract } from '@specforge/shared'
import { generateContract, getLatestContract, lockContract } from '@/api/contracts'
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
const generating = ref(false)
const locking = ref(false)
const contract = ref<Contract | null>(null)
const tab = ref('openapiYaml')

// 契约产物展示映射：后端真实字段 → tab 标签
const codeTabs = computed(() => {
  const c = contract.value
  if (!c) return [] as { name: string; label: string; code: string }[]
  return [
    { name: 'openapiYaml', label: 'openapi.yaml', code: c.openapiYaml },
    { name: 'tsTypes', label: 'types.ts', code: c.tsTypes },
    { name: 'prismaSchema', label: 'schema.prisma', code: c.prismaSchema },
    { name: 'zodSchemas', label: 'schemas.ts', code: c.zodSchemas },
    { name: 'errorCodes', label: 'error-codes.ts', code: c.errorCodes },
    { name: 'constants', label: 'constants.ts', code: c.constants },
  ]
})

const activeCode = computed(() => codeTabs.value.find((t) => t.name === tab.value)?.code || '')

const stats = computed(() => {
  const s = contract.value?.stats
  return [
    { label: '接口定义', value: s ? `${s.endpointCount}` : '0', suffix: '个' },
    { label: '类型字段', value: s ? `${s.typeFieldCount}` : '0', suffix: '个' },
    { label: '数据表', value: s ? `${s.tableCount}` : '0', suffix: '张' },
    { label: '枚举值', value: s ? `${s.enumCount}` : '0', suffix: '个' },
  ]
})

// 请求序号：快速切换项目时丢弃过期响应
let loadSeq = 0

async function load() {
  const pid = projectId.value
  if (!pid) return
  const seq = ++loadSeq
  loading.value = true
  try {
    const result = await getLatestContract(pid)
    if (seq !== loadSeq) return
    contract.value = result
  } catch {
    // 404 CONTRACT_NOT_FOUND 为预期空状态，静默处理
    if (seq === loadSeq) contract.value = null
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

async function generate() {
  if (!projectId.value) return
  generating.value = true
  try {
    contract.value = await generateContract(projectId.value)
    ElMessage.success('契约已生成')
  } catch {
    // 拦截器已提示
  } finally {
    generating.value = false
  }
}

async function lock() {
  if (!projectId.value || !contract.value) return
  locking.value = true
  try {
    contract.value = await lockContract(projectId.value, contract.value.id)
    ElMessage.success('契约已锁定 · 后续生成阶段任何 Agent 不得修改')
  } catch {
    // 拦截器已提示
  } finally {
    locking.value = false
  }
}

function goDependencies() {
  router.push({ name: 'dependencies', query: { projectId: projectId.value } })
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
    <template v-if="contract">
      <div class="flex items-center gap-6 rounded-card bg-shell p-6 shadow-soft">
        <div class="flex-1">
          <div class="mb-4 flex items-center gap-3">
            <span class="text-[16px] font-medium text-txt-primary">契约产物 · v{{ contract.version }}</span>
            <el-tag v-if="contract.locked" type="success" effect="dark" round size="small">
              <el-icon class="mr-1"><Lock /></el-icon>已锁定
            </el-tag>
            <el-tag v-else type="warning" effect="light" round size="small">待确认</el-tag>
          </div>
          <div class="flex gap-3">
            <StatCard
              v-for="s in stats"
              :key="s.label"
              class="flex-1"
              :value="s.value"
              :label="s.label"
              :suffix="s.suffix"
            />
          </div>
        </div>
        <div class="w-64 shrink-0 rounded-card bg-brand p-5">
          <div class="text-[13px] font-medium text-ink">为什么必须锁契约</div>
          <p class="mt-2 text-[12px] leading-relaxed text-ink/75">
            契约落地为 <span class="font-medium">packages/shared</span> 的 TS 类型，
            NestJS 与 Vue 同时 import。改一个字段名，引用处直接
            <span class="font-medium">tsc 报错</span>——一致性由编译器强制，不靠 LLM 自觉。
          </p>
        </div>
      </div>

      <div class="rounded-card bg-shell p-7 shadow-soft">
        <div class="mb-5 flex items-center justify-between">
          <el-tabs v-model="tab" class="!-mb-5">
            <el-tab-pane v-for="t in codeTabs" :key="t.name" :label="t.label" :name="t.name" />
          </el-tabs>
          <div class="flex gap-2">
            <el-button round :loading="generating" @click="generate">
              <el-icon class="mr-1"><RefreshRight /></el-icon>重新生成
            </el-button>
            <el-button v-if="!contract.locked" type="primary" round :loading="locking" @click="lock">
              <el-icon class="mr-1"><Lock /></el-icon>
              锁定契约
            </el-button>
            <el-button v-else round disabled>
              <el-icon class="mr-1"><CircleCheckFilled /></el-icon>
              已锁定
            </el-button>
          </div>
        </div>

        <div class="overflow-x-auto rounded-2xl bg-[#161821] p-6">
          <pre class="code-block text-[#D6DAE3]"><code>{{ activeCode }}</code></pre>
        </div>

        <div class="mt-5 flex items-center justify-between">
          <div class="flex items-center gap-2 text-[12.5px] text-brand-deep">
            <el-icon :size="14"><CircleCheckFilled /></el-icon>
            {{ contract.stats.tscPassed ? 'tsc --noEmit 已通过' : 'tsc 校验未通过' }} ·
            前后端共享同一份类型定义
          </div>
          <el-button type="primary" round :disabled="!contract.locked" @click="goDependencies">
            进入依赖编排
            <el-icon class="ml-1"><ArrowRight /></el-icon>
          </el-button>
        </div>
      </div>
    </template>

    <EmptyState
      v-else
      title="契约尚未生成"
      description="确认假设清单后，Contract Agent 会基于解析规格生成 API 契约、TS 类型与 Prisma Schema。"
    >
      <div class="flex gap-3">
        <el-button round @click="router.push({ name: 'assumptions', query: { projectId } })">
          返回假设确认
        </el-button>
        <el-button type="primary" round :loading="generating" @click="generate">
          生成契约
          <el-icon class="ml-1"><ArrowRight /></el-icon>
        </el-button>
      </div>
    </EmptyState>
  </div>
</template>
