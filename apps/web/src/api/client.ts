import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios'
import { ElMessage } from 'element-plus'
import { ErrorCode, type ApiError } from '@specforge/shared'

// 扩展 axios 配置：silent=true 时业务错误不弹全局提示（用于 404 空状态等预期分支）
declare module 'axios' {
  export interface AxiosRequestConfig {
    silent?: boolean
  }
}

/** 本地存储中 JWT 的键名 */
export const TOKEN_KEY = 'specforge_token'

const instance: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 120000,
})

// 请求拦截器：注入 Bearer Token
instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器：解包 response.data，统一处理错误体 { code, message, details }
instance.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError<ApiError>) => {
    const status = error.response?.status
    const payload = error.response?.data
    const code = payload?.code
    const message = payload?.message || error.message || '请求失败'
    const silent = error.config?.silent
    // 登录/注册接口的 401 属于业务校验失败（账号或密码错误），需直接提示而非跳转
    const isAuthEndpoint = /\/auth\/(login|register)/.test(error.config?.url ?? '')

    if (isAuthEndpoint) {
      if (!silent) ElMessage.error(message)
      return Promise.reject(error)
    }

    if (status === 401 || code === ErrorCode.UNAUTHORIZED) {
      // 登录态失效：清 token 并跳登录页，携带当前地址以便登录后回跳
      localStorage.removeItem(TOKEN_KEY)
      if (window.location.pathname !== '/login') {
        const back = encodeURIComponent(`${window.location.pathname}${window.location.search}`)
        window.location.href = `/login?redirect=${back}`
      }
    } else if (!silent) {
      ElMessage.error(message)
    }
    return Promise.reject(error)
  },
)

/** 已解包 data 的 HTTP 客户端类型 */
export interface HttpClient {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T>
  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>
  put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>
  patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>
  delete<T>(url: string, config?: AxiosRequestConfig): Promise<T>
}

export const request = instance as unknown as HttpClient
export default request
