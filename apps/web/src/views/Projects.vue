<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { FolderAdd, Plus } from '@element-plus/icons-vue'
import type { Project } from '@specforge/shared'
import { PROJECT_STATUS_META, PIPELINE_STAGES } from '@specforge/shared'
import { createProject, deleteProject, listProjects } from '@/api/projects'
import { metaOf } from '@/utils/meta'
import { useProjectStore } from '@/stores/project'
import StatusTag from '@/components/StatusTag.vue'
import EmptyState from '@/components/EmptyState.vue'

const router = useRouter()
const projectStore = useProjectStore()

const loading = ref(true)
const projects = ref<Project[]>([])

const dialogVisible = ref(false)
const submitting = ref(false)
const form = reactive({ name: '', description: '' })

const stageLabel = (key: string) =>
  PIPELINE_STAGES.find((s) => s.key === key)?.label ?? key

async function load() {
  loading.value = true
  try {
    projects.value = await listProjects()
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

function openCreate() {
  form.name = ''
  form.description = ''
  dialogVisible.value = true
}

async function submitCreate() {
  if (!form.name.trim()) {
    ElMessage.warning('请填写项目名')
    return
  }
  submitting.value = true
  try {
    const project = await createProject({
      name: form.name.trim(),
      description: form.description.trim(),
    })
    dialogVisible.value = false
    projectStore.setCurrent(project)
    ElMessage.success('项目已创建，请导入需求文档')
    router.push({ name: 'requirements', query: { projectId: project.id, onboarding: '1' } })
  } catch {
    // 拦截器已提示
  } finally {
    submitting.value = false
  }
}

function openProject(project: Project) {
  projectStore.setCurrent(project)
  router.push({ name: 'requirements', query: { projectId: project.id } })
}

async function removeProject(project: Project) {
  try {
    await ElMessageBox.confirm(`确认删除项目「${project.name}」？该操作不可撤销。`, '删除项目', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await deleteProject(project.id)
    ElMessage.success('项目已删除')
    if (projectStore.currentId === project.id) projectStore.setCurrent(null)
    await load()
  } catch {
    // 拦截器已提示
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between rounded-card bg-shell p-6 shadow-soft">
      <div>
        <div class="text-[16px] font-medium text-txt-primary">我的项目</div>
        <p class="mt-1.5 text-[13px] text-txt-body">
          每个项目对应一份需求文档、一份契约与一条生成流水线。
        </p>
      </div>
      <el-button type="primary" round size="large" @click="openCreate">
        <el-icon class="mr-1"><Plus /></el-icon>
        新建项目
      </el-button>
    </div>

    <div class="rounded-card bg-shell p-7 shadow-soft">
      <el-table
        v-loading="loading"
        :data="projects"
        style="width: 100%"
        :header-cell-style="{ background: 'transparent', color: '#8D8D99', fontSize: '12px' }"
      >
        <el-table-column prop="name" label="项目" min-width="180">
          <template #default="{ row }">
            <div class="text-[13.5px] font-medium text-txt-primary">{{ row.name }}</div>
            <div class="mt-0.5 max-w-[280px] truncate text-[12px] text-txt-faint">
              {{ row.description || '暂无描述' }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="140">
          <template #default="{ row }">
            <StatusTag :meta="metaOf(PROJECT_STATUS_META, row.status)" />
          </template>
        </el-table-column>
        <el-table-column label="当前阶段" width="130">
          <template #default="{ row }">
            <span class="text-[13px] text-txt-body">{{ row.currentStage }} · {{ stageLabel(row.currentStage) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" width="180" />
        <el-table-column label="操作" width="160" align="right">
          <template #default="{ row }">
            <el-button text size="small" class="!text-brand-deep" @click="openProject(row)">
              打开
            </el-button>
            <el-button text size="small" class="!text-red-500" @click="removeProject(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <EmptyState
        v-if="!loading && !projects.length"
        class="mt-6"
        title="还没有项目"
        description="新建项目后，导入结构化 PRD 即可解析出需求条目与假设清单。"
      >
        <el-button type="primary" round @click="openCreate">
          <el-icon class="mr-1"><FolderAdd /></el-icon>
          新建项目
        </el-button>
      </EmptyState>
    </div>

    <el-dialog v-model="dialogVisible" title="新建项目" width="460px">
      <el-form label-position="top">
        <el-form-item label="项目名" required>
          <el-input v-model="form.name" placeholder="例如：库存管理 SaaS" maxlength="64" />
        </el-form-item>
        <el-form-item label="项目描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            placeholder="一句话描述系统目标（可选）"
            maxlength="500"
          />
        </el-form-item>
      </el-form>
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="创建后下一步：导入需求文档"
        description="进入「需求解析」粘贴或上传 PRD，AI 将切分需求条目并生成假设清单。"
      />
      <template #footer>
        <el-button round @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" round :loading="submitting" @click="submitCreate">
          创建项目
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>
