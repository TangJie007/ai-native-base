#!/usr/bin/env node
/**
 * wetspec_change.js — Change 内 delta 隔离管理
 *
 * 用法:
 *   node wetspec_change.js init <change_dir> --main-specs <specs_dir> [--change-name <name>] [--prd <file>]
 *   node wetspec_change.js validate-delta <change_dir> [--json]
 *   node wetspec_change.js list-delta <change_dir> [--json]
 *   node wetspec_change.js set-manifest <change_dir> --diff <diff.json> [--affected '<json array>']
 */

const fs = require('fs');
const path = require('path');
const { yaml } = require('./lib/spec_utils');
const { runPy, pyAvailable } = require('./lib/py_runner');
const {
  DELTA_DIR_NAME,
  MANIFEST_FILE,
  normalizeRel,
  deltaDir,
  manifestPath,
  listDeltaYamlSpecs,
} = require('./lib/change_paths');

const DEFAULT_CHANGE_STATE = {
  version: '1.1',
  scope: 'change',
  workflow: 'delta',
  phase: 'idle',
  mode: 'incremental',
  change_name: null,
  main_specs: null,
  delta_dir: DELTA_DIR_NAME,
  prd: { current: null, previous: null },
  last_diff: null,
  affected_specs: [],
  archived: false,
};

function parseArgs(argv) {
  const cmd = argv[0];
  const changeDir = argv[1];
  if (!cmd || cmd === '--help') {
    printHelp();
    process.exit(0);
  }
  const getFlag = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : null;
  };
  return {
    cmd,
    changeDir,
    mainSpecs: getFlag('--main-specs'),
    changeName: getFlag('--change-name'),
    prd: getFlag('--prd'),
    diff: getFlag('--diff'),
    affectedOverride: getFlag('--affected'),
    affectedFile: getFlag('--affected-file'),
    asJson: argv.includes('--json'),
  };
}

function printHelp() {
  console.log(`
wetspec Change 隔离 — change 内只存 delta，禁止全量复制主 specs

用法:
  node wetspec_change.js init <change_dir> --main-specs <specs_dir> [--change-name <name>] [--prd <file>]
  node wetspec_change.js set-manifest <change_dir> --diff <diff.json>
  node wetspec_change.js validate-delta <change_dir> [--json]
  node wetspec_change.js list-delta <change_dir> [--json]

目录约定:
  <changes_root>/<name>/   # 默认 wetspec/changes/
    .wetspec.yaml              # change 级状态（scope: change）
    wetspec-delta/             # 仅 affected_specs 的 YAML
      MANIFEST.json
      模块/功能_spec.yaml
`);
}

function loadManifest(changeDir) {
  const p = manifestPath(changeDir);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveManifest(changeDir, manifest) {
  const dir = deltaDir(changeDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(manifestPath(changeDir), JSON.stringify(manifest, null, 2), 'utf8');
}

function loadChangeState(changeDir) {
  const p = path.join(path.resolve(changeDir), '.wetspec.yaml');
  if (!fs.existsSync(p)) return null;
  return yaml.load(fs.readFileSync(p, 'utf8'));
}

function saveChangeState(changeDir, state) {
  const p = path.join(path.resolve(changeDir), '.wetspec.yaml');
  fs.writeFileSync(p, yaml.dump(state, { lineWidth: 120, noRefs: true }), 'utf8');
}

function cmdInit({ changeDir, mainSpecs, changeName, prd }) {
  if (!changeDir || !mainSpecs) {
    console.error('❌ init 需要 <change_dir> 和 --main-specs');
    process.exit(1);
  }
  const absChange = path.resolve(changeDir);
  const absMain = path.resolve(mainSpecs);
  const name = changeName || path.basename(absChange);

  if (!fs.existsSync(absMain)) {
    console.error(`❌ 主 specs 目录不存在: ${absMain}`);
    process.exit(1);
  }
  fs.mkdirSync(absChange, { recursive: true });
  fs.mkdirSync(deltaDir(absChange), { recursive: true });

  const state = {
    ...DEFAULT_CHANGE_STATE,
    change_name: name,
    main_specs: normalizeRel(path.relative(process.cwd(), absMain)) || absMain,
    phase: 'idle',
  };
  if (prd) {
    state.prd.current = path.basename(path.resolve(prd));
    const mainStatePath = path.join(absMain, '.wetspec.yaml');
    if (fs.existsSync(mainStatePath)) {
      const mainState = yaml.load(fs.readFileSync(mainStatePath, 'utf8'));
      state.prd.previous = mainState?.prd?.current || null;
    }
  }
  saveChangeState(absChange, state);

  const manifest = {
    change_name: name,
    main_specs: state.main_specs,
    affected_specs: [],
    rules: '本目录仅允许存放 affected_specs 中的 Spec YAML，禁止全量复制主 specs',
    created_at: new Date().toISOString(),
  };
  saveManifest(absChange, manifest);

  console.log(`✅ Change 工作区已初始化: ${absChange}`);
  console.log(`   scope: change | delta: ${DELTA_DIR_NAME}/`);
  console.log(`   main_specs: ${state.main_specs}`);
  console.log(`   ⚠️  增量更新请只写入 wetspec-delta/，不要复制整个主 specs 目录`);
}

function cmdSetManifest({ changeDir, diff, affectedOverride, affectedFile, asJson }) {
  if (!changeDir) {
    console.error('❌ set-manifest 需要 <change_dir>');
    process.exit(1);
  }
  let comparison = { affected_specs: [], details: [] };
  if (diff) {
    const absDiff = path.resolve(diff);
    if (!fs.existsSync(absDiff)) {
      console.error(`❌ diff 不存在: ${absDiff}`);
      process.exit(1);
    }
    comparison = JSON.parse(fs.readFileSync(absDiff, 'utf8'));
  }
  let affected = (comparison.affected_specs || []).map(normalizeRel);
  if (affectedFile) {
    const abs = path.resolve(affectedFile);
    if (!fs.existsSync(abs)) {
      console.error(`❌ --affected-file 不存在: ${abs}`);
      process.exit(1);
    }
    const parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
    if (Array.isArray(parsed) && parsed.length) affected = parsed.map(normalizeRel);
  } else if (affectedOverride) {
    try {
      const parsed = JSON.parse(affectedOverride);
      if (Array.isArray(parsed) && parsed.length) affected = parsed.map(normalizeRel);
    } catch {
      console.error('❌ --affected 必须是 JSON 数组');
      process.exit(1);
    }
  }
  if (!affected.length && diff && pyAvailable()) {
    const mainSpecs = loadChangeState(path.resolve(changeDir))?.main_specs || 'specs';
    const enrich = runPy('map_affected.py', [
      '--diff', `"${path.resolve(diff)}"`,
      '--spec-dir', `"${path.resolve(mainSpecs)}"`,
      '--json',
    ], { json: true });
    if (enrich.ok && enrich.data?.affected_specs?.length) {
      affected = enrich.data.affected_specs.map(normalizeRel);
      console.error(`ℹ️  map_affected.py 补充 ${affected.length} 个 affected_specs`);
    }
  }

  if (!affected.length) {
    console.error('❌ affected_specs 为空：请用 --affected-file 手动指定或检查 PRD/Spec 映射');
    process.exit(1);
  }

  const manifest = loadManifest(changeDir) || {
    change_name: path.basename(path.resolve(changeDir)),
    main_specs: 'specs/',
    affected_specs: [],
    rules: '本目录仅允许存放 affected_specs 中的 Spec YAML',
  };

  manifest.affected_specs = affected.map(rel => ({
    path: rel,
    change_type: inferChangeType(comparison, rel),
  }));
  manifest.updated_at = new Date().toISOString();
  if (diff) manifest.diff_source = normalizeRel(path.relative(process.cwd(), path.resolve(diff)));
  saveManifest(changeDir, manifest);

  const state = loadChangeState(changeDir) || { ...DEFAULT_CHANGE_STATE };
  state.last_diff = manifest.diff_source;
  state.affected_specs = affected;
  state.phase = state.phase === 'idle' ? 'update' : state.phase;
  saveChangeState(path.resolve(changeDir), state);

  const result = { ok: true, affected_specs: affected, manifest: manifestPath(changeDir) };
  if (asJson) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`✅ MANIFEST 已更新 (${affected.length} 个 affected_specs)`);
    affected.forEach(p => console.log(`   - ${p}`));
  }
}

function inferChangeType(comparison, relPath) {
  const detail = (comparison.details || []).find(d => normalizeRel(d.affectedSpecFile || '') === relPath);
  return detail?.changeType || detail?.type || 'modified';
}

function cmdValidateDelta({ changeDir, asJson }) {
  const absChange = path.resolve(changeDir);
  const manifest = loadManifest(absChange);
  const state = loadChangeState(absChange);

  if (!manifest) {
    console.error('[HARD STOP] 缺少 wetspec-delta/MANIFEST.json，请先 wetspec_change.js init');
    process.exit(1);
  }

  const allowed = new Set((manifest.affected_specs || []).map(e => normalizeRel(typeof e === 'string' ? e : e.path)));
  const deltaFiles = listDeltaYamlSpecs(absChange);
  const errors = [];
  const warnings = [];

  for (const f of deltaFiles) {
    if (!allowed.has(f.rel)) {
      errors.push(`非法 delta 文件（不在 affected_specs）: ${f.rel}`);
    }
  }

  for (const rel of allowed) {
    const exists = deltaFiles.some(f => f.rel === rel);
    if (!exists) {
      warnings.push(`affected_specs 尚无 delta 文件: ${rel}`);
    }
  }

  const mainSpecs = state?.main_specs || manifest.main_specs;
  const mainCount = countMainSpecs(mainSpecs);
  if (deltaFiles.length > 0 && deltaFiles.length >= mainCount * 0.5 && mainCount > 2) {
    warnings.push(
      `delta 文件数 (${deltaFiles.length}) 接近主库功能数 (${mainCount})，疑似全量复制 — 请确认仅包含 affected_specs`
    );
  }

  const report = {
    ok: errors.length === 0,
    change_dir: absChange,
    allowed: [...allowed],
    delta_files: deltaFiles.map(f => f.rel),
    errors,
    warnings,
  };

  if (asJson) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`\n=== validate-delta: ${path.basename(absChange)} ===\n`);
    if (errors.length) errors.forEach(e => console.error(`❌ ${e}`));
    if (warnings.length) warnings.forEach(w => console.warn(`⚠️  ${w}`));
    if (report.ok) {
      console.log(`✅ delta 合规 | 允许 ${allowed.size} 个，实际 ${deltaFiles.length} 个`);
    } else {
      console.error(`\n[HARD STOP] delta 校验失败`);
    }
  }
  process.exit(report.ok ? 0 : 1);
}

function countMainSpecs(mainSpecsRel) {
  const { findYamlSpecs } = require('./lib/spec_utils');
  const abs = path.resolve(mainSpecsRel);
  if (!fs.existsSync(abs)) return 0;
  return findYamlSpecs(abs).length;
}

function cmdListDelta({ changeDir, asJson }) {
  const absChange = path.resolve(changeDir);
  const manifest = loadManifest(absChange);
  const deltaFiles = listDeltaYamlSpecs(absChange);
  const result = {
    change_dir: absChange,
    delta_dir: deltaDir(absChange),
    manifest: manifest || null,
    delta_files: deltaFiles.map(f => f.rel),
  };
  if (asJson) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Change: ${path.basename(absChange)}`);
    console.log(`Delta: ${result.delta_dir}`);
    if (manifest?.affected_specs?.length) {
      console.log('\nMANIFEST affected_specs:');
      manifest.affected_specs.forEach(e => {
        const p = typeof e === 'string' ? e : e.path;
        const has = deltaFiles.some(f => f.rel === p);
        console.log(`  ${has ? '✅' : '⏳'} ${p}`);
      });
    }
    if (deltaFiles.length) {
      console.log('\nDelta 文件:');
      deltaFiles.forEach(f => console.log(`  - ${f.rel}`));
    } else {
      console.log('\n（尚无 delta 文件）');
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  switch (args.cmd) {
    case 'init': cmdInit(args); break;
    case 'set-manifest': cmdSetManifest(args); break;
    case 'validate-delta': cmdValidateDelta(args); break;
    case 'list-delta': cmdListDelta(args); break;
    default:
      console.error(`未知命令: ${args.cmd}`);
      printHelp();
      process.exit(1);
  }
}

main();
