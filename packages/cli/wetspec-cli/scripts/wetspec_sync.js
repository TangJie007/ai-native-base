#!/usr/bin/env node
/**
 * wetspec_sync.js — 全量同步模式（借鉴 Comet archive delta→main sync，带 dry-run）
 *
 * 当 PRD 结构大幅变更或增量更新不可靠时，以 PRD 为唯一真相源重新对齐 Spec 索引与 MD。
 * AI 仍需根据 diff 报告更新各 YAML 内容；本脚本负责：覆盖率检查、索引重建、MD 同步、状态更新。
 *
 * 用法:
 *   node wetspec_sync.js <prd_path> <spec_dir> [--dry-run] [--json]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { yaml, scanSpecIndex } = require('./lib/spec_utils');

const SCRIPTS = __dirname;

function runNode(script, args, capture = true) {
  const cmd = `node "${path.join(SCRIPTS, script)}" ${args}`;
  return execSync(cmd, { encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2 || args.includes('--help')) {
    console.log(`用法: node wetspec_sync.js <prd_path> <spec_dir> [--dry-run] [--json]`);
    process.exit(args.includes('--help') ? 0 : 1);
  }

  const prdPath = path.resolve(args[0]);
  const specDir = path.resolve(args[1]);
  const dryRun = args.includes('--dry-run');
  const asJson = args.includes('--json');

  if (!fs.existsSync(prdPath)) {
    console.error(`❌ PRD 不存在: ${prdPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(specDir)) {
    console.error(`❌ Spec 目录不存在: ${specDir}`);
    process.exit(1);
  }

  const steps = [];

  // 1. 覆盖率
  let coverage;
  try {
    coverage = JSON.parse(runNode('check_coverage.js', `"${prdPath}" "${specDir}" --json`));
    steps.push({ step: 'coverage', ok: coverage.ok, detail: `${coverage.coveragePercent}%` });
  } catch (e) {
    steps.push({ step: 'coverage', ok: false, error: e.message });
  }

  // 2. 校验现有 Spec
  let validation;
  try {
    validation = JSON.parse(runNode('validate_spec.js', `"${specDir}" --json`));
    steps.push({ step: 'validate', ok: validation.ok, detail: `${validation.valid}/${validation.total}` });
  } catch (e) {
    steps.push({ step: 'validate', ok: false, error: e.message });
  }

  // 3. MD 漂移检查
  let mdCheck;
  try {
    mdCheck = JSON.parse(runNode('sync_spec_md.js', `"${specDir}" --check --json`));
    steps.push({ step: 'md_drift', ok: mdCheck.ok, detail: `${mdCheck.drift} drift` });
  } catch (e) {
    steps.push({ step: 'md_drift', ok: false, error: e.message });
  }

  const index = scanSpecIndex(specDir);
  const plan = {
    dryRun,
    prd: path.basename(prdPath),
    specCount: index.features.length,
    actions: [],
  };

  if (!dryRun) {
    // 4. 重建索引
    runNode('generate_indexes.js', `"${specDir}" --prd "${prdPath}"`, false);
    steps.push({ step: 'generate_indexes', ok: true });

    // 5. 同步 MD
    runNode('sync_spec_md.js', `"${specDir}"`, false);
    steps.push({ step: 'sync_md', ok: true });

    // 6. 更新状态
    const statePath = path.join(specDir, '.wetspec.yaml');
    let state;
    if (fs.existsSync(statePath)) {
      state = yaml.load(fs.readFileSync(statePath, 'utf8'));
    } else {
      state = { version: '1.0', phase: 'idle', mode: 'full', prd: {}, affected_specs: [], archived: false };
    }
    state.mode = 'full';
    state.phase = 'done';
    state.prd = state.prd || {};
    state.prd.previous = state.prd.current;
    state.prd.current = path.basename(prdPath);
    state.last_sync_at = new Date().toISOString();
    fs.writeFileSync(statePath, yaml.dump(state, { lineWidth: 120 }), 'utf8');
    steps.push({ step: 'update_state', ok: true });
  } else {
    plan.actions = [
      '重建 README.md 与模块 INDEX.md',
      '从 YAML 重新生成所有 _spec.md',
      '更新 .wetspec.yaml（mode=full, last_sync_at）',
      '提示：YAML 内容需 AI 根据 PRD 全量/增量更新',
    ];
  }

  const report = { ok: steps.every(s => s.ok !== false), dryRun, steps, plan, coverage, validation, mdCheck };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  }

  console.log(`\n🔄 wetspec 全量同步${dryRun ? '（预览）' : ''}\n`);
  console.log(`   PRD: ${path.basename(prdPath)}`);
  console.log(`   Spec: ${specDir} (${index.features.length} 功能)\n`);
  for (const s of steps) {
    const icon = s.ok ? '✅' : '❌';
    console.log(`   ${icon} ${s.step}${s.detail ? `: ${s.detail}` : ''}${s.error ? ` — ${s.error}` : ''}`);
  }
  if (dryRun) {
    console.log('\n📋 将执行的操作:');
    plan.actions.forEach(a => console.log(`   - ${a}`));
    console.log('\n   去掉 --dry-run 以实际执行\n');
  } else {
    console.log('\n🎉 同步完成。若 PRD 内容有变，请 AI 更新受影响的 YAML 后再次运行 validate + sync_spec_md\n');
  }
  process.exit(report.ok ? 0 : 1);
}

main();
