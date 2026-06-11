#!/usr/bin/env node
/**
 * validate_spec.js — 校验 Spec YAML（标准格式 + legacy spec 块）
 * 用法: node validate_spec.js <spec_dir> [--fix] [--json]
 */

const fs = require('fs');
const path = require('path');
const {
  yaml,
  VALID_STATUSES,
  VALID_PRIORITIES,
  LEGACY_PRIORITIES,
  SEMVER,
  findYamlSpecs,
  loadYamlFile,
  getSpecFormat,
} = require('./lib/spec_utils');

function requireString(obj, field, errors, prefix) {
  if (!obj || obj[field] === undefined || obj[field] === null || obj[field] === '') {
    errors.push(`缺少必要字段: ${prefix}${field}`);
  }
}

function validateStandard(data, errors, warnings) {
  const m = data.metadata;
  const d = data.description;

  requireString(m, 'id', errors, 'metadata.');
  requireString(m, 'module', errors, 'metadata.');
  requireString(m, 'feature', errors, 'metadata.');
  requireString(m, 'version', errors, 'metadata.');
  requireString(m, 'status', errors, 'metadata.');
  requireString(m, 'priority', errors, 'metadata.');
  requireString(m, 'created_at', errors, 'metadata.');
  requireString(m, 'updated_at', errors, 'metadata.');

  if (m?.status && !VALID_STATUSES.includes(m.status)) {
    errors.push(`metadata.status 无效: "${m.status}"`);
  }
  if (m?.priority && !VALID_PRIORITIES.includes(m.priority)) {
    warnings.push(`metadata.priority 建议使用 P0-P3，当前: "${m.priority}"`);
  }
  if (m?.version && !SEMVER.test(m.version)) {
    warnings.push(`metadata.version 建议语义化版本，当前: "${m.version}"`);
  }

  if (!d || !d.summary) errors.push('缺少 description.summary');
  if (!Array.isArray(data.user_stories) || data.user_stories.length === 0) {
    errors.push('user_stories 必须至少 1 条');
  }
  if (!Array.isArray(data.acceptance_criteria) || data.acceptance_criteria.length === 0) {
    errors.push('acceptance_criteria 必须至少 1 条');
  }
  if (!Array.isArray(data.changelog) || data.changelog.length === 0) {
    errors.push('changelog 必须至少 1 条');
  }

  for (const [i, us] of (data.user_stories || []).entries()) {
    if (!us?.role || !us?.action || !us?.goal) {
      errors.push(`user_stories[${i}] 缺少 role/action/goal`);
    }
  }
  for (const [i, ac] of (data.acceptance_criteria || []).entries()) {
    if (!ac?.description) errors.push(`acceptance_criteria[${i}] 缺少 description`);
  }
}

function validateLegacy(data, errors, warnings) {
  const spec = data.spec;
  for (const field of ['id', 'name', 'module', 'description', 'status']) {
    requireString(spec, field, errors, 'spec.');
  }
  if (spec?.status && !VALID_STATUSES.includes(spec.status)) {
    errors.push(`spec.status 无效: "${spec.status}"`);
  }
  if (spec?.priority && ![...LEGACY_PRIORITIES, ...VALID_PRIORITIES].includes(spec.priority)) {
    warnings.push(`spec.priority 值非常规: "${spec.priority}"`);
  }
}

function validateSingleSpec(filePath) {
  const errors = [];
  const warnings = [];
  let data = null;

  try {
    data = loadYamlFile(filePath);
  } catch (e) {
    return { filePath, valid: false, format: 'invalid', errors: [`YAML 解析失败: ${e.message}`], warnings, data: null };
  }

  const format = getSpecFormat(data);
  if (format === 'invalid' || format === 'unknown') {
    errors.push('无法识别 Spec 格式，需 metadata+description（标准）或 spec（legacy）');
    return { filePath, valid: false, format, errors, warnings, data };
  }

  if (format === 'standard') validateStandard(data, errors, warnings);
  else validateLegacy(data, errors, warnings);

  // 标准格式若含 legacy spec 块，检查关键字段一致性
  if (format === 'standard' && data.spec) {
    if (data.spec.name && data.metadata.feature && data.spec.name !== data.metadata.feature) {
      warnings.push(`spec.name 与 metadata.feature 不一致`);
    }
  }

  const mdPath = filePath.replace(/_spec\.yaml$/, '_spec.md');
  if (!fs.existsSync(mdPath)) {
    warnings.push(`缺少配套 Markdown: ${path.basename(mdPath)}`);
  }

  return { filePath, valid: errors.length === 0, format, errors, warnings, data };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1 || args.includes('--help')) {
    console.log(`用法: node validate_spec.js <spec_dir> [--json]`);
    process.exit(args.includes('--help') ? 0 : 1);
  }

  const specDir = path.resolve(args[0]);
  const asJson = args.includes('--json');
  const yamlFiles = findYamlSpecs(specDir);

  if (yamlFiles.length === 0) {
    const msg = { ok: true, total: 0, valid: 0, invalid: 0, results: [] };
    if (asJson) console.log(JSON.stringify(msg, null, 2));
    else console.log(`⚠️  未找到 Spec 文件: ${specDir}`);
    process.exit(0);
  }

  const results = yamlFiles.map(validateSingleSpec);
  const summary = {
    ok: results.every(r => r.valid),
    total: results.length,
    valid: results.filter(r => r.valid).length,
    invalid: results.filter(r => !r.valid).length,
    standard: results.filter(r => r.format === 'standard').length,
    legacy: results.filter(r => r.format === 'legacy').length,
    results: results.map(r => ({
      file: path.relative(specDir, r.filePath),
      valid: r.valid,
      format: r.format,
      errors: r.errors,
      warnings: r.warnings,
    })),
  };

  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.ok ? 0 : 1);
  }

  console.log(`\n🔍 校验 Spec: ${specDir} (${summary.total} 文件)\n`);
  for (const r of summary.results) {
    const icon = r.valid ? (r.warnings.length ? '⚠️' : '✅') : '❌';
    console.log(`   ${icon} ${r.file} [${r.format}]`);
    for (const e of r.errors) console.log(`      ❌ ${e}`);
    for (const w of r.warnings) console.log(`      ⚠  ${w}`);
  }
  console.log(`\n📊 通过 ${summary.valid}/${summary.total}（标准 ${summary.standard}，legacy ${summary.legacy}）\n`);
  process.exit(summary.ok ? 0 : 1);
}

main();
