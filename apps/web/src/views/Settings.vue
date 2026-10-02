<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Connection, Key, Setting as SettingIcon } from '@element-plus/icons-vue'
import type { ModelTierBinding } from '@specforge/shared'
import { MODEL_TIER_META } from '@specforge/shared'
import { getModelSettings, testModel, updateModelSettings } from '@/api/settings'
import EmptyState from '@/components/EmptyState.vue'

const loading = ref(true)
const saving = ref(false)
const testingTier = ref<string>('')
const apiKeyConfigured = ref(false)
const tiers = ref<ModelTierBinding[]>([])

const form = reactive({
  provider: '',
  baseUrl: '',
  fallbackModel: '',
  // 密钥只写不回显，留空表示不修改
  apiKey: '',
})

async function load() {
  loading.value = true
  try {
    const settings = await getModelSettings()
    form.provider = settings.provider
    form.baseUrl = settings.baseUrl
    form.fallbackModel = settings.fallbackModel
    form.apiKey = ''
    apiKeyConfigured.value = settings.apiKeyConfigured
    tiers.value = settings.tiers.map((t) => ({ ...t }))
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    const payload = {
      provider: form.provider.trim(),
      baseUrl: form.baseUrl.trim(),
      fallbackModel: form.fallbackModel.trim(),
      tiers: tiers.value.map((t) => ({ tier: t.tier, model: t.model })),
      ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
    }
    const settings = await updateModelSettings(payload)
    apiKeyConfigured.value = settings.apiKeyConfigured
    form.apiKey = ''
    ElMessage.success('模型配置已保存')
  } catch {
    // 拦截器已提示
  } finally {
    saving.value = false
  }
}

async function runTest(tier: ModelTierBinding) {
  if (!tier.model) {
    ElMessage.warning('请先填写模型名')
    return
  }
  testingTier.value = tier.tier
  try {
    const result = await testModel({ model: tier.model })
    if (result.ok) ElMessage.success(result.message || '连通性正常')
    else ElMessage.error(result.message || '连通性测试失败')
  } catch {
    // 拦截器已提示
  } finally {
    testingTier.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="space-y-6">
    <div class="rounded-card bg-shell p-7 shadow-soft">
      <div class="mb-5 flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand">
          <el-icon :size="20" color="#0B0B0F"><SettingIcon /></el-icon>
        </div>
        <div>
          <div class="text-[16px] font-medium text-txt-primary">模型服务</div>
          <div class="mt-0.5 text-[12.5px] text-txt-mute">Provider / Base URL / 降级模型</div>
        </div>
      </div>

      <el-form label-position="top" class="max-w-[720px]">
        <div class="grid grid-cols-2 gap-4">
          <el-form-item label="Provider">
            <el-input v-model="form.provider" placeholder="例如：openai / deepseek / 通义千问" />
          </el-form-item>
          <el-form-item label="Base URL">
            <el-input v-model="form.baseUrl" placeholder="https://api.example.com/v1" />
          </el-form-item>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <el-form-item label="API Key">
            <el-input
              v-model="form.apiKey"
              type="password"
              show-password
              :placeholder="apiKeyConfigured ? '已配置（留空表示不修改）' : '尚未配置，请输入密钥'"
            >
              <template #prefix><el-icon><Key /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-form-item label="降级模型">
            <el-input v-model="form.fallbackModel" placeholder="主模型不可用时使用的兜底模型" />
          </el-form-item>
        </div>
      </el-form>

      <div
        class="rounded-2xl bg-brand-soft px-5 py-3.5 text-[12.5px] leading-relaxed text-brand-deep"
      >
        API Key 仅服务端存储，下发时永远不回显；留空保存即保持原密钥不变。
      </div>
    </div>

    <div class="rounded-card bg-shell p-7 shadow-soft">
      <div class="mb-5">
        <div class="text-[16px] font-medium text-txt-primary">模型档位绑定</div>
        <div class="mt-0.5 text-[12.5px] text-txt-mute">按环节分档调用，高价值环节用高能力模型，量大环节用性价比模型。</div>
      </div>

      <div v-if="tiers.length" class="space-y-3">
        <div
          v-for="t in tiers"
          :key="t.tier"
          class="flex items-center gap-4 rounded-2xl bg-page p-5"
        >
          <div class="w-36 shrink-0">
            <el-tag
              :type="t.tier === 'high' ? 'primary' : t.tier === 'value' ? 'success' : 'warning'"
              effect="dark"
              round
            >
              {{ MODEL_TIER_META[t.tier].label }}
            </el-tag>
          </div>
          <div class="flex flex-1 flex-wrap gap-1.5">
            <span
              v-for="stage in MODEL_TIER_META[t.tier].stages"
              :key="stage"
              class="rounded-full bg-shell px-2.5 py-1 text-[11px] text-txt-mute"
            >
              {{ stage }}
            </span>
          </div>
          <el-input v-model="t.model" class="!w-64" placeholder="模型名，例如 gpt-4o" />
          <el-button
            round
            :loading="testingTier === t.tier"
            @click="runTest(t)"
          >
            <el-icon class="mr-1"><Connection /></el-icon>测试连通
          </el-button>
        </div>
      </div>

      <EmptyState
        v-else
        title="暂无档位配置"
        description="后端尚未返回模型档位绑定，请稍后重试。"
      />

      <div class="mt-6 flex justify-end">
        <el-button type="primary" round size="large" :loading="saving" @click="save">
          保存配置
        </el-button>
      </div>
    </div>
  </div>
</template>
