import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * 模型 API Key 的对称加密（AES-256-GCM）。
 * 密钥由 JWT_SECRET 派生，保证密钥不落明文、不下发前端。
 */
function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest()
}

export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':')
}

export function decryptSecret(payload: string, secret: string): string | null {
  try {
    const [ivRaw, tagRaw, dataRaw] = payload.split(':')
    if (!ivRaw || !tagRaw || !dataRaw) return null
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(ivRaw, 'base64'))
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(dataRaw, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** 生成可复现的伪 embedding（词袋哈希），向量检索无需外部 embedding 服务 */
export function pseudoEmbedding(text: string, dim = 64): number[] {
  const vector = new Array<number>(dim).fill(0)
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/)
    .filter(Boolean)
  for (const token of tokens) {
    const hash = createHash('md5').update(token).digest()
    const index = hash.readUInt32BE(0) % dim
    const sign = hash[4] % 2 === 0 ? 1 : -1
    vector[index] += sign
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1
  return vector.map((v) => v / norm)
}
