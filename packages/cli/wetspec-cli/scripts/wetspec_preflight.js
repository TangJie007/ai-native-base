#!/usr/bin/env node
/**
 * wetspec_preflight.js — 多人协作预检（启动 change 更新前）
 *
 * 用法:
 *   node wetspec_preflight.js <change_dir> --main-specs <specs_dir> [--prd <new_prd>] [--json]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { yaml } = require('./lib/spec_utils');
const { normalizeRel } = require('./lib/change_paths');

function parseArgs(argv) {
  const changeDir = argv[0];
  if (!changeDir || changeDir === '--help') {
    console.log(`
用法:
  node wetspec_preflight.js <change_dir> --main-specs <specs_dir> [--prd <new_prd>] [--json]
`);
    process.exit(changeDir === '--help' ? 0 : 1);
  }
  const mainIdx = argv.indexOf('--main-specs');
  const prdIdx = argv.indexOf('--prd');
  return {
    changeDir: path.resolve(changeDir),
    mainSpecs: mainIdx >= 0 ? path.resolve(argv[mainIdx + 1]) : null,
    prd: prdIdx >= 0 ? path.resolve(argv[prdIdx + 1]) : null,
    asJson: argv.includes('--json'),
  };
}

function gitStatusPorcelain() {
  try {
    return execSync('git status --porcelain', { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    return null;
  }
}

function preflight({ changeDir, mainSpecs, prd, asJson }) {
  const checks = [];

  if (!mainSpecs || !fs.existsSync(mainSpecs)) {
    checks.push({ name: 'main_specs_exists', ok: false, message: '主 specs 目录不存在' });
  } else {
    checks.push({ name: 'main_specs_exists', ok: true, message: `主 specs: ${mainSpecs}` });
  }

  const mainStatePath = path.join(mainSpecs || '', '.wetspec.yaml');
  let mainState = null;
  if (fs.existsSync(mainStatePath)) {
    mainState = yaml.load(fs.readFileSync(mainStatePath, 'utf8'));
    const busyPhases = ['parse', 'update', 'sync', 'specs-ready'];
    const phaseOk = !busyPhases.includes(mainState.phase);
    checks.push({
      name: 'main_not_busy',
      ok: phaseOk,
      message: phaseOk
        ? `主 specs phase=${mainState.phase}，可开始 change 更新`
        : `[HARD STOP] 主 specs phase=${mainState.phase}，可能有人正在更新，请协调后再试`,
      severity: phaseOk ? 'ok' : 'error',
    });
  } else {
    checks.push({ name: 'main_state', ok: true, message: '主 specs 无 .wetspec.yaml（首次项目可接受）', severity: 'warn' });
  }

  const changeStatePath = path.join(changeDir, '.wetspec.yaml');
  if (fs.existsSync(changeStatePath)) {
    const changeState = yaml.load(fs.readFileSync(changeStatePath, 'utf8'));
    if (changeState.archived) {
      checks.push({ name: 'change_not_archived', ok: false, message: '该 change 已归档，请新建 change', severity: 'error' });
    } else {
      checks.push({ name: 'change_active', ok: true, message: `change phase=${changeState.phase}` });
    }
  } else {
    checks.push({ name: 'change_init', ok: true, message: 'change 未初始化，将执行 wetspec_change.js init', severity: 'warn' });
  }

  if (prd && mainState?.prd?.current) {
    const mainPrd = mainState.prd.current;
    const newPrdBase = path.basename(prd);
    checks.push({
      name: 'prd_baseline',
      ok: true,
      message: `主库 PRD 基线: ${mainPrd} → 本次: ${newPrdBase}`,
      severity: 'info',
    });
  }

  const gitDirty = gitStatusPorcelain();
  if (gitDirty !== null) {
    const specDirty = gitDirty.split('\n').filter(l => l.includes('specs/') || l.includes('wetspec-delta'));
    checks.push({
      name: 'git_clean_specs',
      ok: specDirty.length === 0,
      message: specDirty.length
        ? `工作区有未提交 specs 变更 (${specDirty.length} 处)，建议先 pull/rebase 并协调`
        : 'specs 相关工作区干净',
      severity: specDirty.length ? 'warn' : 'ok',
    });
  }

  checks.push({
    name: 'delta_only_rule',
    ok: true,
    message: '规则：change 内只写 wetspec-delta/affected_specs，禁止全量复制主 specs',
    severity: 'info',
  });

  const hardFails = checks.filter(c => c.ok === false && c.severity === 'error');
  const report = {
    ok: hardFails.length === 0,
    change_dir: changeDir,
    main_specs: mainSpecs,
    checks,
  };

  if (asJson) console.log(JSON.stringify(report, null, 2));
  else {
    console.log('\n=== wetspec preflight ===\n');
    for (const c of checks) {
      const icon = c.ok ? (c.severity === 'warn' ? '⚠️' : '✅') : '❌';
      console.log(`${icon} ${c.name}: ${c.message}`);
    }
    console.log(report.ok ? '\n✅ 预检通过，可开始 change 增量更新\n' : '\n[HARD STOP] 预检未通过\n');
  }
  process.exit(report.ok ? 0 : 1);
}

preflight(parseArgs(process.argv.slice(2)));
