#!/usr/bin/env node
/**
 * wetspec_doctor.js — 健康诊断（借鉴 Comet doctor）
 * 用法: node wetspec_doctor.js <spec_dir> [--prd <path>] [--json]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { findYamlSpecs, yaml } = require('./lib/spec_utils');
const { checkPyDeps } = require('./lib/py_runner');

const SCRIPTS = __dirname;

function runJson(script, args) {
  try {
    return JSON.parse(execSync(`node "${path.join(SCRIPTS, script)}" ${args}`, { encoding: 'utf8' }));
  } catch (e) {
    const out = e.stdout?.toString() || '';
    try { return JSON.parse(out); } catch { return { ok: false, error: e.message, stdout: out }; }
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1 || args.includes('--help')) {
    console.log(`用法: node wetspec_doctor.js <spec_dir> [--prd <path>] [--json]`);
    process.exit(args.includes('--help') ? 0 : 1);
  }

  const specDir = path.resolve(args[0]);
  const prdIdx = args.indexOf('--prd');
  const prdPath = prdIdx >= 0 ? path.resolve(args[prdIdx + 1]) : null;
  const asJson = args.includes('--json');

  const checks = [];

  // 目录存在
  checks.push({
    name: 'spec_dir_exists',
    ok: fs.existsSync(specDir),
    message: fs.existsSync(specDir) ? 'Spec 目录存在' : 'Spec 目录不存在',
  });

  // Spec 文件数量
  const yamlCount = findYamlSpecs(specDir).length;
  checks.push({
    name: 'spec_files',
    ok: yamlCount > 0,
    message: yamlCount > 0 ? `找到 ${yamlCount} 个 Spec YAML` : '未找到 Spec 文件',
  });

  // 状态文件
  const statePath = path.join(specDir, '.wetspec.yaml');
  checks.push({
    name: 'state_file',
    ok: fs.existsSync(statePath),
    message: fs.existsSync(statePath) ? '.wetspec.yaml 存在' : '.wetspec.yaml 缺失（建议 wetspec_state.js init）',
    severity: fs.existsSync(statePath) ? 'ok' : 'warn',
  });

  if (fs.existsSync(statePath)) {
    try {
      execSync(`node "${path.join(SCRIPTS, 'wetspec_state.js')}" validate "${specDir}"`, { stdio: 'pipe' });
      checks.push({ name: 'state_valid', ok: true, message: '状态 Schema 有效' });
    } catch {
      checks.push({ name: 'state_valid', ok: false, message: '状态 Schema 无效' });
    }

    try {
      const state = yaml.load(fs.readFileSync(statePath, 'utf8'));
      if (state.phase === 'awaiting-unit-test') {
        const pending = state.unit_test?.pending_framework || '未知';
        checks.push({
          name: 'unit_test_awaiting',
          ok: false,
          message: `等待用户安装单元测试依赖（pending: ${pending}）；安装后运行 unit-test check → configure`,
          severity: 'warn',
        });
      }

      const ut = state.unit_test;
      if (!ut || (!ut.framework && !ut.deferred && !ut.pending_framework)) {
        checks.push({
          name: 'unit_test_configured',
          ok: false,
          message: '未配置单元测试框架（首次 init 后应执行 DP-0 / wetspec unit-test configure）',
          severity: 'warn',
        });
      } else if (ut.deferred) {
        checks.push({
          name: 'unit_test_configured',
          ok: false,
          message: '单元测试框架暂缓选定（build 前须 wetspec unit-test configure）',
          severity: 'warn',
        });
      } else {
        checks.push({
          name: 'unit_test_configured',
          ok: true,
          message: `单元测试: ${ut.framework}（${ut.command || '见 unit_test.command'}）`,
        });
      }
    } catch {
      checks.push({
        name: 'unit_test_configured',
        ok: false,
        message: '无法读取 unit_test 配置',
        severity: 'warn',
      });
    }
  }

  // Python 插件（增强 compare / coverage / ingest）
  const pyCheck = checkPyDeps();
  if (!pyCheck.python) {
    checks.push({
      name: 'py_plugin',
      ok: false,
      message: 'Python 未安装（compare/coverage 将回退 Node；PDF 摄入不可用）',
      severity: 'warn',
    });
  } else if (!pyCheck.core.ok) {
    checks.push({
      name: 'py_plugin',
      ok: false,
      message: `Python 核心依赖缺失: ${pyCheck.core.missing.join(', ')}（运行 wetspec py-install）`,
      severity: 'warn',
    });
  } else if (!pyCheck.optional.ok) {
    checks.push({
      name: 'py_plugin',
      ok: true,
      message: `Python 插件就绪（可选 PDF/Word 包未装: ${pyCheck.optional.missing.join(', ')}）`,
      severity: 'warn',
    });
  } else {
    checks.push({
      name: 'py_plugin',
      ok: true,
      message: 'Python 插件就绪（含 PDF/Word 摄入）',
    });
  }

  // YAML 校验
  const validation = runJson('validate_spec.js', `"${specDir}" --json`);
  checks.push({
    name: 'yaml_validate',
    ok: validation.ok,
    message: validation.ok ? `YAML 校验通过 (${validation.valid}/${validation.total})` : `YAML 校验失败 (${validation.invalid} 错误)`,
    detail: validation,
  });

  // MD 同步
  const mdCheck = runJson('sync_spec_md.js', `"${specDir}" --check --json`);
  checks.push({
    name: 'md_sync',
    ok: mdCheck.ok,
    message: mdCheck.ok ? 'MD 与 YAML 已同步' : `MD 漂移 ${mdCheck.drift || '?'} 处`,
    detail: mdCheck,
  });

  // 覆盖率
  if (prdPath && fs.existsSync(prdPath)) {
    const coverage = runJson('check_coverage.js', `"${prdPath}" "${specDir}" --json`);
    checks.push({
      name: 'prd_coverage',
      ok: coverage.ok,
      message: coverage.ok ? `PRD 覆盖率 ${coverage.coveragePercent}%` : `PRD 未覆盖 ${coverage.missing?.length || 0} 个功能`,
      detail: coverage,
    });
  } else if (prdPath) {
    checks.push({ name: 'prd_coverage', ok: false, message: `PRD 文件不存在: ${prdPath}` });
  }

  const hardFails = checks.filter(c => !c.ok && c.severity !== 'warn');
  const warns = checks.filter(c => !c.ok && c.severity === 'warn');
  const report = {
    ok: hardFails.length === 0,
    specDir,
    prd: prdPath ? path.basename(prdPath) : null,
    checks,
    summary: { pass: checks.filter(c => c.ok).length, fail: hardFails.length, warn: warns.length },
    nextCommand: hardFails.length
      ? '修复上述问题后重新运行 wetspec_doctor'
      : (mdCheck.ok ? '就绪' : 'node sync_spec_md.js specs/'),
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  }

  console.log(`\n🩺 wetspec doctor: ${specDir}\n`);
  for (const c of checks) {
    const icon = c.ok ? '✅' : (c.severity === 'warn' ? '⚠️' : '❌');
    console.log(`   ${icon} ${c.message}`);
  }
  console.log(`\n📊 ${report.summary.pass} 通过, ${report.summary.fail} 失败, ${report.summary.warn} 警告`);
  console.log(`➡️  下一步: ${report.nextCommand}\n`);
  process.exit(report.ok ? 0 : 1);
}

main();
