<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Box, Document, Refresh, VideoPlay } from '@element-plus/icons-vue'
import type { SandboxFile, SandboxState } from '@specforge/shared'
import { createSandbox, getSandbox, getSandboxFile, listSandboxFiles } from '@/api/sandbox'
import { useProjectStore } from '@/stores/project'
import EmptyState from '@/components/EmptyState.vue'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()

const projectId = computed(
  () => (route.query.projectId as string | undefined) || projectStore.currentId,
)

const loading = ref(false)
const creating = ref(false)
const sandbox = ref<SandboxState | null>(null)
const files = ref<SandboxFile[]>([])

const activePath = ref('')
const fileLoading = ref(false)
const fileContent = ref('')

const statusMeta: Record<
  SandboxState['status'],
  { label: string; type: 'info' | 'warning' | 'success' | 'danger' }
> = {
  none: { label: '未创建', type: 'info' },
  creating: { label: '创建中', type: 'warning' },
  ready: { label: '就绪', type: 'success' },
  destroyed: { label: '已销毁', type: 'info' },
  error: { label: '异常', type: 'danger' },
}

const canCreate = computed(
  () => !sandbox.value || sandbox.value.status === 'none' || sandbox.value.status === 'destroyed',
)

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

async function load() {
  if (!projectId.value) return
  loading.value = true
  try {
    const state = await getSandbox(projectId.value).catch(() => null)
    sandbox.value = state
    files.value = state?.files?.length
      ? state.files
      : await listSandboxFiles(projectId.value).catch(() => [])
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

async function create() {
  if (!projectId.value) return
  creating.value = true
  try {
    sandbox.value = await createSandbox(projectId.value)
    ElMessage.success('沙箱已创建')
    await load()
  } catch {
    // 拦截器已提示
  } finally {
    creating.value = false
  }
}

async function openFile(file: SandboxFile) {
  if (!projectId.value) return
  activePath.value = file.path
  fileLoading.value = true
  try {
    const content = await getSandboxFile(projectId.value, file.path)
    fileContent.value = content.content
  } catch {
    fileContent.value = ''
  } finally {
    fileLoading.value = false
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
    <div class="flex items-center gap-6 rounded-card bg-shell p-7 shadow-soft">
      <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand">
        <el-icon :size="26" class="text-ink"><Box /></el-icon>
      </div>
      <div class="flex-1">
        <div class="flex items-center gap-2">
          <span class="text-[18px] font-medium text-txt-primary">沙箱环境</span>
          <el-tag v-if="sandbox" size="small" round :type="statusMeta[sandbox.status].type">
            {{ statusMeta[sandbox.status].label }}
          </el-tag>
        </div>
        <div class="mt-1.5 text-[13px] leading-relaxed text-txt-mute">
          Agent 生成的代码在此运行验证，验证通过后方可进入人工回归。
        </div>
      </div>
      <div class="flex shrink-0 gap-2">
        <el-button round @click="load">
          <el-icon class="mr-1"><Refresh /></el-icon>刷新
        </el-button>
        <el-button
          v-if="canCreate"
          type="primary"
          round
          :loading="creating"
          @click="create"
        >
          <el-icon class="mr-1"><VideoPlay /></el-icon>创建沙箱
        </el-button>
      </div>
    </div>

    <div v-if="sandbox" class="grid grid-cols-3 gap-4">
      <div class="rounded-card bg-shell p-5 shadow-soft">
        <div class="text-[11px] text-txt-faint">Provider</div>
        <div class="mt-1 text-[15px] font-medium text-txt-primary">{{ sandbox.provider }}</div>
      </div>
      <div class="rounded-card bg-shell p-5 shadow-soft">
        <div class="text-[11px] text-txt-faint">沙箱 ID</div>
        <div class="mt-1 truncate text-[15px] font-medium text-txt-primary">
          {{ sandbox.sandboxId || '—' }}
        </div>
      </div>
      <div class="rounded-card bg-shell p-5 shadow-soft">
        <div class="text-[11px] text-txt-faint">预览地址</div>
        <a
          v-if="sandbox.previewUrl"
          :href="sandbox.previewUrl"
          target="_blank"
          rel="noreferrer"
          class="mt-1 block truncate text-[15px] font-medium text-brand-deep hover:underline"
        >
          {{ sandbox.previewUrl }}
        </a>
        <div v-else class="mt-1 text-[15px] font-medium text-txt-faint">—</div>
      </div>
    </div>

    <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-6">
      <div class="rounded-card bg-shell p-7 shadow-soft">
        <div class="mb-4 flex items-center justify-between">
          <span class="text-[16px] font-medium text-txt-primary">文件列表</span>
          <span class="text-[12px] text-txt-faint">{{ files.length }} 个文件</span>
        </div>
        <div v-if="files.length" class="space-y-1.5">
          <button
            v-for="f in files"
            :key="f.path"
            class="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-colors"
            :class="activePath === f.path ? 'bg-brand-soft' : 'hover:bg-page'"
            @click="openFile(f)"
          >
            <el-icon :size="15" :class="activePath === f.path ? 'text-brand-deep' : 'text-txt-mute'">
              <Document />
            </el-icon>
            <span class="flex-1 truncate text-[13px] text-txt-primary">{{ f.path }}</span>
            <span class="shrink-0 text-[11px] text-txt-faint">{{ formatSize(f.size) }}</span>
          </button>
        </div>
        <div v-else class="py-8 text-center text-[12.5px] text-txt-faint">
          暂无文件，创建沙箱并运行生成后可见。
        </div>
      </div>

      <div class="rounded-card bg-shell p-7 shadow-soft">
        <div class="mb-4 flex items-center justify-between">
          <span class="text-[16px] font-medium text-txt-primary">文件预览</span>
          <span class="truncate text-[12px] text-txt-faint">{{ activePath || '未选择文件' }}</span>
        </div>
        <div v-loading="fileLoading" class="min-h-[320px] rounded-2xl bg-[#161821] p-5">
          <pre
            v-if="fileContent"
            class="code-block max-h-[520px] overflow-auto whitespace-pre-wrap text-[12px] text-[#D6DAE3]"
          >{{ fileContent }}</pre>
          <div v-else class="py-20 text-center text-[12.5px] text-[#8D8D99]">
            {{ activePath ? '文件内容为空' : '从左侧选择文件查看内容' }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
