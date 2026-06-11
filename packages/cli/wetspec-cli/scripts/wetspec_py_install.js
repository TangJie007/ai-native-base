#!/usr/bin/env node
/**
 * wetspec_py_install.js — 安装 / 检测 Python 插件依赖
 *
 * 用法:
 *   node wetspec_py_install.js [--check] [--user] [--quiet] [--json]
 */

const {
  findPython,
  ensurePyDeps,
  checkPyDeps,
  requirementsPath,
} = require('./lib/py_runner');

function parseArgs(argv) {
  return {
    checkOnly: argv.includes('--check'),
    user: argv.includes('--user'),
    quiet: argv.includes('--quiet'),
    asJson: argv.includes('--json'),
    help: argv.includes('--help'),
  };
}

function printHelp() {
  console.log(`
用法:
  wetspec py-install              安装 Python 插件依赖（PyYAML、rapidfuzz、PDF/Word 可选包）
  wetspec py-install --check      仅检测 Python 与依赖是否就绪
  wetspec py-install --user       pip install --user（无全局写权限时）
  wetspec py-install --quiet      减少 pip 输出
  wetspec py-install --json       JSON 输出（CI / Agent）

说明:
  - 需要本机已安装 Python 3 且 pip 可用
  - 增强 compare / coverage / ingest（PDF/Word）能力；未安装时 CLI 可回退 Node（ingest PDF 除外）
`);
}

function formatReport(check) {
  return {
    python: check.python,
    requirements: check.requirements,
    core: check.core,
    optional: check.optional,
    ready: check.ok,
    pdf_word_ready: check.optional?.ok ?? false,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.checkOnly) {
    const check = checkPyDeps();
    const report = formatReport(check);

    if (args.asJson) {
      console.log(JSON.stringify(report, null, 2));
      process.exit(check.ok ? 0 : 1);
    }

    console.log('\n🐍 wetspec Python 插件检测\n');
    if (!check.python) {
      console.log('   ❌ 未找到 Python 3（请安装并加入 PATH）');
      console.log(`   📄 requirements: ${requirementsPath()}\n`);
      process.exit(1);
    }
    console.log(`   ✅ Python: ${check.python}`);
    if (check.core.ok) {
      console.log('   ✅ 核心依赖: PyYAML, rapidfuzz');
    } else {
      console.log(`   ❌ 缺少核心依赖: ${check.core.missing.join(', ')}`);
      console.log('   ➡️  运行: wetspec py-install\n');
    }
    if (check.optional.ok) {
      console.log('   ✅ 可选依赖: pymupdf, python-docx（PDF/Word 摄入）');
    } else {
      console.log(`   ⚠️  缺少可选依赖: ${check.optional.missing.join(', ')}（PDF/Word 摄入受限）`);
    }
    console.log('');
    process.exit(check.ok ? 0 : 1);
  }

  const result = ensurePyDeps({ quiet: args.quiet, user: args.user });

  if (args.asJson) {
    const payload = {
      ok: result.ok,
      python: result.python || findPython(),
      requirements: result.requirements || requirementsPath(),
      error: result.error || null,
      check: result.check ? formatReport(result.check) : checkPyDeps(),
    };
    console.log(JSON.stringify(payload, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (!result.ok) {
    console.error(`\n❌ Python 插件安装失败: ${result.error}\n`);
    console.error('提示:');
    console.error('  - 确认已安装 Python 3: python --version');
    console.error('  - 无权限时可试: wetspec py-install --user');
    console.error('  - 仅检测: wetspec py-install --check\n');
    process.exit(1);
  }

  console.log('\n✅ Python 插件依赖已安装');
  console.log(`   Python: ${result.python}`);
  console.log(`   requirements: ${result.requirements}`);

  const check = result.check || checkPyDeps();
  if (check.core?.ok) {
    console.log('   核心: PyYAML, rapidfuzz ✓');
  }
  if (check.optional?.ok) {
    console.log('   可选: pymupdf, python-docx ✓（支持 PDF/Word 摄入）');
  } else if (check.optional?.missing?.length) {
    console.log(`   ⚠️  可选包未就绪: ${check.optional.missing.join(', ')}（compare/coverage 仍可用）`);
  }
  console.log('\n   验证: wetspec py-install --check\n');
  process.exit(0);
}

main();
