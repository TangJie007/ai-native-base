import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { AuthResult, User } from '@specforge/shared'
import * as authApi from '@/api/auth'
import { TOKEN_KEY } from '@/api/client'

/** 登录态：token 持久化 localStorage，user 内存缓存 */
export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(localStorage.getItem(TOKEN_KEY) || '')
  const user = ref<User | null>(null)

  const isLoggedIn = computed(() => !!token.value)

  function setToken(value: string) {
    token.value = value
    if (value) localStorage.setItem(TOKEN_KEY, value)
    else localStorage.removeItem(TOKEN_KEY)
  }

  async function login(email: string, password: string): Promise<AuthResult> {
    const result = await authApi.login({ email, password })
    setToken(result.token)
    user.value = result.user
    return result
  }

  async function register(email: string, password: string, name?: string): Promise<AuthResult> {
    const result = await authApi.register({ email, password, name })
    setToken(result.token)
    user.value = result.user
    return result
  }

  async function fetchMe(): Promise<User> {
    const me = await authApi.me()
    user.value = me
    return me
  }

  function logout() {
    setToken('')
    user.value = null
  }

  return { token, user, isLoggedIn, setToken, login, register, fetchMe, logout }
})
