import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Project } from '@specforge/shared'
import { getProject } from '@/api/projects'

const CURRENT_PROJECT_KEY = 'specforge_current_project'

/** 当前项目上下文：id 持久化，详情按需加载 */
export const useProjectStore = defineStore('project', () => {
  const currentId = ref<string>(localStorage.getItem(CURRENT_PROJECT_KEY) || '')
  const current = ref<Project | null>(null)
  const loading = ref(false)

  const hasProject = computed(() => !!currentId.value)

  function setCurrentId(id: string) {
    currentId.value = id
    if (id) localStorage.setItem(CURRENT_PROJECT_KEY, id)
    else localStorage.removeItem(CURRENT_PROJECT_KEY)
    if (current.value && current.value.id !== id) current.value = null
  }

  function setCurrent(project: Project | null) {
    current.value = project
    setCurrentId(project?.id || '')
  }

  /** 加载项目详情；不传参时使用已保存的当前项目 */
  async function load(id?: string): Promise<Project | null> {
    const targetId = id || currentId.value
    if (!targetId) return null
    loading.value = true
    try {
      const project = await getProject(targetId)
      current.value = project
      setCurrentId(project.id)
      return project
    } catch {
      // 加载失败（含 401，拦截器已提示/跳转）时清空详情，避免遗留脏数据向上抛
      current.value = null
      return null
    } finally {
      loading.value = false
    }
  }

  return { currentId, current, loading, hasProject, setCurrentId, setCurrent, load }
})
