import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import ShellLayout from '@/layouts/ShellLayout.vue'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/Login.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/',
    component: ShellLayout,
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: '工作台' },
      },
      {
        path: 'projects',
        name: 'projects',
        component: () => import('@/views/Projects.vue'),
        meta: { title: '项目' },
      },
      {
        path: 'requirements',
        name: 'requirements',
        component: () => import('@/views/Requirements.vue'),
        meta: { title: '需求解析' },
      },
      {
        path: 'assumptions',
        name: 'assumptions',
        component: () => import('@/views/Assumptions.vue'),
        meta: { title: '假设确认' },
      },
      {
        path: 'contract',
        name: 'contract',
        component: () => import('@/views/Contract.vue'),
        meta: { title: '契约锁定' },
      },
      {
        path: 'dependencies',
        name: 'dependencies',
        component: () => import('@/views/Dependencies.vue'),
        meta: { title: '依赖编排' },
      },
      {
        path: 'pipeline',
        name: 'pipeline',
        component: () => import('@/views/Pipeline.vue'),
        meta: { title: '生成监控' },
      },
      {
        path: 'trace',
        name: 'trace',
        component: () => import('@/views/Trace.vue'),
        meta: { title: 'Trace 轨迹' },
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/Settings.vue'),
        meta: { title: '设置' },
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// 全局守卫：除 /login 外均需登录；有 token 但无 user 时补齐用户信息
router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (to.meta.public) {
    if (auth.isLoggedIn && to.name === 'login') return { path: '/dashboard' }
    return true
  }

  if (!auth.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (!auth.user) {
    try {
      await auth.fetchMe()
    } catch {
      // 拦截器已处理 401 跳转
    }
  }

  return true
})

export default router
