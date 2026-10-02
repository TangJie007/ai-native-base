<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Lock, Message, User } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const mode = ref<'login' | 'register'>('login')
const loading = ref(false)
const form = reactive({
  email: '',
  password: '',
  name: '',
})

function switchMode(next: 'login' | 'register') {
  mode.value = next
}

function handleTabChange(name: string | number) {
  switchMode(name as 'login' | 'register')
}

async function submit() {
  if (!form.email || !form.password) {
    ElMessage.warning('请填写邮箱与密码')
    return
  }
  if (mode.value === 'register' && form.password.length < 6) {
    ElMessage.warning('密码至少 6 位')
    return
  }

  loading.value = true
  try {
    if (mode.value === 'login') {
      await auth.login(form.email, form.password)
      ElMessage.success('登录成功')
    } else {
      await auth.register(form.email, form.password, form.name || undefined)
      ElMessage.success('注册成功')
    }
    const redirect = (route.query.redirect as string) || '/dashboard'
    router.replace(redirect)
  } catch {
    // 错误提示由 axios 拦截器统一处理
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-page px-6">
    <div class="w-full max-w-[420px] rounded-card bg-shell p-9 shadow-card">
      <div class="mb-8 flex items-center gap-3">
        <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-brand">
          <svg
            viewBox="0 0 24 24"
            class="h-6 w-6"
            fill="none"
            stroke="#0B0B0F"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M13 2 L5 14 h6 l-1 8 8-12 h-6 z" />
          </svg>
        </div>
        <div>
          <div class="text-[20px] font-medium tracking-tight text-txt-primary">SpecForge</div>
          <div class="text-[12px] text-txt-mute">需求锻造 · AI 原生交付编排</div>
        </div>
      </div>

      <el-tabs v-model="mode" class="mb-2" @tab-change="handleTabChange">
        <el-tab-pane label="登录" name="login" />
        <el-tab-pane label="注册" name="register" />
      </el-tabs>

      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item v-if="mode === 'register'" label="昵称">
          <el-input v-model="form.name" placeholder="请输入昵称" :prefix-icon="User" size="large" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input
            v-model="form.email"
            placeholder="you@example.com"
            :prefix-icon="Message"
            size="large"
          />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            placeholder="请输入密码"
            :prefix-icon="Lock"
            size="large"
            @keyup.enter="submit"
          />
        </el-form-item>
      </el-form>

      <el-button
        type="primary"
        size="large"
        round
        class="mt-2 w-full !font-medium"
        :loading="loading"
        @click="submit"
      >
        {{ mode === 'login' ? '登录' : '注册并进入' }}
      </el-button>

      <div class="mt-5 text-center text-[12px] leading-relaxed text-txt-faint">
        登录后即可创建项目、导入需求并驱动 Agent 流水线
      </div>
    </div>
  </div>
</template>
