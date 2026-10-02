import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC_KEY = 'isPublic'

/** 标注为公开路由，跳过全局 JWT 守卫（登录/注册/健康检查） */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
