#!/usr/bin/env node
/**
 * init_spec_structure.js
 * 根据 PRD 解析结果初始化 Spec 目录结构
 * 用法: node init_spec_structure.js <parsed_json> <output_dir>
 *
 * parsed_json: PRD 解析结果 JSON 文件路径，格式：
 *   { "modules": [ { "name": "用户管理", "features": [ { "name": "用户注册", "description": "...", "acceptance": [...] } ] } ] }
 * output_dir: Spec 输出目录，默认为 ./specs
 */

const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────

function loadParsedJson(filePath) {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`❌ 找不到解析结果文件: ${absPath}`);
    process.exit(1);
  }
  try {
    const content = fs.readFileSync(absPath, 'utf8');
    const parsed = JSON.parse(content);
    // 兼容 skill 文档中的数组格式与 { modules: [] } 格式
    if (Array.isArray(parsed)) return { modules: parsed };
    return parsed;
  } catch (e) {
    console.error(`❌ JSON 解析失败: ${e.message}`);
    process.exit(1);
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`📁 创建目录: ${dirPath}`);
  }
}

function sanitizeFileName(name) {
  // 中文文件名直接保留，只替换文件系统非法字符
  return name.replace(/[<>:"/\\|?*]/g, '_').trim();
}

// ─────────────────────────────────────────────
// YAML 生成
// ─────────────────────────────────────────────

function generateYamlSpec(moduleName, feature, version) {
  const now = new Date().toISOString().split('T')[0];
  const acceptanceYaml = (feature.acceptance || []).map(a =>
    `  - "${a.replace(/"/g, '\\"')}"`
  ).join('\n');

  return `# Spec 文件: ${feature.name}
# 模块: ${moduleName}
# 生成时间: ${now}
# 版本: ${version}

spec:
  id: "${moduleName}-${feature.name}"
  name: "${feature.name}"
  module: "${moduleName}"
  description: "${feature.description.replace(/"/g, '\\"')}"
  status: "draft"
  priority: "${feature.priority || 'medium'}"
  tags: [${feature.tags ? feature.tags.map(t => `"${t}"`).join(', ') : ''}]
  acceptance:
${acceptanceYaml || '  []'}
  dependencies: [${feature.dependencies ? feature.dependencies.map(d => `"${d}"`).join(', ') : ''}]
  notes: "${feature.notes || ''}"
  changelog:
    - date: "${now}"
      author: "AI"
      summary: "初始版本，由 PRD 解析生成"
      changes:
        - "全量生成"
  version: "${version}"
  updated_at: "${now}"
`;
}

// ─────────────────────────────────────────────
// Markdown 生成
// ─────────────────────────────────────────────

function generateMdSpec(moduleName, feature, version) {
  const now = new Date().toISOString().split('T')[0];
  const acceptanceMd = (feature.acceptance || []).map(a => `- [ ] ${a}`).join('\n');
  const depsMd = (feature.dependencies || []).map(d => `- ${d}`).join('\n') || '（无）';
  const tagsMd = (feature.tags || []).map(t => `\`${t}\``).join(' ') || '（无）';

  return `# Spec: ${feature.name}

> **模块**: ${moduleName}  
> **状态**: 🔵 草稿（draft）  
> **优先级**: ${feature.priority || 'medium'}  
> **版本**: ${version}  
> **更新时间**: ${now}

---

## 功能描述

${feature.description}

---

## 验收标准

${acceptanceMd || '（待补充）'}

---

## 依赖关系

${depsMd}

---

## 标签

${tagsMd}

---

## 变更记录

| 日期 | 作者 | 摘要 | 变更内容 |
|------|------|------|----------|
| ${now} | AI | 初始版本，由 PRD 解析生成 | 全量生成 |

---

## 备注

${feature.notes || '（无）'}
`;
}

// ─────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error(`
用法:
  node init_spec_structure.js <parsed_json> [output_dir] [version]

参数:
  parsed_json  PRD 解析结果 JSON 文件（见下方格式说明）
  output_dir   Spec 输出目录（默认 ./specs）
  version      Spec 版本号（默认 0.1.0）

JSON 格式示例:
{
  "modules": [
    {
      "name": "用户管理",
      "features": [
        {
          "name": "用户注册",
          "description": "允许用户通过手机号注册账号",
          "priority": "high",
          "tags": ["注册", "认证"],
          "acceptance": ["用户可以通过手机号注册", "注册成功发送欢迎邮件"],
          "dependencies": [],
          "notes": ""
        }
      ]
    }
  ]
}
`);
    process.exit(1);
  }

  const parsedFile = args[0];
  const outputDir = args[1] || './specs';
  const version = args[2] || '0.1.0';

  const parsed = loadParsedJson(parsedFile);
  const modules = parsed.modules || [];

  if (modules.length === 0) {
    console.error('❌ parsed_json 中未找到 modules 字段或为空');
    process.exit(1);
  }

  console.log(`\n📦 开始初始化 Spec 结构...`);
  console.log(`   输入: ${parsedFile}`);
  console.log(`   输出: ${path.resolve(outputDir)}`);
  console.log(`   版本: ${version}\n`);

  let totalYaml = 0;
  let totalMd = 0;

  for (const mod of modules) {
    const moduleDir = path.join(outputDir, sanitizeFileName(mod.name));
    ensureDir(moduleDir);

    const features = mod.features || [];
    if (features.length === 0) {
      console.log(`   ⚠️  模块「${mod.name}」下无功能，跳过`);
      continue;
    }

    for (const feature of features) {
      const baseName = sanitizeFileName(feature.name);
      const yamlPath = path.join(moduleDir, `${baseName}_spec.yaml`);
      const mdPath = path.join(moduleDir, `${baseName}_spec.md`);

      // 如果文件已存在，跳过（不覆盖）
      if (fs.existsSync(yamlPath) || fs.existsSync(mdPath)) {
        console.log(`   ⏭️  跳过已存在: ${mod.name}/${baseName}_spec`);
        continue;
      }

      fs.writeFileSync(yamlPath, generateYamlSpec(mod.name, feature, version), 'utf8');
      totalYaml++;
      console.log(`   ✅ 生成: ${mod.name}/${baseName}_spec.yaml`);

      fs.writeFileSync(mdPath, generateMdSpec(mod.name, feature, version), 'utf8');
      totalMd++;
      console.log(`   ✅ 生成: ${mod.name}/${baseName}_spec.md`);
    }
  }

  console.log(`\n🎉 完成！共生成 ${totalYaml} 个 YAML 文件和 ${totalMd} 个 Markdown 文件`);
  console.log(`   输出目录: ${path.resolve(outputDir)}\n`);

  // 自动生成索引（Comet 式文档同步）
  try {
    const { execSync } = require('child_process');
    execSync(`node "${path.join(__dirname, 'generate_indexes.js')}" "${path.resolve(outputDir)}"`, { stdio: 'inherit' });
    execSync(`node "${path.join(__dirname, 'wetspec_state.js')}" init "${path.resolve(outputDir)}"`, { stdio: 'inherit' });
  } catch (e) {
    console.log(`   ⚠️  索引/状态初始化跳过: ${e.message}`);
  }
}

main();
