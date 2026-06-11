#!/usr/bin/env node
/**
 * check_coverage.js — PRD ↔ Spec 追溯覆盖率检查（Comet 式一致性校验）
 * 用法: node check_coverage.js <prd_path> <spec_dir> [--json] [--node-only]
 * 默认优先 Python（rapidfuzz 模糊匹配）
 */

const fs = require('fs');
const path = require('path');
const { scanSpecIndex, sanitizeFileName } = require('./lib/spec_utils');
const { runPy, pyAvailable } = require('./lib/py_runner');

const MD_HEADING = /^(#{1,4})\s+(.+)$/;
const NUM_HEADING = /^(\d+(?:\.\d+)*)\s+(.+)$/;
const FEATURE_KW = /功能\s*[\d.]+\s*[：:]\s*(.+)/;

function extractPrdFeatures(prdText) {
  const lines = prdText.split('\n');
  const features = [];
  let currentModule = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const md = MD_HEADING.exec(line);
    if (md) {
      const level = md[1].length;
      const heading = md[2].trim();
      if (level === 2 && /模块/.test(heading)) currentModule = heading.replace(/^模块[一二三四五六七八九十\d]*[：:]\s*/, '').trim() || heading;
      if (level >= 3) {
        const featMatch = FEATURE_KW.exec(heading) || (level === 4 ? [null, heading] : null);
        if (featMatch) {
          features.push({ name: featMatch[1] || heading, module: currentModule, line: i + 1, raw: heading });
        }
      }
    }
    const num = NUM_HEADING.exec(line);
    if (num && num[1].split('.').length >= 3) {
      features.push({ name: num[2].trim(), module: currentModule, line: i + 1, raw: line });
    }
  }
  return features;
}

function normalizeName(name) {
  return name.replace(/\s+/g, '').replace(/[（）()]/g, m => m);
}

function matchFeature(prdFeature, specFeatures) {
  const prdNorm = normalizeName(prdFeature.name);
  return specFeatures.find(s => {
    const specNorm = normalizeName(s.feature);
    return specNorm === prdNorm || specNorm.includes(prdNorm) || prdNorm.includes(specNorm);
  });
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2 || args.includes('--help')) {
    console.log(`用法: node check_coverage.js <prd_path> <spec_dir> [--json] [--node-only]`);
    process.exit(args.includes('--help') ? 0 : 1);
  }

  const prdPath = path.resolve(args[0]);
  const specDir = path.resolve(args[1]);
  const asJson = args.includes('--json');
  const nodeOnly = args.includes('--node-only');

  if (!nodeOnly && pyAvailable()) {
    const pyArgs = [`"${prdPath}"`, `"${specDir}"`, '--json'];
    const result = runPy('check_coverage.py', pyArgs, { json: true });
    if (result.ok && result.data) {
      const report = result.data;
      if (asJson) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(`\n📋 PRD ↔ Spec 覆盖率: ${report.coveragePercent}% (${report.covered}/${report.prdFeatureCount}) [python]\n`);
        if (report.missing?.length) {
          console.log('❌ PRD 中未覆盖的功能:');
          for (const m of report.missing) console.log(`   - L${m.line} ${m.module ? `[${m.module}] ` : ''}${m.name}`);
        }
        if (report.orphaned?.length) {
          console.log('\n⚠️  Spec 中存在但 PRD 未提及:');
          for (const o of report.orphaned) console.log(`   - ${o.id} ${o.feature} (${o.file})`);
        }
        if (report.ok && !report.orphaned?.length) console.log('✅ 完全覆盖，无孤儿 Spec\n');
      }
      process.exit(report.ok ? 0 : 1);
    }
    console.error(`⚠️  Python check_coverage 失败，回退 Node: ${result.error || ''}`);
  }

  if (!fs.existsSync(prdPath)) {
    console.error(`❌ PRD 不存在: ${prdPath}`);
    process.exit(1);
  }

  const prdText = fs.readFileSync(prdPath, 'utf8');
  const prdFeatures = extractPrdFeatures(prdText);
  const index = scanSpecIndex(specDir);

  const covered = [];
  const missing = [];
  const orphaned = [...index.features];

  for (const pf of prdFeatures) {
    const match = matchFeature(pf, index.features);
    if (match) {
      covered.push({ prd: pf, spec: match });
      const idx = orphaned.findIndex(o => o.feature === match.feature && o.module === match.module);
      if (idx >= 0) orphaned.splice(idx, 1);
    } else {
      missing.push(pf);
    }
  }

  const report = {
    ok: missing.length === 0,
    prd: path.basename(prdPath),
    specDir,
    prdFeatureCount: prdFeatures.length,
    specFeatureCount: index.features.length,
    covered: covered.length,
    missing: missing.map(m => ({ name: m.name, module: m.module, line: m.line })),
    orphaned: orphaned.map(o => ({ id: o.id, feature: o.feature, module: o.module, file: o.relYaml })),
    coveragePercent: prdFeatures.length ? Math.round((covered.length / prdFeatures.length) * 100) : 100,
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  }

  console.log(`\n📋 PRD ↔ Spec 覆盖率: ${report.coveragePercent}% (${report.covered}/${report.prdFeatureCount})\n`);
  if (missing.length) {
    console.log('❌ PRD 中未覆盖的功能:');
    for (const m of missing) console.log(`   - L${m.line} ${m.module ? `[${m.module}] ` : ''}${m.name}`);
  }
  if (orphaned.length) {
    console.log('\n⚠️  Spec 中存在但 PRD 未提及（可能已废弃或 PRD 未更新）:');
    for (const o of orphaned) console.log(`   - ${o.id} ${o.feature} (${o.relYaml})`);
  }
  if (report.ok && orphaned.length === 0) console.log('✅ 完全覆盖，无孤儿 Spec\n');
  else console.log('');
  process.exit(missing.length ? 1 : 0);
}

main();
