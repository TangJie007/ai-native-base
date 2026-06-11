#!/usr/bin/env node
/**
 * wetspec_verify.js — 按 Spec 验收标准验收实现
 * 用法:
 *   node wetspec_verify.js <spec_yaml> [--root <project_root>] [--json] [--report <path>]
 *
 * 约定：
 *   - 自动验收测试位于 tests/<feature_id>/ac-<ac-id>.test.js（小写 AC 编号）
 *   - test_method 为 auto/both 的 AC 必须存在对应测试文件或通过 --test 命令
 *   - test_method 为 manual 的 AC 输出人工验收清单
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { loadYamlFile, getFeatureId, getFeatureName, getModuleName } = require('./lib/spec_utils');

function parseArgs(argv) {
  const specYaml = argv[0];
  if (!specYaml || specYaml === '--help') {
    console.log(`
用法:
  node wetspec_verify.js <spec_yaml> [--root <project_root>] [--json] [--report <path>]

示例:
  node wetspec_verify.js specs/用户登录/手机号+验证码登录_spec.yaml --root .
`);
    process.exit(specYaml === '--help' ? 0 : 1);
  }
  const rootIdx = argv.indexOf('--root');
  const reportIdx = argv.indexOf('--report');
  return {
    specYaml: path.resolve(specYaml),
    projectRoot: path.resolve(rootIdx >= 0 ? argv[rootIdx + 1] : process.cwd()),
    asJson: argv.includes('--json'),
    reportPath: reportIdx >= 0 ? path.resolve(argv[reportIdx + 1]) : null,
  };
}

function normalizeTestMethod(method) {
  const m = (method || 'manual').toLowerCase();
  if (m === 'both') return 'both';
  if (m === 'auto' || m === 'automatic') return 'auto';
  return 'manual';
}

function acTestPath(projectRoot, featureId, acId) {
  const acSlug = acId.toLowerCase();
  return path.join(projectRoot, 'tests', featureId, `${acSlug}.test.js`);
}

function runTestFile(testPath) {
  try {
    execSync(`node --test "${testPath}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    });
    return { ok: true, output: '' };
  } catch (e) {
    return {
      ok: false,
      output: [e.stdout, e.stderr].filter(Boolean).join('\n').trim() || e.message,
    };
  }
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

function verifySpec({ specYaml, projectRoot, asJson, reportPath }) {
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

  const acceptance = collectAcceptanceCriteria(specData);
  const results = [];

  for (const ac of acceptance) {
    const testPath = acTestPath(projectRoot, featureId, ac.id);
    const needsAuto = ac.test_method === 'auto' || ac.test_method === 'both';
    const hasTest = fs.existsSync(testPath);

    if (needsAuto && !hasTest) {
      results.push({
        id: ac.id,
        description: ac.description,
        expected_result: ac.expected_result,
        test_method: ac.test_method,
        status: 'fail',
        reason: `缺少自动测试: ${path.relative(projectRoot, testPath)}`,
        test_file: path.relative(projectRoot, testPath),
      });
      continue;
    }

    if (needsAuto && hasTest) {
      const run = runTestFile(testPath);
      results.push({
        id: ac.id,
        description: ac.description,
        expected_result: ac.expected_result,
        test_method: ac.test_method,
        status: run.ok ? 'pass' : 'fail',
        reason: run.ok ? '自动测试通过' : run.output,
        test_file: path.relative(projectRoot, testPath),
      });
      continue;
    }

    results.push({
      id: ac.id,
      description: ac.description,
      expected_result: ac.expected_result,
      test_method: ac.test_method,
      status: 'manual',
      reason: '需人工验收',
      test_file: null,
    });
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
  };

  if (reportPath) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n=== wetspec 验收报告: ${featureName} (${featureId}) ===\n`);
    for (const r of results) {
      const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⏸️';
      console.log(`${icon} ${r.id} [${r.test_method}] ${r.description}`);
      console.log(`   预期: ${r.expected_result}`);
      if (r.test_file) console.log(`   测试: ${r.test_file}`);
      if (r.status !== 'pass') console.log(`   结果: ${r.reason}`);
      console.log('');
    }
    console.log(`汇总: 自动通过 ${autoPass}/${autoItems.length}，失败 ${autoFail}，待人工 ${manualCount}`);
    console.log(`验收结论: ${verifyResult.toUpperCase()}`);
    if (reportPath) console.log(`报告已写入: ${reportPath}`);
  }

  process.exit(verifyResult === 'pass' ? 0 : 1);
}

verifySpec(parseArgs(process.argv.slice(2)));
