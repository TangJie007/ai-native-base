import type { AuthResult, User } from '@specforge/shared'
import { request } from './client'

export interface RegisterPayload {
  email: string
  password: string
  name?: string
}

export interface LoginPayload {
  email: string
  password: string
}

/** 注册 */
export function register(payload: RegisterPayload): Promise<AuthResult> {
  return request.post<AuthResult>('/auth/register', payload)
}

/** 登录 */
export function login(payload: LoginPayload): Promise<AuthResult> {
  return request.post<AuthResult>('/auth/login', payload)
}

/** 获取当前登录用户 */
export function me(): Promise<User> {
  return request.get<User>('/auth/me')
}
