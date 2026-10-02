<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Connection,
  RefreshRight,
  VideoPause,
  VideoPlay,
  View,
  WarningFilled,
} from '@element-plus/icons-vue'
import { io, type Socket } from 'socket.io-client'
import type {
  AgentTrace,
  PipelineStatus,
  RequirementItem,
  SandboxFile,
  SandboxState,
} from '@specforge/shared'
import { ITEM_LAYER_META, ITEM_STATUS_META, VERIFICATION_CHECK_META } from '@specforge/shared'
import {
  getPipeline,
  interruptPipeline,
  resolveItem,
  startPipeline,
  type ResolveAction,
  type StartPipelinePayload,
} from '@/api/pipeline'
import { listItems } from '@/api/requirements'
import { metaOf } from '@/utils/meta'
import { getSandbox } from '@/api/sandbox'
import { TOKEN_KEY } from '@/api/client'
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
const starting = ref(false)
const interrupting = ref(false)
const pipeline = ref<PipelineStatus | null>(null)
const items = ref<RequirementItem[]>([])
const sandbox = ref<SandboxState | null>(null)
const liveTraces = ref<AgentTrace[]>([])
const connected = ref(false)
// 启动参数（留空则使用服务端默认值）
const startConcurrency = ref<number>()
const startMaxFixRounds = ref<number>()

let socket: Socket | null = null

const maxFixRounds = computed(() => pipeline.value?.maxFixRounds ?? 3)

/* ---------------- 状态汇总 ---------------- */

const counters = computed(() => {
  const c: Record<string, number> = {}
  for (const it of items.value) c[it.status] = (c[it.status] || 0) + 1
  return c
})

const summary = [
  { label: '已通过', key: 'passed', cls: 'bg-brand text-ink' },
  { label: '生成/验证中', key: 'running', cls: 'bg-ink text-white' },
  { label: '修复中', key: 'fixing', cls: 'bg-amber-400 text-ink' },
  { label: '失败', key: 'failed', cls: 'bg-red-500 text-white' },
  { label: '待人工', key: 'needs_human', cls: 'bg-red-500 text-white' },
  { label: '排队/阻塞', key: 'waiting', cls: 'bg-page text-txt-mute' },
]

const counterOf = (key: string) =>
  key === 'running'
    ? (counters.value.generating || 0) + (counters.value.verifying || 0)
    : key === 'waiting'
      ? (counters.value.pending || 0) + (counters.value.blocked || 0)
      : counters.value[key] || 0

const currentStageLabel = computed(() => {
  const active = pipeline.value?.stages.find((s) => s.state === 'active')
  const cur = active || pipeline.value?.stages.find((s) => s.key === pipeline.value?.currentStage)
  return cur ? `${cur.key} ${cur.label}` : '—'
})

// 首个失败/待人工条目，用于「失败不阻塞」提示
const troubleItem = computed(
  () => items.value.find((i) => i.status === 'needs_human') || items.value.find((i) => i.status === 'failed') || null,
)

/* ---------------- 数据加载 ---------------- */

// 请求序号：快速切换项目时丢弃过期响应，避免旧数据覆盖新项目
let loadSeq = 0

async function load() {
  const pid = projectId.value
  if (!pid) return
  const seq = ++loadSeq
  loading.value = true
  try {
    const [pipelineInfo, itemList, sandboxInfo] = await Promise.all([
      getPipeline(pid),
      listItems(pid),
      getSandbox(pid).catch(() => null),
    ])
    if (seq !== loadSeq) return
    pipeline.value = pipelineInfo
    items.value = itemList
    sandbox.value = sandboxInfo
  } catch {
    // 拦截器已提示
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

async function start() {
  if (!projectId.value) return
  starting.value = true
  try {
    const payload: StartPipelinePayload = {}
    if (startConcurrency.value) payload.concurrency = startConcurrency.value
    if (startMaxFixRounds.value) payload.maxFixRounds = startMaxFixRounds.value
    pipeline.value = await startPipeline(projectId.value, payload)
    ElMessage.success('生成流水线已启动')
    await load()
  } catch {
    // 拦截器已提示
  } finally {
    starting.value = false
  }
}

async function interrupt() {
  if (!projectId.value) return
  interrupting.value = true
  try {
    pipeline.value = await interruptPipeline(projectId.value)
    ElMessage.info('已请求中断流水线')
  } catch {
    // 拦截器已提示
  } finally {
    interrupting.value = false
  }
}

/* ---------------- 人工处理 ---------------- */

const resolveVisible = ref(false)
const resolveTarget = ref<RequirementItem | null>(null)
const resolveAction = ref<ResolveAction>('retry')
const resolveNote = ref('')
const resolving = ref(false)

function openResolve(item: RequirementItem) {
  resolveTarget.value = item
  resolveAction.value = 'retry'
  resolveNote.value = ''
  resolveVisible.value = true
}

async function submitResolve() {
  if (!resolveTarget.value) return
  resolving.value = true
  try {
    const updated = await resolveItem(resolveTarget.value.id, {
      action: resolveAction.value,
      note: resolveNote.value.trim() || undefined,
    })
    const idx = items.value.findIndex((i) => i.id === updated.id)
    if (idx >= 0) items.value[idx] = updated
    resolveVisible.value = false
    ElMessage.success('已提交人工处理')
  } catch {
    // 拦截器已提示
  } finally {
    resolving.value = false
  }
}

function viewTrace(item: RequirementItem) {
  router.push({ name: 'trace', query: { projectId: projectId.value, itemId: item.id } })
}

// 待人工条目高亮整行
function rowClassName({ row }: { row: RequirementItem }) {
  return row.status === 'needs_human' ? 'needs-human-row' : ''
}

/* ---------------- WebSocket 实时推送 ---------------- */

// 过滤非当前项目的事件（房间订阅已隔离，此处防御性再校验一次）
function sameProject(pid?: string | null) {
  return pid === projectId.value
}

// 订阅当前项目房间（服务端会校验项目归属）
function subscribe() {
  if (socket && projectId.value) socket.emit('subscribe', { projectId: projectId.value })
}

function applySandboxFiles(files: SandboxFile[]) {
  if (sandbox.value) sandbox.value = { ...sandbox.value, files }
  else
    sandbox.value = {
      sandboxId: null,
      status: 'ready',
      provider: 'mock',
      files,
      previewUrl: null,
      updatedAt: null,
    }
}

function connectSocket() {
  // 使用相对路径，经 Vite 代理 /socket.io 到后端，避免硬编码后端地址
  socket = io('/ws', {
    auth: { token: localStorage.getItem(TOKEN_KEY) || '' },
  })

  socket.on('connect', () => {
    connected.value = true
    subscribe()
  })
  socket.on('disconnect', () => {
    connected.value = false
  })
  // 断线重连后重新订阅并拉取最新状态，补齐断连期间丢失的事件
  // 注意：reconnect 是 Manager(socket.io) 事件，不是 socket 事件
  socket.io.on('reconnect', () => {
    subscribe()
    void load()
  })

  socket.on('pipeline:status', (payload: PipelineStatus) => {
    if (!sameProject(payload?.projectId)) return
    pipeline.value = payload
  })

  socket.on('item:status', (payload: RequirementItem) => {
    if (!payload || !sameProject(payload.projectId)) return
    const idx = items.value.findIndex((i) => i.id === payload.id)
    if (idx >= 0) items.value[idx] = payload
    else items.value.push(payload)
  })

  socket.on('trace:new', (payload: AgentTrace) => {
    if (!payload || !sameProject(payload.projectId)) return
    liveTraces.value = [payload, ...liveTraces.value].slice(0, 8)
  })

  socket.on('sandbox:files', (payload: { projectId: string; files: SandboxFile[] }) => {
    if (!payload || !sameProject(payload.projectId) || !Array.isArray(payload.files)) return
    applySandboxFiles(payload.files)
  })
}

onMounted(() => {
  if (projectId.value) {
    connectSocket()
    load()
  }
})

onUnmounted(() => {
  socket?.disconnect()
  socket = null
})

watch(projectId, (id) => {
  // 切换项目：先清空上一项目的实时轨迹与状态，避免残留
  liveTraces.value = []
  if (!id) {
    pipeline.value = null
    items.value = []
    sandbox.value = null
    return
  }
  if (!socket) connectSocket()
  subscribe()
  void load()
})
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
    <div class="rounded-card bg-shell p-7 shadow-soft">
      <div class="flex items-center">
        <template v-for="(s, i) in pipeline?.stages ?? []" :key="s.key">
          <div class="flex items-center gap-3">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-medium"
              :class="
                s.state === 'done'
                  ? 'bg-brand text-ink'
                  : s.state === 'active'
                    ? 'bg-ink text-brand'
                    : 'bg-page text-txt-faint'
              "
            >
              <span v-if="s.state === 'done'">✓</span>
              <span v-else>{{ i + 1 }}</span>
            </div>
            <div>
              <div class="text-[11px] text-txt-faint">{{ s.key }}</div>
              <div
                class="text-[13.5px] font-medium"
                :class="s.state === 'todo' ? 'text-txt-faint' : 'text-txt-primary'"
              >
                {{ s.label }}
              </div>
            </div>
          </div>
          <div
            v-if="i < (pipeline?.stages.length ?? 0) - 1"
            class="mx-4 h-0.5 flex-1 rounded-full"
            :class="s.state === 'done' ? 'bg-brand' : 'bg-page'"
          ></div>
        </template>
        <div v-if="!pipeline" class="text-[13px] text-txt-faint">暂无流水线状态</div>
      </div>

      <div class="mt-5 flex items-center justify-between rounded-2xl bg-page px-5 py-3.5">
        <span class="text-[13px] text-txt-body">
          当前阶段 <span class="font-medium text-txt-primary">{{ currentStageLabel }}</span> ·
          并发 {{ pipeline?.concurrency ?? 0 }} · 修复轮次上限 {{ maxFixRounds }} · 单条目失败
          <span class="font-medium text-txt-primary">不阻塞队列</span>
        </span>
        <div class="flex items-center gap-3">
          <span class="flex items-center gap-1.5 text-[12px]" :class="connected ? 'text-brand-deep' : 'text-txt-faint'">
            <el-icon :size="12"><Connection /></el-icon>{{ connected ? '实时连接已建立' : '实时连接断开' }}
          </span>
          <template v-if="!pipeline?.running">
            <el-input-number
              v-model="startConcurrency"
              :min="1"
              :max="8"
              size="small"
              controls-position="right"
              class="!w-24"
              placeholder="并发"
            />
            <el-input-number
              v-model="startMaxFixRounds"
              :min="0"
              :max="10"
              size="small"
              controls-position="right"
              class="!w-24"
              placeholder="修复轮次"
            />
          </template>
          <el-button
            v-if="pipeline?.running"
            size="small"
            round
            :loading="interrupting"
            @click="interrupt"
          >
            <el-icon class="mr-1"><VideoPause /></el-icon>中断流水线
          </el-button>
          <el-button
            v-else
            type="primary"
            size="small"
            round
            :loading="starting"
            @click="start"
          >
            <el-icon class="mr-1"><VideoPlay /></el-icon>开始生成
          </el-button>
        </div>
      </div>

      <div v-if="pipeline?.summary" class="mt-3 rounded-2xl bg-brand-soft px-5 py-3 text-[12.5px] text-brand-deep">
        {{ pipeline.summary }}
      </div>
    </div>

    <div class="grid grid-cols-6 gap-4">
      <div
        v-for="s in summary"
        :key="s.key"
        class="rounded-card p-5 shadow-soft"
        :class="s.cls === 'bg-page text-txt-mute' ? 'bg-shell' : s.cls"
      >
        <div class="text-[26px] font-medium leading-none">{{ counterOf(s.key) }}</div>
        <div class="mt-1.5 text-[12px] opacity-80">{{ s.label }}</div>
      </div>
    </div>

    <div class="rounded-card bg-shell p-7 shadow-soft">
      <div class="mb-5 flex items-center justify-between">
        <span class="text-[16px] font-medium text-txt-primary">需求条目执行状态</span>
        <el-tag effect="light" round>{{ connected ? '实时刷新 · WebSocket 推送' : '轮询状态' }}</el-tag>
      </div>

      <el-table
        v-if="items.length"
        :data="items"
        style="width: 100%"
        :header-cell-style="{ background: 'transparent', color: '#8D8D99', fontSize: '12px' }"
        :row-class-name="rowClassName"
      >
        <el-table-column prop="code" label="编号" width="100" />
        <el-table-column prop="title" label="条目" min-width="160" />
        <el-table-column label="层级" width="90">
          <template #default="{ row }">
            <StatusTag :meta="metaOf(ITEM_LAYER_META, row.layer)" />
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <StatusTag :meta="metaOf(ITEM_STATUS_META, row.status)" />
          </template>
        </el-table-column>
        <el-table-column label="修复轮次" width="90" align="center">
          <template #default="{ row }">
            <span :class="row.retryCount >= maxFixRounds ? 'font-medium text-red-500' : 'text-txt-body'">
              {{ row.retryCount }}/{{ maxFixRounds }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="产物" width="90" align="center">
          <template #default="{ row }">
            <span class="text-[12.5px] text-txt-body">{{ row.filePaths.length }} 个文件</span>
          </template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" width="170" />
        <el-table-column label="操作" width="160" align="right">
          <template #default="{ row }">
            <template v-if="row.status === 'needs_human' || row.status === 'failed'">
              <el-button size="small" type="danger" round @click="openResolve(row)">
                <el-icon class="mr-1"><WarningFilled /></el-icon>人工处理
              </el-button>
            </template>
            <template v-else-if="row.status === 'fixing'">
              <el-button size="small" text class="!text-brand-deep">
                <el-icon class="mr-1"><RefreshRight /></el-icon>第 {{ row.retryCount + 1 }} 轮修复中
              </el-button>
            </template>
            <template v-else>
              <el-button size="small" text class="!text-brand-deep" @click="viewTrace(row)">
                <el-icon class="mr-1"><View /></el-icon>查看 Trace
              </el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <EmptyState v-else title="暂无需求条目" description="请先在「需求解析」导入需求文档。" />

      <div
        v-if="troubleItem"
        class="mt-5 flex items-center gap-3 rounded-2xl bg-brand-soft px-5 py-4"
      >
        <el-icon :size="16" class="text-brand-deep"><WarningFilled /></el-icon>
        <span class="flex-1 text-[13px] leading-relaxed text-brand-deep">
          <span class="font-medium">{{ troubleItem.code }} {{ troubleItem.title }}</span>
          已达修复上限（{{ troubleItem.retryCount }}/{{ maxFixRounds }}），错误现场与修复历史已存档，
          队列中其余条目未受影响继续执行——这就是「失败不阻塞」策略。
        </span>
        <el-button size="small" round type="primary" @click="openResolve(troubleItem)">
          查看错误现场
        </el-button>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-6">
      <div class="rounded-card bg-shell p-7 shadow-soft">
        <div class="mb-4 flex items-center justify-between">
          <span class="text-[16px] font-medium text-txt-primary">实时事件流</span>
          <span class="text-[12px] text-txt-faint">trace:new · item:status · pipeline:status</span>
        </div>
        <div v-if="liveTraces.length" class="space-y-2.5">
          <div
            v-for="t in liveTraces"
            :key="t.id"
            class="flex items-center gap-3 rounded-2xl bg-page px-4 py-3"
          >
            <el-tag size="small" effect="dark" round>{{ t.agentName }}</el-tag>
            <span class="flex-1 truncate text-[13px] text-txt-primary">{{ t.action }}</span>
            <span class="shrink-0 text-[11px] text-txt-faint">{{ t.durationMs }}ms</span>
          </div>
        </div>
        <div v-else class="text-[12.5px] text-txt-faint">等待 WebSocket 推送事件…</div>
      </div>

      <div class="rounded-card bg-shell p-7 shadow-soft">
        <div class="mb-4 flex items-center justify-between">
          <span class="text-[16px] font-medium text-txt-primary">沙箱</span>
          <el-tag v-if="sandbox" size="small" round effect="light">{{ sandbox.status }}</el-tag>
        </div>
        <div v-if="sandbox" class="space-y-3 text-[13px]">
          <div class="flex justify-between">
            <span class="text-txt-mute">Provider</span><span class="font-medium">{{ sandbox.provider }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-txt-mute">文件数</span><span class="font-medium">{{ sandbox.files.length }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-txt-mute">预览地址</span>
            <span v-if="sandbox.previewUrl" class="font-medium text-brand-deep">{{ sandbox.previewUrl }}</span>
            <span v-else class="text-txt-faint">—</span>
          </div>
        </div>
        <div v-else class="text-[12.5px] text-txt-faint">沙箱尚未创建。</div>
      </div>
    </div>

    <el-dialog v-model="resolveVisible" title="人工处理条目" width="560px">
      <div v-if="resolveTarget" class="space-y-3">
        <div class="flex items-center gap-2">
          <span class="text-[11px] text-txt-faint">{{ resolveTarget.code }}</span>
          <span class="text-[14px] font-medium text-txt-primary">{{ resolveTarget.title }}</span>
        </div>
        <div
          v-if="resolveTarget.errorSnapshot"
          class="rounded-2xl bg-[#161821] p-4 text-[12px] text-[#D6DAE3]"
        >
          <div class="mb-1 text-[11px] text-[#8D8D99]">
            {{ VERIFICATION_CHECK_META[resolveTarget.errorSnapshot.checkType].label }} ·
            第 {{ resolveTarget.errorSnapshot.round }} 轮
          </div>
          <pre class="code-block whitespace-pre-wrap">{{ resolveTarget.errorSnapshot.output || resolveTarget.errorSnapshot.message }}</pre>
        </div>
        <el-form label-position="top">
          <el-form-item label="处理方式">
            <el-radio-group v-model="resolveAction">
              <el-radio value="retry">重试</el-radio>
              <el-radio value="skip">跳过</el-radio>
              <el-radio value="mark_passed">标记通过</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="resolveNote" type="textarea" :rows="2" placeholder="可选，记录处理说明" />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button round @click="resolveVisible = false">取消</el-button>
        <el-button type="primary" round :loading="resolving" @click="submitResolve">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>
