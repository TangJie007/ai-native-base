#!/usr/bin/env node
/**
 * sync_spec_md.js — 从 YAML 同步生成 Markdown（Comet 式文档同步）
 * 用法: node sync_spec_md.js <spec_dir> [--check] [--file <yaml_path>]
 *
 * --check  仅检查 MD 是否与 YAML 同步，不写入
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  findYamlSpecs,
  loadYamlFile,
  getSpecFormat,
  priorityLabel,
  statusLabel,
} = require('./lib/spec_utils');

const STATUS_ZH = { draft: '草稿', review: '评审中', approved: '已批准', implemented: '已实现', deprecated: '已废弃' };

function testMethodZh(v) {
  const map = { manual: '手动', auto: '自动', both: '手动/自动' };
  return map[v] || v || '手动';
}

function renderStandardMd(data) {
  const m = data.metadata;
  const d = data.description;
  const status = STATUS_ZH[m.status] || m.status;

  const stories = (data.user_stories || []).map(us =>
    `| ${us.id} | ${us.role} | ${us.action} | ${us.goal} | ${us.priority || m.priority} |`
  ).join('\n');

  const criteria = (data.acceptance_criteria || []).map(ac =>
    `| ${ac.id} | ${ac.description} | ${ac.expected_result || ''} | ${testMethodZh(ac.test_method)} |`
  ).join('\n');

  const deps = data.dependencies || {};
  const internal = (deps.internal || []).join('、') || '无';
  const external = (deps.external || []).join('、') || '无';
  const blocked = (deps.blocked_by || []).join('、') || '无';

  const nf = data.non_functional || {};
  const ui = data.ui_requirements || {};
  const pages = (ui.pages || []).join('、') || '待补充';
  const flow = ui.interaction_flow || '待补充';

  const api = data.api_spec?.endpoints?.length
    ? data.api_spec.endpoints.map(e => `| ${e.method} | ${e.path} | ${e.description || ''} |`).join('\n')
    : null;

  const changelog = (data.changelog || []).flatMap(entry =>
    (entry.changes || [{ type: 'modified', new_value: entry.summary || '' }]).map(c =>
      `| v${entry.version} | ${entry.date || ''} | ${c.type || 'modified'} | ${c.new_value || c.reason || ''} | ${c.reason || ''} |`
    )
  ).join('\n');

  return `# ${m.feature}

> **模块**：${m.module} | **优先级**：${m.priority} | **状态**：${status} | **版本**：v${m.version}
>
> **创建**：${m.created_at} | **最后更新**：${m.updated_at}

---

## 📝 功能描述

${d.summary}

### 详细说明

${(d.detail || '').trim()}

### 功能范围

${d.scope || '待补充'}

---

## 👤 用户故事

| ID | 角色 | 行为 | 目标 | 优先级 |
|----|------|------|------|--------|
${stories}

---

## ✅ 验收标准

| ID | 验收标准 | 预期结果 | 测试方式 |
|----|----------|----------|----------|
${criteria}

---

## 🔌 API 接口（如有）

${api ? `| 方法 | 路径 | 说明 |\n|------|------|------|\n${api}` : '待补充'}

---

## 🔗 依赖关系

- **内部依赖**：${internal}
- **外部依赖**：${external}
- **阻塞项**：${blocked}

---

## ⚡ 非功能性需求

- **性能**：${nf.performance || '待补充'}
- **安全**：${nf.security || '待补充'}
- **可用性**：${nf.availability || '待补充'}

---

## 🖥️ 界面需求

- **涉及页面**：${pages}
- **交互流程**：${flow}

---

## 📋 变更历史

| 版本 | 日期 | 变更类型 | 变更内容 | 原因 |
|------|------|----------|----------|------|
${changelog}
`;
}

function renderLegacyMd(data) {
  const s = data.spec;
  const acceptance = (s.acceptance || []).map(a => `- [ ] ${a}`).join('\n');
  const deps = (s.dependencies || []).map(d => `- ${d}`).join('\n') || '（无）';
  return `# Spec: ${s.name}

> **模块**: ${s.module}  
> **状态**: ${s.status}  
> **优先级**: ${s.priority}  
> **版本**: ${s.version}

---

## 功能描述

${s.description}

---

## 验收标准

${acceptance}

---

## 依赖关系

${deps}
`;
}

function hashContent(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 12);
}

function syncOne(yamlPath, checkOnly) {
  const data = loadYamlFile(yamlPath);
  const format = getSpecFormat(data);
  if (format === 'invalid' || format === 'unknown') {
    return { yamlPath, ok: false, error: '无法识别 Spec 格式' };
  }

  const mdPath = yamlPath.replace(/_spec\.yaml$/, '_spec.md');
  const generated = format === 'standard' ? renderStandardMd(data) : renderLegacyMd(data);
  const existing = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : null;

  if (checkOnly) {
    const inSync = existing === generated;
    return { yamlPath, mdPath, ok: inSync, inSync, action: inSync ? 'ok' : 'drift' };
  }

  fs.writeFileSync(mdPath, generated, 'utf8');
  return { yamlPath, mdPath, ok: true, action: existing ? 'updated' : 'created' };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1 || args.includes('--help')) {
    console.log(`用法: node sync_spec_md.js <spec_dir> [--check] [--file <yaml>] [--json]`);
    process.exit(args.includes('--help') ? 0 : 1);
  }

  const specDir = path.resolve(args[0]);
  const checkOnly = args.includes('--check');
  const asJson = args.includes('--json');
  const fileIdx = args.indexOf('--file');
  const singleFile = fileIdx >= 0 ? path.resolve(args[fileIdx + 1]) : null;

  const targets = singleFile ? [singleFile] : findYamlSpecs(specDir);
  const results = targets.map(p => syncOne(p, checkOnly));

  const summary = {
    ok: results.every(r => r.ok),
    mode: checkOnly ? 'check' : 'sync',
    total: results.length,
    drift: results.filter(r => r.action === 'drift').length,
    updated: results.filter(r => r.action === 'updated').length,
    created: results.filter(r => r.action === 'created').length,
    results,
  };

  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.ok ? 0 : 1);
  }

  console.log(`\n📝 MD 同步${checkOnly ? '检查' : ''}: ${specDir}\n`);
  for (const r of results) {
    const rel = path.relative(specDir, r.yamlPath);
    if (r.error) console.log(`   ❌ ${rel}: ${r.error}`);
    else if (r.action === 'drift') console.log(`   ⚠️  ${rel}: MD 与 YAML 不同步`);
    else if (r.action === 'updated') console.log(`   ✅ ${rel}: 已更新 MD`);
    else if (r.action === 'created') console.log(`   ✅ ${rel}: 已创建 MD`);
    else console.log(`   ✅ ${rel}: 已同步`);
  }
  console.log('');
  process.exit(summary.ok ? 0 : 1);
}

main();
