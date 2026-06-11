#!/usr/bin/env node
/**
 * wetspec_verify.js — 按 Spec 验收标准运行单元测试，结果写回 Spec YAML
 *
 * 用法:
 *   node wetspec_verify.js <spec_yaml> [--root <project_root>] [--json] [--no-write]
 *
 * 约定（node:test）：
 *   - 单元测试位于 specs/.wetspec.yaml 的 unit_test.path（默认 src 下 __tests__ 目录）
 *   - 每个 auto/both AC 须在测试中嵌套：describe('<feature_id>') → describe('AC-001: ...')
 *   - verify 以 --test-name-pattern "<feature_id> AC-001" 逐条验收
 *   - test_method: manual 的 AC 标为 manual，不跑测试
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  yaml,
  loadYamlFile,
  getFeatureId,
  getFeatureName,
  getModuleName,
} = require('./lib/spec_utils');
const { expandTestGlob, findSpecDir } = require('./lib/test_glob');

function parseArgs(argv) {
  const specYaml = argv[0];
  if (!specYaml || specYaml === '--help') {
    console.log(`
用法:
  node wetspec_verify.js <spec_yaml> [--root <project_root>] [--json] [--no-write]

示例:
  node wetspec_verify.js specs/用户登录/手机号+验证码登录_spec.yaml --root .

约定:
  单元测试 describe 嵌套: describe('LOG-001') → describe('AC-001: ...')
  验收结果写入 acceptance_criteria[].verify_status / verified_at（不生成 reports/）
`);
    process.exit(specYaml === '--help' ? 0 : 1);
  }
  const rootIdx = argv.indexOf('--root');
  return {
    specYaml: path.resolve(specYaml),
    projectRoot: path.resolve(rootIdx >= 0 ? argv[rootIdx + 1] : process.cwd()),
    asJson: argv.includes('--json'),
    writeBack: !argv.includes('--no-write'),
  };
}

function normalizeTestMethod(method) {
  const m = (method || 'manual').toLowerCase();
  if (m === 'both') return 'auto';
  if (m === 'auto' || m === 'automatic') return 'auto';
  return 'manual';
}

function loadUnitTestConfig(specYaml) {
  const specDir = findSpecDir(specYaml);
  const statePath = path.join(specDir, '.wetspec.yaml');
  if (!fs.existsSync(statePath)) {
    return { specDir, framework: 'node:test', path: 'src/**/__tests__/**/*.test.js', command: null };
  }
  const state = yaml.load(fs.readFileSync(statePath, 'utf8'));
  const ut = state.unit_test || {};
  return {
    specDir,
    framework: ut.framework || 'node:test',
    path: ut.path || 'src/**/__tests__/**/*.test.js',
    command: ut.command || null,
  };
}

function collectAcceptanceCriteria(specData) {
  const items = [];
  if (Array.isArray(specData.acceptance_criteria)) {
    for (const ac of specData.acceptance_criteria) {
      items.push({
        id: ac.id,
        description: ac.description,
        expected_result: ac.expected_result,
        test_method: normalizeTestMethod(ac.test_method),
        source: 'acceptance_criteria',
      });
    }
  }
  if (Array.isArray(specData.spec?.acceptance)) {
    specData.spec.acceptance.forEach((text, idx) => {
      const duplicate = items.some(i =>
        i.description.includes(text.slice(0, 20)) || text.includes(i.expected_result?.slice(0, 20) || '___')
      );
      if (!duplicate) {
        items.push({
          id: `LEGACY-${String(idx + 1).padStart(3, '0')}`,
          description: text,
          expected_result: text,
          test_method: 'manual',
          source: 'spec.acceptance',
        });
      }
    });
  }
  return items;
}

function hasAcTestInSource(source, featureId, acId) {
  const featureRe = new RegExp(`describe\\s*\\(\\s*['\`]${featureId}['\`]`);
  const acRe = new RegExp(`describe\\s*\\(\\s*['\`]${acId}([^'\`]*)['\`]`, 'i');
  return featureRe.test(source) && acRe.test(source);
}

function findFilesWithAc(testFiles, featureId, acId) {
  return testFiles.filter(file => {
    const source = fs.readFileSync(file, 'utf8');
    return hasAcTestInSource(source, featureId, acId);
  });
}

function runNodeTestForAc(testFiles, featureId, acId, projectRoot) {
  const pattern = `${featureId} ${acId}`;
  const matched = findFilesWithAc(testFiles, featureId, acId);
  if (!matched.length) {
    return {
      ok: false,
      output: `缺少单元测试: describe('${featureId}') → describe('${acId}: ...')`,
      test_files: [],
    };
  }

  const filesArg = matched.map(f => `"${f}"`).join(' ');
  try {
    execSync(`node --test --test-name-pattern "${pattern}" ${filesArg}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
      cwd: projectRoot,
    });
    return {
      ok: true,
      output: '',
      test_files: matched.map(f => path.relative(projectRoot, f)),
    };
  } catch (e) {
    return {
      ok: false,
      output: [e.stdout, e.stderr].filter(Boolean).join('\n').trim() || e.message,
      test_files: matched.map(f => path.relative(projectRoot, f)),
    };
  }
}

function runFullUnitCommand(projectRoot, command) {
  try {
    execSync(command, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000,
      cwd: projectRoot,
      shell: true,
    });
    return { ok: true, output: '' };
  } catch (e) {
    return {
      ok: false,
      output: [e.stdout, e.stderr].filter(Boolean).join('\n').trim() || e.message,
    };
  }
}

function saveSpecYaml(specYaml, data) {
  const content = yaml.dump(data, { lineWidth: 120, noRefs: true });
  fs.writeFileSync(specYaml, content, 'utf8');
}

function applyResultsToSpec(specData, results, verifyResult) {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const byId = Object.fromEntries(results.map(r => [r.id, r]));

  if (Array.isArray(specData.acceptance_criteria)) {
    for (const ac of specData.acceptance_criteria) {
      const r = byId[ac.id];
      if (!r) continue;
      ac.verify_status = r.status;
      ac.verified_at = r.status === 'manual' ? null : now;
      ac.verify_reason = r.status === 'pass' ? null : (r.reason || null);
    }
  }

  if (specData.metadata) {
    specData.metadata.updated_at = today;
    if (verifyResult === 'pass') specData.metadata.status = 'implemented';
  }
}

function verifySpec({ specYaml, projectRoot, asJson, writeBack }) {
  if (!fs.existsSync(specYaml)) {
    console.error(`❌ Spec 文件不存在: ${specYaml}`);
    process.exit(1);
  }

  const specData = loadYamlFile(specYaml);
  const featureId = getFeatureId(specData);
  const featureName = getFeatureName(specData);
  const moduleName = getModuleName(specData);

  if (!featureId) {
    console.error('❌ Spec 缺少 metadata.id');
    process.exit(1);
  }

  const unitCfg = loadUnitTestConfig(specYaml);
  const testFiles = expandTestGlob(projectRoot, unitCfg.path);
  const acceptance = collectAcceptanceCriteria(specData);
  const results = [];
  const usePerAc = unitCfg.framework === 'node:test';

  if (!usePerAc && unitCfg.command) {
    const full = runFullUnitCommand(projectRoot, unitCfg.command);
    for (const ac of acceptance) {
      if (ac.test_method === 'manual') {
        results.push({
          id: ac.id,
          description: ac.description,
          expected_result: ac.expected_result,
          test_method: ac.test_method,
          status: 'manual',
          reason: '需人工验收',
          test_files: [],
        });
      } else {
        results.push({
          id: ac.id,
          description: ac.description,
          expected_result: ac.expected_result,
          test_method: ac.test_method,
          status: full.ok ? 'pass' : 'fail',
          reason: full.ok ? '单元测试通过' : full.output,
          test_files: [],
        });
      }
    }
  } else {
    for (const ac of acceptance) {
      if (ac.test_method === 'manual') {
        results.push({
          id: ac.id,
          description: ac.description,
          expected_result: ac.expected_result,
          test_method: ac.test_method,
          status: 'manual',
          reason: '需人工验收',
          test_files: [],
        });
        continue;
      }

      const run = runNodeTestForAc(testFiles, featureId, ac.id, projectRoot);
      results.push({
        id: ac.id,
        description: ac.description,
        expected_result: ac.expected_result,
        test_method: ac.test_method,
        status: run.ok ? 'pass' : 'fail',
        reason: run.ok ? '单元测试通过' : run.output,
        test_files: run.test_files,
      });
    }
  }

  const autoItems = results.filter(r => r.test_method !== 'manual');
  const autoPass = autoItems.filter(r => r.status === 'pass').length;
  const autoFail = autoItems.filter(r => r.status === 'fail').length;
  const manualCount = results.filter(r => r.status === 'manual').length;
  const verifyResult = autoFail === 0 && autoItems.length > 0 ? 'pass' : (autoFail > 0 ? 'fail' : 'pending');

  const report = {
    spec: path.relative(projectRoot, specYaml),
    feature_id: featureId,
    feature_name: featureName,
    module: moduleName,
    verified_at: new Date().toISOString(),
    verify_result: verifyResult,
    summary: {
      total: results.length,
      auto_pass: autoPass,
      auto_fail: autoFail,
      manual: manualCount,
    },
    acceptance: results,
    written_to_yaml: false,
  };

  if (writeBack) {
    applyResultsToSpec(specData, results, verifyResult);
    saveSpecYaml(specYaml, specData);
    report.written_to_yaml = true;
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n=== wetspec 验收: ${featureName} (${featureId}) ===\n`);
    for (const r of results) {
      const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⏸️';
      console.log(`${icon} ${r.id} [${r.test_method}] ${r.description}`);
      console.log(`   预期: ${r.expected_result}`);
      if (r.test_files?.length) console.log(`   测试: ${r.test_files.join(', ')}`);
      if (r.status !== 'pass') console.log(`   结果: ${r.reason}`);
      console.log('');
    }
    console.log(`汇总: 自动通过 ${autoPass}/${autoItems.length}，失败 ${autoFail}，待人工 ${manualCount}`);
    console.log(`验收结论: ${verifyResult.toUpperCase()}`);
    if (writeBack) console.log(`结果已写入: ${path.relative(projectRoot, specYaml)}`);
  }

  process.exit(verifyResult === 'pass' ? 0 : 1);
}

verifySpec(parseArgs(process.argv.slice(2)));
