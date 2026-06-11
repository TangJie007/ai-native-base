#!/usr/bin/env node
/**
 * wetspec_unit_test.js — 单元测试框架检测、就绪检查与配置
 *
 * 用法:
 *   wetspec unit-test detect [--root <project_root>] [--json]
 *   wetspec unit-test check [--root <project_root>] [--framework <id>] [--spec-dir specs/] [--json]
 *   wetspec unit-test configure <spec_dir> --framework <id> [--root <project_root>] [--json]
 *
 * DP-0 约定：Agent 不得替用户 npm/pnpm install；用户自装后说「继续」再跑 check。
 * --install 已废弃，仅保留兼容并打印警告。
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
    installHint: '无需额外依赖（Node 18+ 内置 node:test）',
  },
  vitest: {
    framework: 'vitest',
    path: 'src/**/__tests__/**/*.test.{js,ts}',
    command: 'npm run test:unit',
    testUnitScript: 'vitest run',
    testScript: 'npm run test:unit',
    installHint: '需自行安装 vitest 及前端测试配套库',
  },
  jest: {
    framework: 'jest',
    path: 'src/**/__tests__/**/*.test.{js,ts}',
    command: 'npm run test:unit',
    testUnitScript: 'jest',
    testScript: 'npm run test:unit',
    installHint: '需自行安装 jest 及配套库',
  },
  pytest: {
    framework: 'pytest',
    path: 'src/**/tests/test_*.py',
    command: 'pytest src',
    testUnitScript: null,
    testScript: null,
    installHint: '需自行 pip install pytest',
  },
};

/**
 * 已知 npm 单元测试主框架（宽松 check：任一存在即放行）
 * id 用于 detectedRunner；configure 仍仅支持 node:test / vitest / jest / pytest
 */
const NPM_TEST_RUNNERS = [
  { package: 'vitest', id: 'vitest' },
  { package: 'jest', id: 'jest' },
  { package: '@jest/globals', id: 'jest' },
  { package: 'mocha', id: 'mocha' },
  { package: 'jasmine', id: 'jasmine' },
  { package: 'ava', id: 'ava' },
  { package: 'uvu', id: 'uvu' },
  { package: 'tape', id: 'tape' },
  { package: 'tap', id: 'tap' },
  { package: 'karma', id: 'karma' },
  { package: '@playwright/test', id: 'playwright' },
  { package: 'cypress', id: 'cypress' },
  { package: '@web/test-runner', id: 'web-test-runner' },
];

/** 按项目类型 + 框架返回建议安装的包（仅提示，不卡死） */
const PACKAGE_SETS = {
  'node:test': {
    default: [],
  },
  vitest: {
    'vue-vite': [
      { name: 'vitest', dev: true },
      { name: '@vue/test-utils', dev: true },
      { name: 'happy-dom', dev: true },
    ],
    'react-vite': [
      { name: 'vitest', dev: true },
      { name: '@testing-library/react', dev: true },
      { name: 'happy-dom', dev: true },
    ],
    default: [{ name: 'vitest', dev: true }],
  },
  jest: {
    next: [
      { name: 'jest', dev: true },
      { name: '@testing-library/react', dev: true },
      { name: 'jest-environment-jsdom', dev: true },
    ],
    nestjs: [
      { name: 'jest', dev: true },
      { name: '@types/jest', dev: true },
      { name: 'ts-jest', dev: true },
    ],
    'vue-webpack': [
      { name: 'jest', dev: true },
      { name: '@vue/test-utils', dev: true },
      { name: 'jest-environment-jsdom', dev: true },
    ],
    vue: [
      { name: 'jest', dev: true },
      { name: '@vue/test-utils', dev: true },
      { name: 'jest-environment-jsdom', dev: true },
    ],
    'react-webpack': [
      { name: 'jest', dev: true },
      { name: '@testing-library/react', dev: true },
      { name: 'jest-environment-jsdom', dev: true },
    ],
    react: [
      { name: 'jest', dev: true },
      { name: '@testing-library/react', dev: true },
      { name: 'jest-environment-jsdom', dev: true },
    ],
    default: [{ name: 'jest', dev: true }],
  },
  pytest: {
    default: [{ name: 'pytest', pip: true }],
  },
};

function parseArgs(argv) {
  const cmd = argv[0];
  const specDirArg = ['configure', 'await'].includes(cmd) && argv[1] && !argv[1].startsWith('--')
    ? argv[1]
    : null;
  const rootIdx = argv.indexOf('--root');
  const frameworkIdx = argv.indexOf('--framework');
  const specDirIdx = argv.indexOf('--spec-dir');
  return {
    cmd,
    specDir: specDirArg ? path.resolve(specDirArg) : (specDirIdx >= 0 ? path.resolve(argv[specDirIdx + 1]) : null),
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

function fileExists(projectRoot, ...parts) {
  return fs.existsSync(path.join(projectRoot, ...parts));
}

function getAllDeps(pkg) {
  if (!pkg) return {};
  return { ...pkg.dependencies, ...pkg.devDependencies };
}

function hasViteTooling(projectRoot, deps) {
  return Boolean(
    deps.vite
    || fileExists(projectRoot, 'vite.config.js')
    || fileExists(projectRoot, 'vite.config.ts')
    || fileExists(projectRoot, 'vite.config.mjs')
  );
}

function hasWebpackTooling(projectRoot, deps) {
  return Boolean(
    deps.webpack
    || deps['@vue/cli-service']
    || deps['react-scripts']
    || fileExists(projectRoot, 'webpack.config.js')
    || fileExists(projectRoot, 'webpack.config.ts')
  );
}

function detectProjectType(projectRoot, pkg) {
  const deps = getAllDeps(pkg);
  if (deps['@nestjs/core']) return 'nestjs';
  if (deps.next) return 'next';

  const vite = hasViteTooling(projectRoot, deps);
  const webpack = hasWebpackTooling(projectRoot, deps);

  if (deps.vue) {
    if (vite && !webpack) return 'vue-vite';
    if (webpack) return 'vue-webpack';
    return 'vue';
  }
  if (deps.react) {
    if (vite && !deps['react-scripts']) return 'react-vite';
    if (webpack) return 'react-webpack';
    return 'react';
  }
  if (deps.express || deps.koa || deps.fastify) return 'node-api';
  if (pkg) return 'node';
  if (fileExists(projectRoot, 'pyproject.toml') || fileExists(projectRoot, 'requirements.txt')) return 'python';
  return 'unknown';
}

function detectSignals(projectRoot) {
  const signals = [];
  const pkg = readJson(path.join(projectRoot, 'package.json'));
  const projectType = detectProjectType(projectRoot, pkg);

  if (pkg) {
    signals.push('has_package_json');
    const allDeps = getAllDeps(pkg);
    if (allDeps.vitest) signals.push('has_vitest');
    if (allDeps.jest) signals.push('has_jest');
    if (allDeps.vue) signals.push('has_vue');
    if (allDeps.react) signals.push('has_react');
    if (allDeps.next) signals.push('has_next');
    if (allDeps['@nestjs/core']) signals.push('has_nestjs');
    if (allDeps.vite) signals.push('has_vite');
    if (allDeps.webpack || allDeps['@vue/cli-service'] || allDeps['react-scripts']) {
      signals.push('has_webpack');
    }
    const installed = detectInstalledTestFrameworks(projectRoot, pkg);
    if (installed.length) signals.push(`has_test_runner:${installed.join('+')}`);
    if (pkg.type === 'module') signals.push('esm_package');
  }

  if (projectType !== 'unknown') signals.push(`project_type:${projectType}`);
  if (fileExists(projectRoot, 'pyproject.toml') || fileExists(projectRoot, 'requirements.txt')) {
    signals.push('has_python_project');
  }
  if (!pkg && projectType === 'python') signals.push('greenfield_python');
  if (!pkg && projectType === 'unknown') signals.push('greenfield');

  return { signals, pkg, projectType };
}

function getRecommendedPackages(frameworkId, projectType) {
  const sets = PACKAGE_SETS[frameworkId];
  if (!sets) return [];
  return sets[projectType] || sets.default || [];
}

function inferPackageManager(projectRoot) {
  if (fileExists(projectRoot, 'pnpm-lock.yaml')) return 'pnpm';
  if (fileExists(projectRoot, 'yarn.lock')) return 'yarn';
  return 'npm';
}

function buildInstallCommands(projectRoot, packages) {
  const npmPkgs = packages.filter(p => !p.pip).map(p => p.name);
  const pipPkgs = packages.filter(p => p.pip).map(p => p.name);
  const commands = [];
  const pm = inferPackageManager(projectRoot);

  if (npmPkgs.length > 0) {
    if (pm === 'pnpm') commands.push(`pnpm add -D ${npmPkgs.join(' ')}`);
    else if (pm === 'yarn') commands.push(`yarn add -D ${npmPkgs.join(' ')}`);
    else commands.push(`npm install -D ${npmPkgs.join(' ')}`);
  }
  if (pipPkgs.length > 0) {
    commands.push(`pip install ${pipPkgs.join(' ')}`);
  }
  return commands;
}

function mapDetectedRunnerToPresetId(runnerId) {
  if (runnerId === 'vitest' || runnerId === 'jest' || runnerId === 'node:test') return runnerId;
  return 'jest';
}

function recommendFramework({ signals, projectType, projectRoot, pkg }) {
  const installed = detectInstalledTestFrameworks(projectRoot, pkg);
  if (installed.length > 0) {
    const primary = installed[0];
    const presetId = mapDetectedRunnerToPresetId(primary);
    return {
      id: presetId,
      reason: `已检测到测试框架 ${installed.join('/')}，沿用现有栈（configure 预设: ${presetId}）`,
      preset: PRESETS[presetId],
      detectedRunners: installed,
    };
  }

  if (projectType === 'python' || (signals.includes('has_python_project') && !signals.includes('has_package_json'))) {
    return {
      id: 'pytest',
      reason: '检测到 Python 项目结构，推荐 pytest',
      preset: PRESETS.pytest,
    };
  }
  if (projectType === 'vue-vite') {
    return {
      id: 'vitest',
      reason: '检测到 Vue + Vite，建议 vitest（亦可自装 jest/mocha 等，check 均放行）',
      preset: PRESETS.vitest,
    };
  }
  if (projectType === 'vue-webpack' || projectType === 'vue') {
    return {
      id: 'jest',
      reason: `检测到 ${projectType}（Webpack/Vue CLI 等），建议 jest（不绑定 Vite）`,
      preset: PRESETS.jest,
    };
  }
  if (projectType === 'react-vite') {
    return {
      id: 'vitest',
      reason: '检测到 React + Vite，建议 vitest（亦可自装 jest/mocha 等）',
      preset: PRESETS.vitest,
    };
  }
  if (projectType === 'react-webpack' || projectType === 'react') {
    return {
      id: 'jest',
      reason: `检测到 ${projectType}（Webpack/CRA 等），建议 jest（不绑定 Vite）`,
      preset: PRESETS.jest,
    };
  }
  if (projectType === 'next') {
    return {
      id: 'jest',
      reason: '检测到 Next.js 项目，建议 jest',
      preset: PRESETS.jest,
    };
  }
  if (projectType === 'nestjs') {
    return {
      id: 'jest',
      reason: '检测到 NestJS 项目，建议 jest',
      preset: PRESETS.jest,
    };
  }
  return {
    id: 'node:test',
    reason: 'Node 纯模块 / API，建议 node:test（零额外依赖）；或自装 vitest/jest/mocha 等',
    preset: PRESETS['node:test'],
  };
}

function isPackageInstalled(projectRoot, pkg, name) {
  const deps = getAllDeps(pkg);
  if (deps[name]) return { ok: true, source: 'package.json' };
  const inNodeModules = fileExists(projectRoot, 'node_modules', name, 'package.json');
  if (inNodeModules) return { ok: true, source: 'node_modules' };
  return { ok: false, source: null };
}

function checkNodeVersion() {
  const major = parseInt(process.versions.node.split('.')[0], 10);
  return major >= 18;
}

function detectInstalledTestFrameworks(projectRoot, pkg) {
  const found = [];
  const seen = new Set();
  for (const runner of NPM_TEST_RUNNERS) {
    if (seen.has(runner.id)) continue;
    if (isPackageInstalled(projectRoot, pkg, runner.package).ok) {
      found.push(runner.id);
      seen.add(runner.id);
    }
  }
  return found;
}

function isPytestInstalled() {
  try {
    execSync('python -c "import pytest" 2>nul || py -3 -c "import pytest"', {
      encoding: 'utf8',
      stdio: 'pipe',
      shell: true,
    });
    return true;
  } catch {
    return false;
  }
}

function auditRecommendedPackages(projectRoot, pkg, packages) {
  const installed = [];
  const missingRecommended = [];
  for (const item of packages) {
    if (item.pip) continue;
    if (isPackageInstalled(projectRoot, pkg, item.name).ok) {
      installed.push(item.name);
    } else {
      missingRecommended.push({
        name: item.name,
        reason: '推荐配套，未安装（不阻塞）',
      });
    }
  }
  return { installed, missingRecommended };
}

/**
 * 宽松门禁：推荐清单仅作提示。
 * 放行：已装任一已知单元测试框架（vitest/jest/mocha/…）、node:test（Node 18+）、或 pytest。
 * 栈/构建工具不匹配、配套缺失 → warnings，不阻塞。
 */
function checkFrameworkReady({ projectRoot, frameworkId, projectType, pkg }) {
  const packages = getRecommendedPackages(frameworkId, projectType);
  const warnings = [];
  const { installed, missingRecommended } = auditRecommendedPackages(projectRoot, pkg, packages);
  const npmRunners = detectInstalledTestFrameworks(projectRoot, pkg);
  const nodeOk = checkNodeVersion();
  const scriptOk = Boolean(pkg?.scripts?.['test:unit']);
  const scriptWarning = !scriptOk
    ? 'package.json 缺少 test:unit 脚本（configure 后会写入）'
    : null;

  const base = {
    framework: frameworkId,
    packages,
    installed,
    missingRecommended,
    installedRunners: npmRunners,
    warnings,
    scriptWarning,
    mode: 'lenient',
  };

  if (frameworkId === 'node:test') {
    if (nodeOk) {
      if (npmRunners.length > 0) {
        warnings.push(
          `已检测到 npm 测试栈 ${npmRunners.join('/')}，当前选择 node:test；verify 将按 node:test 逐条 AC 验收`
        );
      }
      if (missingRecommended.length) {
        warnings.push(
          `推荐配套未装全：${missingRecommended.map(m => m.name).join(', ')}（node:test 不依赖，可忽略）`
        );
      }
      return {
        ...base,
        ready: true,
        missing: [],
        detectedRunner: 'node:test',
        needsUserInstall: false,
      };
    }
    if (npmRunners.length > 0) {
      warnings.push(
        `Node.js 版本低于 18，但已检测到 ${npmRunners.join('/')}；已宽松放行，请确认 test:unit 可运行`
      );
      return {
        ...base,
        ready: true,
        missing: [],
        detectedRunner: npmRunners[0],
        needsUserInstall: false,
      };
    }
    return {
      ...base,
      ready: false,
      missing: [{ name: 'node>=18 或单元测试框架', reason: '未检测到 Node 18+ 或任一已知单元测试框架' }],
      needsUserInstall: true,
    };
  }

  if (frameworkId === 'pytest') {
    if (isPytestInstalled()) {
      if (missingRecommended.length) {
        warnings.push(`推荐配套未装全：${missingRecommended.map(m => m.name).join(', ')}（不阻塞）`);
      }
      return {
        ...base,
        ready: true,
        missing: [],
        detectedRunner: 'pytest',
        needsUserInstall: false,
      };
    }
    if (npmRunners.length > 0) {
      warnings.push(
        `选择了 pytest 但未检测到 pytest；已检测到 ${npmRunners.join('/')}，已宽松放行`
      );
      return {
        ...base,
        ready: true,
        missing: [],
        detectedRunner: npmRunners[0],
        needsUserInstall: false,
      };
    }
    return {
      ...base,
      ready: false,
      missing: [{ name: 'pytest 或单元测试框架', reason: '未检测到 pytest 或任一已知单元测试框架' }],
      needsUserInstall: true,
    };
  }

  // vitest / jest 等 wetspec 预设：任一已知测试框架即可放行
  if (npmRunners.length > 0) {
    const detectedRunner = npmRunners[0];
    const presetMatch = npmRunners.includes(frameworkId);
    if (!presetMatch) {
      warnings.push(
        `已检测到 ${npmRunners.join('/')}，你选择的是 ${frameworkId}；已宽松放行，configure 仍写入 ${frameworkId} 的 test:unit 脚本，请按实际框架调整`
      );
    }
    if (missingRecommended.length) {
      warnings.push(
        `推荐配套未装全：${missingRecommended.map(m => m.name).join(', ')}（不阻塞，build 阶段可按需补装）`
      );
    }
    return {
      ...base,
      ready: true,
      missing: [],
      detectedRunner,
      needsUserInstall: false,
    };
  }

  return {
    ...base,
    ready: false,
    missing: [{
      name: '单元测试框架',
      reason: `未检测到任一已知框架（如 ${NPM_TEST_RUNNERS.slice(0, 6).map(r => r.id).join('/')} 等）`,
    }],
    needsUserInstall: true,
  };
}

function cmdDetect({ projectRoot, asJson }) {
  const { signals, pkg, projectType } = detectSignals(projectRoot);
  const recommendation = recommendFramework({ signals, projectType, projectRoot, pkg });
  const recommendedPackages = getRecommendedPackages(recommendation.id, projectType);
  const installCommands = buildInstallCommands(projectRoot, recommendedPackages);
  const packageManager = inferPackageManager(projectRoot);

  const options = Object.entries(PRESETS).map(([id, preset]) => {
    const pkgs = getRecommendedPackages(id, projectType);
    const cmds = buildInstallCommands(projectRoot, pkgs);
    return {
      id,
      label: `${id}（${id === recommendation.id ? '推荐：' : ''}${preset.installHint}）`,
      preset: {
        framework: preset.framework,
        path: preset.path,
        command: preset.command,
      },
      recommendedPackages: pkgs,
      installCommands: cmds,
    };
  });

  const readiness = checkFrameworkReady({
    projectRoot,
    frameworkId: recommendation.id,
    projectType,
    pkg,
  });

  const report = {
    ok: true,
    projectRoot,
    projectType,
    packageManager,
    signals,
    recommendation: {
      id: recommendation.id,
      reason: recommendation.reason,
      preset: recommendation.preset,
    },
    recommendedPackages,
    installCommands,
    installHint: installCommands.length
      ? installCommands.join('\n')
      : '无需安装额外依赖',
    readiness: {
      ready: readiness.ready,
      mode: readiness.mode,
      needsUserInstall: readiness.needsUserInstall,
      missing: readiness.missing,
      missingRecommended: readiness.missingRecommended,
      detectedRunner: readiness.detectedRunner,
      warnings: readiness.warnings,
    },
    resumeHint: readiness.ready
      ? (readiness.warnings?.length
        ? '已宽松放行（有警告），可 check 后 configure；或按建议补装配套库'
        : null)
      : '请在本机终端执行上述安装命令，完成后回复「继续」以恢复 wetspec 流程',
    options,
    acNote: 'check 宽松模式：任一已知单元测试框架即可放行；推荐配套缺失仅警告；不绑定 Vite',
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n🧪 单元测试框架检测: ${projectRoot}\n`);
  console.log(`   项目类型: ${projectType}`);
  console.log(`   包管理器: ${packageManager}`);
  console.log(`   信号: ${signals.join(', ') || '无'}`);
  console.log(`   推荐: ${recommendation.id} — ${recommendation.reason}`);
  if (recommendedPackages.length) {
    console.log(`   建议安装: ${recommendedPackages.map(p => p.name).join(', ')}`);
  }
  if (installCommands.length) {
    console.log('\n   请在本机终端手动执行（Agent 不会代你安装）：');
    for (const cmd of installCommands) {
      console.log(`     ${cmd}`);
    }
  } else {
    console.log('   依赖: 无需额外安装');
  }
  if (readiness.warnings?.length) {
    console.log('\n   ⚠️  警告（不阻塞）：');
    for (const w of readiness.warnings) {
      console.log(`     - ${w}`);
    }
  }
  if (!readiness.ready) {
    console.log('\n   ⏸️  依赖未就绪 — 安装完成后回复「继续」，并运行: wetspec unit-test check');
  }
  console.log('');
}

function cmdCheck({ projectRoot, framework, specDir, asJson }) {
  const { pkg, projectType } = detectSignals(projectRoot);
  let frameworkId = framework;

  if (!frameworkId && specDir) {
    const state = loadState(specDir);
    frameworkId = state?.unit_test?.pending_framework || state?.unit_test?.framework;
  }
  if (!frameworkId) {
    const detected = detectSignals(projectRoot);
    const rec = recommendFramework({
      signals: detected.signals,
      projectType,
      projectRoot,
      pkg: detected.pkg,
    });
    frameworkId = rec.id;
  }

  if (!PRESETS[frameworkId] && frameworkId !== 'defer') {
    console.error(`❌ 未知框架: ${frameworkId}`);
    process.exit(1);
  }

  const readiness = checkFrameworkReady({
    projectRoot,
    frameworkId,
    projectType,
    pkg,
  });
  const installCommands = buildInstallCommands(projectRoot, readiness.packages);

  const report = {
    ok: readiness.ready,
    projectRoot,
    projectType,
    framework: frameworkId,
    ready: readiness.ready,
    mode: readiness.mode,
    detectedRunner: readiness.detectedRunner,
    installedRunners: readiness.installedRunners,
    installed: readiness.installed,
    missing: readiness.missing,
    missingRecommended: readiness.missingRecommended,
    warnings: readiness.warnings,
    installCommands,
    scriptWarning: readiness.scriptWarning || null,
    resumeHint: readiness.ready
      ? (readiness.warnings?.length
        ? '已宽松放行（有警告），可执行 configure；建议查看 warnings'
        : '依赖已就绪，可执行 wetspec unit-test configure 并继续 wetspec 流程')
      : '请在本机终端执行 installCommands，完成后回复「继续」并重新运行 check',
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(readiness.ready ? 0 : 1);
  }

  console.log(`\n🧪 单元测试就绪检查: ${frameworkId}（宽松模式）\n`);
  if (readiness.ready) {
    console.log('   ✅ 已放行');
    if (readiness.detectedRunner) {
      console.log(`   检测到运行栈: ${readiness.detectedRunner}`);
    }
    if (readiness.installed.length) {
      console.log(`   已装推荐包: ${readiness.installed.join(', ')}`);
    }
    if (readiness.warnings?.length) {
      console.log('   ⚠️  警告：');
      for (const w of readiness.warnings) {
        console.log(`      - ${w}`);
      }
    }
    if (readiness.scriptWarning) {
      console.log(`   ⚠️  ${readiness.scriptWarning}`);
    }
    console.log('   ➡️  可继续: wetspec unit-test configure specs/ --framework', frameworkId);
  } else {
    console.log('   ❌ 依赖未就绪');
    for (const m of readiness.missing) {
      console.log(`      - ${m.name}: ${m.reason}`);
    }
    if (installCommands.length) {
      console.log('\n   请在本机终端手动执行：');
      for (const cmd of installCommands) {
        console.log(`     ${cmd}`);
      }
    }
    console.log('\n   安装完成后回复「继续」，并重新运行: wetspec unit-test check');
  }
  console.log('');
  process.exit(readiness.ready ? 0 : 1);
}

function updatePackageJsonScriptsOnly(projectRoot, preset) {
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
  pkg.scripts['test:unit'] = preset.testUnitScript;
  if (preset.testScript) {
    pkg.scripts.test = preset.testScript;
  }

  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  return { updated: true, path: pkgPath, scriptsOnly: true };
}

function cmdConfigure({ specDir, projectRoot, framework, install, asJson }) {
  if (!specDir || !framework) {
    console.error('用法: wetspec unit-test configure <spec_dir> --framework <id> [--root .]');
    process.exit(1);
  }

  if (install) {
    console.warn('\n⚠️  --install 已废弃：wetspec 不替用户安装依赖。请用户在本机终端手动安装后运行 unit-test check。\n');
  }

  const state = loadState(specDir);
  if (!state) {
    console.error(`❌ 状态文件不存在: ${path.join(specDir, STATE_FILE)}`);
    process.exit(1);
  }

  const { projectType } = detectSignals(projectRoot);

  if (framework !== 'defer') {
    const readiness = checkFrameworkReady({
      projectRoot,
      frameworkId: framework,
      projectType,
      pkg: readJson(path.join(projectRoot, 'package.json')),
    });
    if (!readiness.ready) {
      const msg = {
        ok: false,
        error: 'unit_test_not_ready',
        framework,
        missing: readiness.missing,
        installCommands: buildInstallCommands(projectRoot, readiness.packages),
        hint: '请先让用户手动安装依赖，wetspec unit-test check 通过后再 configure',
      };
      if (asJson) {
        console.log(JSON.stringify(msg, null, 2));
      } else {
        console.error(`\n❌ 单元测试依赖未就绪，无法 configure: ${framework}`);
        for (const m of readiness.missing) {
          console.error(`   - ${m.name}`);
        }
        if (msg.installCommands.length) {
          console.error('\n   请用户在本机执行：');
          for (const c of msg.installCommands) console.error(`     ${c}`);
        }
        console.error('\n   完成后: wetspec unit-test check --framework', framework);
      }
      process.exit(1);
    }
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
    unitTest = {
      framework: preset.framework,
      deferred: false,
      path: preset.path,
      command: preset.command,
      configured_at: now,
      ac_runner: framework === 'node:test' ? 'node:test' : framework,
      ac_note: framework === 'node:test'
        ? 'wetspec verify 按 describe(LOG-xxx)→describe(AC-xxx) 逐条跑单元测试'
        : 'wetspec verify 整包执行 unit_test.command',
      pending_framework: null,
    };
  }

  state.unit_test = unitTest;
  if (state.phase === 'awaiting-unit-test') {
    state.phase = 'parse';
  }
  saveState(specDir, state);

  let pkgResult = { updated: false };
  if (framework !== 'defer') {
    pkgResult = updatePackageJsonScriptsOnly(projectRoot, PRESETS[framework]);
    if (install && Object.keys(PRESETS[framework].devDependencies || {}).length > 0) {
      try {
        execSync('npm install', { cwd: projectRoot, stdio: 'inherit' });
      } catch {
        /* user-facing install failure */
      }
    }
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
    console.log('   package.json: 已写入 test:unit 脚本（未修改 devDependencies）');
  }
  if (framework !== 'defer') {
    console.log(`   运行: ${unitTest.command}`);
  }
}

function cmdAwait({ specDir, projectRoot, framework, asJson }) {
  if (!specDir || !framework) {
    console.error('用法: wetspec unit-test await <spec_dir> --framework <id> [--root .]');
    process.exit(1);
  }

  const state = loadState(specDir);
  if (!state) {
    console.error(`❌ 状态文件不存在: ${path.join(specDir, STATE_FILE)}`);
    process.exit(1);
  }

  const { projectType } = detectSignals(projectRoot);
  const packages = getRecommendedPackages(framework, projectType);
  const installCommands = buildInstallCommands(projectRoot, packages);
  const readiness = checkFrameworkReady({
    projectRoot,
    frameworkId: framework,
    projectType,
    pkg: readJson(path.join(projectRoot, 'package.json')),
  });

  state.unit_test = {
    ...(state.unit_test || {}),
    pending_framework: framework,
    deferred: false,
    pending_at: new Date().toISOString().slice(0, 10),
  };
  state.phase = 'awaiting-unit-test';
  saveState(specDir, state);

  const report = {
    ok: true,
    paused: true,
    phase: 'awaiting-unit-test',
    framework,
    projectType,
    recommendedPackages: packages,
    installCommands,
    ready: readiness.ready,
    resumeHint: readiness.ready
      ? '依赖已就绪，可直接 wetspec unit-test configure'
      : '请用户在本机安装依赖，完成后回复「继续」并运行 wetspec unit-test check',
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n⏸️  wetspec 已暂停 — 等待单元测试依赖（DP-0）\n`);
  console.log(`   框架: ${framework}`);
  console.log(`   项目类型: ${projectType}`);
  if (installCommands.length) {
    console.log('\n   请在本机终端手动执行（Agent 不会代你安装）：');
    for (const cmd of installCommands) {
      console.log(`     ${cmd}`);
    }
  }
  console.log('\n   安装完成后回复「继续」，并运行:');
  console.log(`     wetspec unit-test check --framework ${framework} --spec-dir ${specDir}`);
  console.log(`     wetspec unit-test configure ${specDir} --framework ${framework}`);
  console.log('');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes('--help')) {
    console.log(`
用法:
  wetspec unit-test detect [--root <project_root>] [--json]
  wetspec unit-test check [--root <project_root>] [--framework <id>] [--spec-dir <specs/>] [--json]
  wetspec unit-test await <spec_dir> --framework <id> [--root <project_root>] [--json]
  wetspec unit-test configure <spec_dir> --framework <id> [--root <project_root>] [--json]

子命令:
  detect     识别项目类型，推荐框架与须自行安装的包（不安装）
  check      检查用户是否已安装所选框架依赖（退出 0=就绪）
  await      记录 pending 框架并设 phase=awaiting-unit-test，提示用户安装后暂停
  configure  写入 .wetspec.yaml 与 test:unit 脚本（须 check 通过；不安装依赖）

framework:
  node:test  Node 内置（纯 Node / API）
  vitest     Vue / React + Vite
  jest       Next.js / NestJS / React
  pytest     Python
  defer      暂缓选定

DP-0：Agent 禁止 npm/pnpm install；check 宽松模式（任一已知测试框架即放行，不绑定 Vite/Webpack）。
`);
    process.exit(argv.includes('--help') ? 0 : 1);
  }

  const args = parseArgs(argv);
  if (args.cmd === 'detect') {
    cmdDetect(args);
  } else if (args.cmd === 'check') {
    cmdCheck(args);
  } else if (args.cmd === 'await') {
    const specDir = args.specDir || (argv[1] && !argv[1].startsWith('--') ? path.resolve(argv[1]) : null);
    cmdAwait({ ...args, specDir });
  } else if (args.cmd === 'configure') {
    cmdConfigure(args);
  } else {
    console.error(`❌ 未知子命令: ${args.cmd}`);
    process.exit(1);
  }
}

main();
