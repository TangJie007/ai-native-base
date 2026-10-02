<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowRight, Delete, MagicStick, Select } from '@element-plus/icons-vue'
import type { DependencyGraph, ItemLayer } from '@specforge/shared'
import { DEPENDENCY_TYPE_META, ITEM_LAYER_META } from '@specforge/shared'
import {
  confirmDependencies,
  generateDependencies,
  getDependencies,
  saveDependencies,
} from '@/api/dependencies'
import { useProjectStore } from '@/stores/project'
import { metaOf } from '@/utils/meta'
import StatusTag from '@/components/StatusTag.vue'
import EmptyState from '@/components/EmptyState.vue'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()

const projectId = computed(
  () => (route.query.projectId as string | undefined) || projectStore.currentId,
)

const loading = ref(false)
const generating = ref(false)
const confirming = ref(false)
const graph = ref<DependencyGraph | null>(null)

// 条目标层配色（与原型一致）
const layerStyle: Record<ItemLayer, string> = {
  data: 'bg-brand text-ink',
  backend: 'bg-ink text-white',
  fullstack: 'bg-brand-deep text-white',
  frontend: 'bg-white text-txt-primary shadow-soft',
}

const edgeCount = computed(() => graph.value?.edges.length ?? 0)
const batchCount = computed(() => graph.value?.batches.length ?? 0)
const isEmpty = computed(
  () => !graph.value || (!graph.value.edges.length && !graph.value.batches.length),
)

// 依赖类型说明卡（数据依赖 / 接口依赖 / 页面依赖）
const typeCards = computed(() =>
  (['data', 'api', 'page'] as const).map((key) => ({
    key,
    label: DEPENDENCY_TYPE_META[key].label,
    serial: DEPENDENCY_TYPE_META[key].serial,
  })),
)

async function load() {
  if (!projectId.value) return
  loading.value = true
  try {
    graph.value = await getDependencies(projectId.value)
  } catch {
    graph.value = null
  } finally {
    loading.value = false
  }
}

async function generate() {
  if (!projectId.value) return
  generating.value = true
  try {
    graph.value = await generateDependencies(projectId.value)
    ElMessage.success('依赖图已生成')
  } catch {
    // 拦截器已提示
  } finally {
    generating.value = false
  }
}

async function confirm() {
  if (!projectId.value) return
  confirming.value = true
  try {
    graph.value = await confirmDependencies(projectId.value)
    ElMessage.success('依赖图已确认 · 进入代码生成队列')
    router.push({ name: 'pipeline', query: { projectId: projectId.value } })
  } catch {
    // 拦截器已提示
  } finally {
    confirming.value = false
  }
}

async function removeEdge(edgeId: string) {
  if (!projectId.value || !graph.value) return
  try {
    await ElMessageBox.confirm('确认删除这条依赖边？删除后重新计算执行批次。', '删除依赖边', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  const current = graph.value
  if (!current) return
  const remaining = current.edges
    .filter((e) => e.id !== edgeId)
    .map((e) => ({ itemId: e.itemId, dependsOnId: e.dependsOnId, depType: e.depType }))
  try {
    graph.value = await saveDependencies(projectId.value, remaining)
    ElMessage.success('依赖边已更新')
  } catch {
    // 拦截器已提示
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
    <div class="flex items-center gap-6 rounded-card bg-shell p-6 shadow-soft">
      <div class="flex-1">
        <div class="mb-2 flex items-center gap-3">
          <span class="text-[16px] font-medium text-txt-primary">依赖 DAG</span>
          <el-tag v-if="graph?.confirmed" type="success" effect="dark" round size="small">
            已确认
          </el-tag>
          <el-tag v-else-if="graph" type="warning" effect="light" round size="small">待确认</el-tag>
        </div>
        <p class="text-[13px] leading-relaxed text-txt-body">
          AI 已识别
          <span class="font-medium text-txt-primary">{{ edgeCount }} 条依赖边</span>，自动剪除
          <span class="font-medium text-txt-primary">{{ graph?.cycleRemoved ?? 0 }} 条循环依赖</span>，按拓扑排序划分为
          <span class="font-medium text-txt-primary">{{ batchCount }} 个执行批次</span>。
          你可以删除连线后确认——<span class="font-medium text-txt-primary">批次内并行、批次间串行</span>，这是并行安全和验证可行的边界。
        </p>
      </div>
      <div class="flex shrink-0 gap-2">
        <el-button round :loading="generating" @click="generate">
          <el-icon class="mr-1"><MagicStick /></el-icon>生成依赖图
        </el-button>
        <el-button
          type="primary"
          round
          size="large"
          :disabled="isEmpty || graph?.confirmed"
          :loading="confirming"
          @click="confirm"
        >
          <el-icon class="mr-1"><Select /></el-icon>
          确认依赖图，开始生成
          <el-icon class="ml-1"><ArrowRight /></el-icon>
        </el-button>
      </div>
    </div>

    <template v-if="!isEmpty && graph">
      <div class="rounded-card bg-shell p-7 shadow-soft">
        <div class="mb-6 flex items-center justify-between">
          <span class="text-[16px] font-medium text-txt-primary">执行批次 · 拓扑序</span>
          <div class="flex gap-4 text-[12px] text-txt-mute">
            <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full bg-brand"></span>数据层</span>
            <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full bg-ink"></span>后端</span>
            <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full bg-brand-deep"></span>全栈</span>
            <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full bg-white shadow-soft"></span>前端</span>
          </div>
        </div>

        <div v-if="graph.batches.length" class="space-y-4">
          <div v-for="b in graph.batches" :key="b.batch" class="flex items-center gap-5">
            <div class="w-24 shrink-0">
              <div class="rounded-full bg-page px-3 py-1.5 text-center text-[12px] font-medium text-txt-body">
                批次 {{ b.batch }}
              </div>
              <div class="mt-1 text-center text-[11px] text-txt-faint">并行 {{ b.parallel }}</div>
            </div>
            <div class="flex flex-1 flex-wrap gap-3">
              <div
                v-for="n in b.nodes"
                :key="n.id"
                class="flex flex-col gap-1 rounded-2xl px-5 py-3.5"
                :class="layerStyle[n.layer]"
              >
                <div class="text-[11px] opacity-70">{{ n.code }}</div>
                <div class="text-[13.5px] font-medium">{{ n.title }}</div>
              </div>
            </div>
          </div>
        </div>
        <EmptyState v-else title="暂无执行批次" description="生成依赖图后展示拓扑排序结果。" />
      </div>

      <div class="rounded-card bg-shell p-7 shadow-soft">
        <div class="mb-5 flex items-center justify-between">
          <span class="text-[16px] font-medium text-txt-primary">依赖边 · {{ edgeCount }} 条</span>
          <span class="text-[12px] text-txt-faint">数据/接口依赖强制串行，页面依赖可并行</span>
        </div>
        <el-table
          v-if="graph.edges.length"
          :data="graph.edges"
          style="width: 100%"
          :header-cell-style="{ background: 'transparent', color: '#8D8D99', fontSize: '12px' }"
        >
          <el-table-column label="条目" min-width="200">
            <template #default="{ row }">
              <div class="flex items-center gap-2">
                <span class="text-[11px] text-txt-faint">{{ row.itemCode }}</span>
                <span class="text-[13.5px] font-medium text-txt-primary">{{ row.itemTitle }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="层级" width="90">
            <template #default="{ row }">
              <StatusTag :meta="metaOf(ITEM_LAYER_META, row.itemLayer)" />
            </template>
          </el-table-column>
          <el-table-column label="依赖类型" width="120">
            <template #default="{ row }">
              <el-tag size="small" round effect="plain">
                {{ metaOf(DEPENDENCY_TYPE_META, row.depType).label }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="前置条目" min-width="200">
            <template #default="{ row }">
              <span class="text-[12px] text-txt-mute">
                {{ row.dependsOnCode }} · {{ graph.edges.find((e) => e.itemId === row.dependsOnId)?.itemTitle || row.dependsOnId }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="串行" width="80" align="center">
            <template #default="{ row }">
              <el-tag :type="metaOf(DEPENDENCY_TYPE_META, row.depType).serial ? 'warning' : 'info'" size="small" round>
                {{ metaOf(DEPENDENCY_TYPE_META, row.depType).serial ? '是' : '否' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="90" align="right">
            <template #default="{ row }">
              <el-button text size="small" class="!text-red-500" @click="removeEdge(row.id)">
                <el-icon class="mr-1"><Delete /></el-icon>删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <EmptyState v-else title="暂无依赖边" description="所有条目相互独立，将并行执行。" />
      </div>
    </template>

    <EmptyState
      v-else
      title="依赖图尚未生成"
      description="锁定契约后，Architect Agent 会分析条目间的数据/接口/页面依赖，生成 DAG 与执行批次。"
    >
      <el-button type="primary" round :loading="generating" @click="generate">
        <el-icon class="mr-1"><MagicStick /></el-icon>生成依赖图
      </el-button>
    </EmptyState>

    <div class="grid grid-cols-3 gap-6">
      <div v-for="c in typeCards" :key="c.key" class="rounded-card bg-shell p-6 shadow-soft">
        <div class="mb-3 flex items-center gap-2">
          <span class="text-[14px] font-medium text-txt-primary">{{ c.label }}</span>
          <el-tag :type="c.serial ? 'warning' : 'success'" size="small" round>
            {{ c.serial ? '强制串行' : '可并行' }}
          </el-tag>
        </div>
        <p class="text-[12.5px] leading-relaxed text-txt-body">
          <template v-if="c.key === 'data'">A 的数据模型是 B 的前置，强制串行。例：权限模块依赖用户表结构。</template>
          <template v-else-if="c.key === 'api'">A 的接口被 B 调用，强制串行。契约共享包已消除字段不一致风险。</template>
          <template v-else>A 页面跳转至 B，可并行生成，仅在验证阶段串行执行冒烟。</template>
        </p>
      </div>
    </div>
  </div>
</template>
