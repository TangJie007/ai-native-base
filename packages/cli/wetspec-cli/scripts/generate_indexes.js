#!/usr/bin/env node
/**
 * generate_indexes.js — 自动生成 specs/README.md 与模块 INDEX.md
 * 用法: node generate_indexes.js <spec_dir> [--prd <prd_path>]
 */

const fs = require('fs');
const path = require('path');
const { scanSpecIndex, priorityLabel, statusLabel, sanitizeFileName } = require('./lib/spec_utils');

function generateModuleIndex(moduleName, features, prdSource) {
  const rows = features.map(f => {
    const m = f.data.metadata || {};
    const pri = m.priority || priorityLabel(f.data);
    const st = m.status || statusLabel(f.data);
    return `| ${f.id || '-'} | [${f.feature}](./${path.basename(f.relMd)}) | ${pri} | ${st} | [YAML](./${path.basename(f.relYaml)}) |`;
  }).join('\n');

  return `# ${moduleName} — 功能索引

> **来源 PRD**：${prdSource || '待补充'} | **自动生成**

## 功能列表

| ID | 功能 | 优先级 | 状态 | Spec 文件 |
|----|------|--------|------|-----------|
${rows}
`;
}

function generateRootReadme(index, prdSource) {
  const moduleRows = Object.entries(index.modules).map(([name, feats]) => {
    const safe = sanitizeFileName(name);
    return `| [${name}](./${safe}/INDEX.md) | ${feats.length} | ${feats.map(f => f.feature).join('、')} |`;
  }).join('\n');

  const totalFeatures = index.features.length;

  return `# Spec 目录

> 由 wetspec 管理 | 功能总数：${totalFeatures}  
> 来源 PRD：${prdSource || '待补充'}  
> 最后索引更新：${new Date().toISOString().split('T')[0]}

## 模块概览

| 模块 | 功能数 | 功能 |
|------|--------|------|
${moduleRows}

## 常用命令

\`\`\`bash
# 需已安装: npm install @wetspace/wetspec-cli 或 pnpm add @wetspace/wetspec-cli
wetspec validate specs/
wetspec sync-md specs/ --check
wetspec coverage <prd> specs/
wetspec doctor specs/
\`\`\`
`;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1 || args.includes('--help')) {
    console.log(`用法: node generate_indexes.js <spec_dir> [--prd <prd_path>]`);
    process.exit(args.includes('--help') ? 0 : 1);
  }

  const specDir = path.resolve(args[0]);
  const prdIdx = args.indexOf('--prd');
  const prdPath = prdIdx >= 0 ? args[prdIdx + 1] : null;
  const prdSource = prdPath ? path.basename(prdPath) : inferPrdSource(specDir);

  const index = scanSpecIndex(specDir);
  if (index.features.length === 0) {
    console.error('❌ 未找到任何 Spec 文件');
    process.exit(1);
  }

  // 模块 INDEX
  for (const [moduleName, features] of Object.entries(index.modules)) {
    const moduleDir = path.join(specDir, sanitizeFileName(moduleName));
    fs.mkdirSync(moduleDir, { recursive: true });
    const indexPath = path.join(moduleDir, 'INDEX.md');
    fs.writeFileSync(indexPath, generateModuleIndex(moduleName, features, prdSource), 'utf8');
    console.log(`   ✅ ${path.relative(specDir, indexPath)}`);
  }

  // 根 README
  const readmePath = path.join(specDir, 'README.md');
  fs.writeFileSync(readmePath, generateRootReadme(index, prdSource), 'utf8');
  console.log(`   ✅ README.md`);
  console.log(`\n🎉 索引已生成（${Object.keys(index.modules).length} 模块，${index.features.length} 功能）\n`);
}

function inferPrdSource(specDir) {
  const statePath = path.join(specDir, '.wetspec.yaml');
  if (!fs.existsSync(statePath)) return null;
  try {
    const yaml = require('js-yaml');
    const state = yaml.load(fs.readFileSync(statePath, 'utf8'));
    return state?.prd?.current || null;
  } catch {
    return null;
  }
}

main();
