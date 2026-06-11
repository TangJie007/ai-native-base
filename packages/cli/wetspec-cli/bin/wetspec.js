#!/usr/bin/env node
/**
 * wetspec CLI — 统一入口，转发到 scripts/
 *
 * 用法: wetspec <command> [args...]
 *       wetspec --help
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCRIPTS = path.join(ROOT, 'scripts');

const COMMANDS = {
  compare: 'compare_prd.js',
  coverage: 'check_coverage.js',
  ingest: 'prd_ingest.js',
  validate: 'validate_spec.js',
  'sync-md': 'sync_spec_md.js',
  indexes: 'generate_indexes.js',
  sync: 'wetspec_sync.js',
  state: 'wetspec_state.js',
  doctor: 'wetspec_doctor.js',
  verify: 'wetspec_verify.js',
  change: 'wetspec_change.js',
  archive: 'wetspec_archive.js',
  preflight: 'wetspec_preflight.js',
  init: 'init_spec_structure.js',
  'unit-test': 'wetspec_unit_test.js',
  'py-install': 'wetspec_py_install.js',
};

const HELP = `
wetspec — PRD→Spec 工作流 CLI（Agent 无关，Node 18+）

用法:
  wetspec <command> [args...]

命令:
  compare     PRD 差异对比（默认 Python 引擎）
              wetspec compare <old.md> <new.md> [--spec-dir specs/] [-o diff.json]

  coverage    PRD↔Spec 覆盖率
              wetspec coverage <PRD.md> <specs_dir>

  ingest      PRD 摄入（PDF/Word/文本→Markdown）
              wetspec ingest <file> [-o out.md] [--json]

  validate    校验 Spec YAML
              wetspec validate <specs_dir>

  sync-md     YAML → Markdown 同步
              wetspec sync-md <specs_dir> [--check]

  indexes     重建 INDEX/README
              wetspec indexes <specs_dir> [--prd PRD.md]

  sync        全量同步（fallback）
              wetspec sync <specs_dir> [--dry-run]

  state       状态机（.wetspec.yaml）
              wetspec state init|get|set|check|validate <specs_dir> ...

  doctor      健康诊断
              wetspec doctor <specs_dir>

  verify      按 AC 跑单元测试，结果写回 Spec YAML
              wetspec verify <spec.yaml> [--root .] [--no-write] [--json]

  change      Change delta 管理
              wetspec change init|set-manifest|validate-delta|list-delta ...

  archive     delta → 主 specs 回写
              wetspec archive <change_dir> [--dry-run]

  preflight   多人协作预检
              wetspec preflight <change_dir> --main-specs specs/ --prd PRD.md

  init        初始化 Spec 目录结构
              wetspec init <modules.json> <specs_dir> [version]

  unit-test   单元测试框架检测 / 就绪检查 / 配置（DP-0；用户自装，不代装）
              wetspec unit-test detect [--root .] [--json]
              wetspec unit-test check [--framework <id>] [--spec-dir specs/] [--json]
              wetspec unit-test await <specs_dir> --framework <id> [--root .]
              wetspec unit-test configure <specs_dir> --framework <id> [--root .]

  py-install  安装 / 检测 Python 插件依赖
              wetspec py-install [--check] [--user] [--quiet] [--json]

环境变量:
  WETSPEC_ROOT   覆盖 CLI 包根目录（默认自动检测）

示例:
  wetspec compare PRD_v1.0.md PRD_v1.1.md --spec-dir specs/ -o diff.json
  wetspec change init wetspec/changes/my-change --main-specs specs/ --prd PRD.md
  wetspec archive wetspec/changes/my-change --dry-run
  wetspec doctor specs/
`;

function scriptPath(name) {
  const root = process.env.WETSPEC_ROOT
    ? path.resolve(process.env.WETSPEC_ROOT)
    : ROOT;
  const scripts = path.join(root, 'scripts');
  const file = path.join(scripts, name);
  if (!fs.existsSync(file)) {
    console.error(`❌ 脚本不存在: ${file}`);
    process.exit(1);
  }
  return file;
}

function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    console.log(HELP.trim());
    process.exit(0);
  }

  if (argv[0] === '--version' || argv[0] === '-V') {
    const pkg = require(path.join(ROOT, 'package.json'));
    console.log(pkg.version);
    process.exit(0);
  }

  const cmd = argv[0];
  const script = COMMANDS[cmd];

  if (!script) {
    console.error(`❌ 未知命令: ${cmd}\n运行 wetspec --help 查看可用命令`);
    process.exit(1);
  }

  const file = scriptPath(script);
  const childArgs = argv.slice(1);

  const result = spawnSync(process.execPath, [file, ...childArgs], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
  });

  if (result.error) {
    console.error(`❌ 执行失败: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

main();
