<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowRight, Document, UploadFilled } from '@element-plus/icons-vue'
import type { ParsedSpec, RequirementDoc, RequirementItem } from '@specforge/shared'
import { ITEM_LAYER_META, ITEM_STATUS_META } from '@specforge/shared'
import { getRequirements, importRequirementDoc } from '@/api/requirements'
import { metaOf } from '@/utils/meta'
import { useProjectStore } from '@/stores/project'
import StatusTag from '@/components/StatusTag.vue'
import EmptyState from '@/components/EmptyState.vue'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()

const projectId = computed(
  () => (route.query.projectId as string | undefined) || projectStore.currentId,
)

const loading = ref(false)
const importing = ref(false)
const dragging = ref(false)
const doc = ref<RequirementDoc | null>(null)
const spec = ref<ParsedSpec | null>(null)
const items = ref<RequirementItem[]>([])

const rawContent = ref('')
const fileName = ref('PRD.md')
const fileInput = ref<HTMLInputElement | null>(null)

const onboarding = computed(() => route.query.onboarding === '1')

// 请求序号：快速切换项目时丢弃过期响应
let loadSeq = 0

async function load() {
  const pid = projectId.value
  if (!pid) return
  const seq = ++loadSeq
  loading.value = true
  try {
    const payload = await getRequirements(pid)
    if (seq !== loadSeq) return
    doc.value = payload.doc
    spec.value = payload.spec
    items.value = payload.items
  } catch {
    // 拦截器已提示
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

function pickFile() {
  fileInput.value?.click()
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  fileName.value = file.name
  const reader = new FileReader()
  reader.onload = () => {
    rawContent.value = String(reader.result || '')
  }
  reader.readAsText(file)
  input.value = ''
}

function onDrop(event: DragEvent) {
  dragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (!file) return
  fileName.value = file.name
  const reader = new FileReader()
  reader.onload = () => {
    rawContent.value = String(reader.result || '')
  }
  reader.readAsText(file)
}

async function submitImport() {
  if (!projectId.value) return
  if (!rawContent.value.trim()) {
    ElMessage.warning('请粘贴或上传需求文档内容')
    return
  }
  importing.value = true
  try {
    const result = await importRequirementDoc(projectId.value, {
      fileName: fileName.value || 'PRD.md',
      content: rawContent.value,
    })
    await load()
    ElMessage.success(
      `解析完成：识别出 ${result.items.length} 个需求条目、${result.assumptions.length} 项假设待确认`,
    )
  } catch {
    // 拦截器已提示
  } finally {
    importing.value = false
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

  <div v-else v-loading="loading" class="grid grid-cols-[340px_1fr] gap-6">
    <div class="flex flex-col gap-5">
      <el-alert
        v-if="onboarding"
        type="success"
        :closable="false"
        show-icon
        title="项目已创建"
        description="下一步：粘贴或上传需求文档（Markdown），AI 将自动切分需求条目。"
      />

      <div
        class="flex flex-col rounded-card bg-shell px-6 py-6 shadow-soft transition-colors"
        :class="dragging ? 'bg-brand-soft' : ''"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <div class="flex flex-col items-center">
          <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand">
            <el-icon :size="26" color="#0B0B0F"><UploadFilled /></el-icon>
          </div>
          <div class="mt-4 text-[14px] font-medium text-txt-primary">导入需求文档</div>
          <div class="mt-1.5 text-center text-[12px] leading-relaxed text-txt-mute">
            拖拽或选择 Markdown / 文本文件<br />也可直接在下方粘贴内容
          </div>
          <el-button round class="mt-4" @click="pickFile">选择文件</el-button>
          <input
            ref="fileInput"
            type="file"
            accept=".md,.markdown,.txt,text/plain"
            class="hidden"
            @change="onFileChange"
          />
        </div>

        <el-input v-model="fileName" class="mt-4" size="small" placeholder="文档文件名">
          <template #prefix><el-icon><Document /></el-icon></template>
        </el-input>
        <el-input
          v-model="rawContent"
          class="mt-3"
          type="textarea"
          :rows="7"
          placeholder="在此粘贴 PRD / 需求文档内容…"
        />
        <el-button
          type="primary"
          round
          class="mt-3"
          :loading="importing"
          @click="submitImport"
        >
          导入并解析
        </el-button>
      </div>

      <div class="rounded-card bg-shell p-6 shadow-soft">
        <div class="mb-4 text-[14px] font-medium text-txt-primary">解析规格</div>
        <div v-if="spec" class="space-y-3 text-[13px]">
          <div class="flex justify-between">
            <span class="text-txt-mute">需求条目</span><span class="font-medium">{{ spec.summary.itemCount }} 个</span>
          </div>
          <div class="flex justify-between">
            <span class="text-txt-mute">业务实体</span><span class="font-medium">{{ spec.summary.entityCount }} 个</span>
          </div>
          <div class="flex justify-between">
            <span class="text-txt-mute">状态机</span><span class="font-medium">{{ spec.summary.stateMachineCount }} 个</span>
          </div>
          <div class="flex justify-between">
            <span class="text-txt-mute">假设清单</span>
            <span class="font-medium text-brand-deep">{{ spec.summary.assumptionCount }} 项</span>
          </div>
          <div class="flex justify-between">
            <span class="text-txt-mute">文档版本</span><span class="font-medium">v{{ doc?.version ?? 0 }}</span>
          </div>
        </div>
        <div v-else class="text-[12.5px] text-txt-faint">尚未解析，导入需求文档后展示。</div>
      </div>

      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="强阻断卡点"
        description="假设清单未全部确认前，无法进入契约生成阶段。"
      />
    </div>

    <div class="space-y-5">
      <div
        v-if="spec && (spec.contradictions.length || spec.rules.length)"
        class="rounded-card bg-shell p-6 shadow-soft"
      >
        <div class="mb-4 text-[14px] font-medium text-txt-primary">解析洞察</div>
        <el-alert
          v-if="spec.contradictions.length"
          type="error"
          :closable="false"
          show-icon
          class="mb-3"
          :title="`发现 ${spec.contradictions.length} 处需求矛盾`"
        >
          <ul class="mt-1 list-disc pl-4 text-[12.5px] leading-relaxed">
            <li v-for="(c, i) in spec.contradictions" :key="i">{{ c }}</li>
          </ul>
        </el-alert>
        <div v-if="spec.entities.length" class="mb-3">
          <div class="mb-1.5 text-[11px] text-txt-faint">业务实体</div>
          <div class="flex flex-wrap gap-2">
            <el-tag v-for="e in spec.entities" :key="e.name" round effect="light" size="small">
              {{ e.name }} · {{ e.fields.length }} 字段
            </el-tag>
          </div>
        </div>
        <div v-if="spec.rules.length">
          <div class="mb-1.5 text-[11px] text-txt-faint">业务规则</div>
          <ul class="space-y-1.5 text-[12.5px] leading-relaxed text-txt-body">
            <li v-for="(r, i) in spec.rules" :key="i" class="flex gap-2">
              <span class="text-brand-deep">•</span>{{ r }}
            </li>
          </ul>
        </div>
      </div>

      <div class="rounded-card bg-shell p-7 shadow-soft">
        <div class="mb-5 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-[16px] font-medium text-txt-primary">需求条目</span>
            <el-tag round effect="light" size="small">{{ items.length }} 项</el-tag>
          </div>
          <el-button type="primary" round :disabled="!items.length" @click="goContract">
            确认并生成契约
            <el-icon class="ml-1"><ArrowRight /></el-icon>
          </el-button>
        </div>

        <el-table
          :data="items"
          style="width: 100%"
          :header-cell-style="{ background: 'transparent', color: '#8D8D99', fontSize: '12px' }"
        >
          <el-table-column prop="code" label="编号" width="100" />
          <el-table-column prop="title" label="条目" min-width="170" />
          <el-table-column label="层级" width="90">
            <template #default="{ row }">
              <StatusTag :meta="metaOf(ITEM_LAYER_META, row.layer)" />
            </template>
          </el-table-column>
          <el-table-column prop="priority" label="优先级" width="80" />
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <StatusTag :meta="metaOf(ITEM_STATUS_META, row.status)" />
            </template>
          </el-table-column>
          <el-table-column label="依赖" min-width="130">
            <template #default="{ row }">
              <span v-if="!row.dependsOn.length" class="text-txt-faint">无</span>
              <span v-else class="text-[12px] text-txt-mute">{{ row.dependsOn.join('、') }}</span>
            </template>
          </el-table-column>
          <el-table-column label="验收点" width="90" align="center">
            <template #default="{ row }">
              <span class="text-[12.5px] text-txt-body">{{ row.acceptance.length }} 项</span>
            </template>
          </el-table-column>
        </el-table>

        <EmptyState
          v-if="!items.length"
          class="mt-6"
          title="尚未解析出需求条目"
          description="在左侧粘贴或上传需求文档，点击「导入并解析」后即可看到条目列表。"
        />
      </div>
    </div>
  </div>
</template>
