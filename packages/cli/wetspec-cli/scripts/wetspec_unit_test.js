#!/usr/bin/env node
/**
 * wetspec_unit_test.js — 单元测试框架检测与配置
 *
 * 用法:
 *   node wetspec_unit_test.js detect [--root <project_root>] [--json]
 *   node wetspec_unit_test.js configure <spec_dir> --framework <id> [--root <project_root>] [--install] [--json]
 *
 * framework: node:test | vitest | jest | pytest | defer
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { yaml } = require('./lib/spec_utils');

const STATE_FILE = '.wetspec.yaml';

const PRESETS = {
  'node:test': {
    framework: 'node:test',
    path: 'src/**/__tests__/**/*.test.js',
    command: 'npm run test:unit',
    testUnitScript: 'node --test src/**/__tests__/**/*.test.js',
    testScript: 'npm run test:unit',
    devDependencies: {},
    installHint: '无需额外依赖（Node 18+ 内置 node:test）',
  },
  vitest: {
    framework: 'vitest',
    path: 'src/**/__tests__/**/*.test.{js,ts}',
    command: 'npm run test:unit',
    testUnitScript: 'vitest run',
    testScript: 'npm run test:unit',
    devDependencies: { vitest: '^3.0.0' },
    installHint: '将安装 devDependency: vitest',
  },
  jest: {
    framework: 'jest',
    path: 'src/**/__tests__/**/*.test.{js,ts}',
    command: 'npm run test:unit',
    testUnitScript: 'jest',
    testScript: 'npm run test:unit',
    devDependencies: { jest: '^29.7.0' },
    installHint: '将安装 devDependency: jest',
  },
  pytest: {
    framework: 'pytest',
    path: 'src/**/tests/test_*.py',
    command: 'pytest src',
    testUnitScript: null,
    testScript: null,
    devDependencies: {},
    installHint: '需自行 pip install pytest；不修改 package.json',
  },
};

function parseArgs(argv) {
  const cmd = argv[0];
  const specDir = cmd === 'configure' && argv[1] && !argv[1].startsWith('--') ? argv[1] : null;
  const rootIdx = argv.indexOf('--root');
  const frameworkIdx = argv.indexOf('--framework');
  return {
    cmd,
    specDir: specDir ? path.resolve(specDir) : null,
    projectRoot: path.resolve(rootIdx >= 0 ? argv[rootIdx + 1] : process.cwd()),
    framework: frameworkIdx >= 0 ? argv[frameworkIdx + 1] : null,
    asJson: argv.includes('--json'),
    install: argv.includes('--install'),
  };
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function loadState(specDir) {
  const p = path.join(specDir, STATE_FILE);
  if (!fs.existsSync(p)) return null;
  return yaml.load(fs.readFileSync(p, 'utf8'));
}

function saveState(specDir, state) {
  const p = path.join(specDir, STATE_FILE);
  fs.writeFileSync(p, yaml.dump(state, { lineWidth: 120, noRefs: true }), 'utf8');
}

function detectSignals(projectRoot) {
  const signals = [];
  const pkg = readJson(path.join(projectRoot, 'package.json'));
  const hasPyproject = fs.existsSync(path.join(projectRoot, 'pyproject.toml'));
  const hasRequirements = fs.existsSync(path.join(projectRoot, 'requirements.txt'));
  const hasSetupPy = fs.existsSync(path.join(projectRoot, 'setup.py'));

  if (pkg) {
    signals.push('has_package_json');
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (allDeps.vitest) signals.push('has_vitest');
    if (allDeps.jest) signals.push('has_jest');
    if (pkg.type === 'module') signals.push('esm_package');
  }
  if (hasPyproject || hasRequirements || hasSetupPy) signals.push('has_python_project');
  if (!pkg && !hasPyproject && !hasRequirements && !hasSetupPy) signals.push('greenfield');

  return { signals, pkg };
}

function recommendFramework({ signals }) {
  if (signals.includes('has_vitest')) {
    return {
      id: 'vitest',
      reason: 'package.json 已含 vitest，沿用现有栈',
      preset: PRESETS.vitest,
    };
  }
  if (signals.includes('has_jest')) {
    return {
      id: 'jest',
      reason: 'package.json 已含 jest，沿用现有栈',
      preset: PRESETS.jest,
    };
  }
  if (signals.includes('has_python_project') && !signals.includes('has_package_json')) {
    return {
      id: 'pytest',
      reason: '检测到 Python 项目结构，推荐 pytest',
      preset: PRESETS.pytest,
    };
  }
  return {
    id: 'node:test',
    reason: 'Node 纯模块 / 零依赖，推荐 node:test（与 AC 层一致）',
    preset: PRESETS['node:test'],
  };
}

function cmdDetect({ projectRoot, asJson }) {
  const { signals } = detectSignals(projectRoot);
  const recommendation = recommendFramework({ signals });
  const options = Object.entries(PRESETS).map(([id, preset]) => ({
    id,
    label: `${id}（${PRESETS[id] === recommendation.preset ? '推荐：' : ''}${preset.installHint}）`,
    preset: {
      framework: preset.framework,
      path: preset.path,
      command: preset.command,
    },
  }));

  const report = {
    ok: true,
    projectRoot,
    signals,
    recommendation: {
      id: recommendation.id,
      reason: recommendation.reason,
      preset: recommendation.preset,
    },
    options,
    acNote: '验收由 wetspec verify 按 describe(LOG-xxx/AC-xxx) 跑单元测试；非 node:test 时整包执行 unit_test.command',
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n🧪 单元测试框架检测: ${projectRoot}\n`);
  console.log(`   信号: ${signals.join(', ') || '无'}`);
  console.log(`   推荐: ${recommendation.id} — ${recommendation.reason}`);
  console.log(`   验收: wetspec verify 按 LOG-xxx/AC-xxx 嵌套 describe 跑单元测试\n`);
  for (const opt of options) {
    const mark = opt.id === recommendation.id ? '★' : ' ';
    console.log(`   ${mark} ${opt.id}: ${opt.preset.command}`);
  }
  console.log('');
}

function updatePackageJson(projectRoot, preset, install) {
  if (!preset.testUnitScript) return { updated: false, reason: 'no_npm_scripts' };

  const pkgPath = path.join(projectRoot, 'package.json');
  let pkg = readJson(pkgPath);
  if (!pkg) {
    pkg = {
      name: path.basename(projectRoot),
      version: '1.0.0',
      private: true,
      scripts: {},
      dependencies: {},
    };
  }
  pkg.scripts = pkg.scripts || {};
  pkg.devDependencies = pkg.devDependencies || {};

  pkg.scripts['test:unit'] = preset.testUnitScript;
  if (preset.testScript) {
    pkg.scripts.test = preset.testScript;
  }

  for (const [name, version] of Object.entries(preset.devDependencies)) {
    if (!pkg.devDependencies[name]) {
      pkg.devDependencies[name] = version;
    }
  }

  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

  if (install && Object.keys(preset.devDependencies).length > 0) {
    execSync('npm install', { cwd: projectRoot, stdio: 'inherit' });
  }

  return { updated: true, path: pkgPath };
}

function cmdConfigure({ specDir, projectRoot, framework, install, asJson }) {
  if (!specDir || !framework) {
    console.error('用法: wetspec unit-test configure <spec_dir> --framework <id> [--root .] [--install]');
    process.exit(1);
  }

  const state = loadState(specDir);
  if (!state) {
    console.error(`❌ 状态文件不存在: ${path.join(specDir, STATE_FILE)}`);
    process.exit(1);
  }

  const now = new Date().toISOString().slice(0, 10);
  let unitTest;

  if (framework === 'defer') {
    unitTest = {
      framework: null,
      deferred: true,
      path: null,
      command: null,
      configured_at: now,
      note: '初始化时暂缓选定；build 前须重新配置',
    };
  } else {
    const preset = PRESETS[framework];
    if (!preset) {
      console.error(`❌ 未知框架: ${framework}，可选: ${Object.keys(PRESETS).join(', ')}, defer`);
      process.exit(1);
    }
    unitTest = {
      framework: preset.framework,
      deferred: false,
      path: preset.path,
      command: preset.command,
      configured_at: now,
      ac_runner: 'node:test',
      ac_note: 'wetspec verify 按 describe(LOG-xxx)→describe(AC-xxx) 跑单元测试，结果写回 Spec YAML',
    };
  }

  state.unit_test = unitTest;
  saveState(specDir, state);

  let pkgResult = { updated: false };
  if (framework !== 'defer') {
    pkgResult = updatePackageJson(projectRoot, PRESETS[framework], install);
  }

  const report = {
    ok: true,
    specDir,
    projectRoot,
    framework,
    unit_test: unitTest,
    packageJson: pkgResult,
    nextCommand: framework === 'defer'
      ? 'build 前运行 wetspec unit-test configure specs/ --framework <id>'
      : unitTest.command,
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`✅ 已配置单元测试框架: ${framework}`);
  console.log(`   状态: ${path.join(specDir, STATE_FILE)}`);
  if (pkgResult.updated) {
    console.log(`   package.json: 已写入 test:unit`);
  }
  if (framework !== 'defer') {
    console.log(`   运行: ${unitTest.command}`);
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes('--help')) {
    console.log(`
用法:
  wetspec unit-test detect [--root <project_root>] [--json]
  wetspec unit-test configure <spec_dir> --framework <id> [--root <project_root>] [--install] [--json]

framework:
  node:test  Node 内置（零依赖，推荐纯后端模块）
  vitest     Vite/前端项目
  jest       React/Next 等
  pytest     Python 项目
  defer      暂缓选定（build 前须再配置）
`);
    process.exit(argv.includes('--help') ? 0 : 1);
  }

  const args = parseArgs(argv);
  if (args.cmd === 'detect') {
    cmdDetect(args);
  } else if (args.cmd === 'configure') {
    cmdConfigure(args);
  } else {
    console.error(`❌ 未知子命令: ${args.cmd}`);
    process.exit(1);
  }
}

main();
