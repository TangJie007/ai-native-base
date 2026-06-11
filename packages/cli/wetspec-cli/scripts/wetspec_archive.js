#!/usr/bin/env node
/**
 * wetspec_archive.js — 将 change 内 wetspec-delta 回写主 specs/（archive 时执行）
 *
 * 用法:
 *   node wetspec_archive.js <change_dir> [--main-specs <specs_dir>] [--dry-run] [--json]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { yaml } = require('./lib/spec_utils');
const {
  normalizeRel,
  deltaDir,
  manifestPath,
  listDeltaYamlSpecs,
  deltaFilePath,
  mainSpecPath,
} = require('./lib/change_paths');

const SCRIPTS = __dirname;

function runNode(script, args) {
  return execSync(`node "${path.join(SCRIPTS, script)}" ${args}`, { encoding: 'utf8' });
}

function parseArgs(argv) {
  const changeDir = argv[0];
  if (!changeDir || changeDir === '--help') {
    console.log(`
用法:
  node wetspec_archive.js <change_dir> [--main-specs <specs_dir>] [--dry-run] [--json]

将 wetspec-delta/ 中 affected_specs 回写主 specs/，并同步 MD、重建索引。
`);
    process.exit(changeDir === '--help' ? 0 : 1);
  }
  const mainIdx = argv.indexOf('--main-specs');
  return {
    changeDir: path.resolve(changeDir),
    mainSpecs: mainIdx >= 0 ? path.resolve(argv[mainIdx + 1]) : null,
    dryRun: argv.includes('--dry-run'),
    asJson: argv.includes('--json'),
  };
}

function loadManifest(changeDir) {
  const p = manifestPath(changeDir);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function loadChangeState(changeDir) {
  const p = path.join(changeDir, '.wetspec.yaml');
  if (!fs.existsSync(p)) return null;
  return yaml.load(fs.readFileSync(p, 'utf8'));
}

function resolveMainSpecs(changeDir, override) {
  if (override) return override;
  const state = loadChangeState(changeDir);
  if (state?.main_specs) return path.resolve(state.main_specs);
  const manifest = loadManifest(changeDir);
  if (manifest?.main_specs) return path.resolve(manifest.main_specs);
  return path.resolve('specs');
}

function getAffectedList(manifest, state) {
  if (manifest?.affected_specs?.length) {
    return manifest.affected_specs.map(e => ({
      path: normalizeRel(typeof e === 'string' ? e : e.path),
      change_type: typeof e === 'object' ? e.change_type : 'modified',
    }));
  }
  return (state?.affected_specs || []).map(p => ({ path: normalizeRel(p), change_type: 'modified' }));
}

function archive({ changeDir, mainSpecs, dryRun, asJson }) {
  const manifest = loadManifest(changeDir);
  const state = loadChangeState(changeDir);
  const absMain = resolveMainSpecs(changeDir, mainSpecs);

  if (!manifest && !state?.affected_specs?.length) {
    console.error('[HARD STOP] 无 MANIFEST 且无 affected_specs，无法 archive');
    process.exit(1);
  }
  if (!fs.existsSync(absMain)) {
    console.error(`❌ 主 specs 不存在: ${absMain}`);
    process.exit(1);
  }

  // 先校验 delta
  try {
    runNode('wetspec_change.js', `validate-delta "${changeDir}" --json`);
  } catch (e) {
    const out = e.stdout?.toString() || '';
    try {
      const report = JSON.parse(out);
      if (!report.ok) {
        console.error('[HARD STOP] delta 校验未通过，拒绝 archive');
        process.exit(1);
      }
    } catch {
      console.error('[HARD STOP] 请先运行 wetspec_change.js validate-delta');
      process.exit(1);
    }
  }

  const affected = getAffectedList(manifest, state);
  const actions = [];

  for (const item of affected) {
    const rel = item.path;
    const src = deltaFilePath(changeDir, rel);
    const dest = mainSpecPath(absMain, rel);

    if (!fs.existsSync(src)) {
      actions.push({ rel, status: 'skipped', reason: 'delta 文件缺失' });
      continue;
    }

    if (dryRun) {
      actions.push({ rel, status: 'would_copy', src: normalizeRel(path.relative(process.cwd(), src)), dest: normalizeRel(path.relative(process.cwd(), dest)) });
      continue;
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    actions.push({ rel, status: 'copied', change_type: item.change_type });
  }

  if (!dryRun && actions.some(a => a.status === 'copied')) {
    const copied = actions.filter(a => a.status === 'copied');
    for (const a of copied) {
      const dest = mainSpecPath(absMain, a.rel);
      runNode('sync_spec_md.js', `"${absMain}" --file "${dest}"`);
    }
    const prd = state?.prd?.current || manifest?.prd?.current;
    const prdArg = prd ? ` --prd "${path.resolve(prd)}"` : '';
    try {
      runNode('generate_indexes.js', `"${absMain}"${prdArg}`);
    } catch { /* prd path may need to be absolute from project root */ }

    // 更新主 specs 状态
    const mainStatePath = path.join(absMain, '.wetspec.yaml');
    let mainState;
    if (fs.existsSync(mainStatePath)) {
      mainState = yaml.load(fs.readFileSync(mainStatePath, 'utf8'));
    } else {
      mainState = { version: '1.0', phase: 'done', mode: 'incremental', prd: {}, affected_specs: [], archived: false };
    }
    if (state?.prd?.current) {
      mainState.prd = mainState.prd || {};
      mainState.prd.previous = mainState.prd.current;
      mainState.prd.current = state.prd.current;
    }
    mainState.last_sync_at = new Date().toISOString();
    mainState.affected_specs = copied.map(a => a.rel);
    mainState.phase = 'done';
    fs.writeFileSync(mainStatePath, yaml.dump(mainState, { lineWidth: 120 }), 'utf8');

    // 标记 change 已归档
    if (state) {
      state.archived = true;
      state.phase = 'archive';
      state.archived_at = new Date().toISOString();
      fs.writeFileSync(path.join(changeDir, '.wetspec.yaml'), yaml.dump(state, { lineWidth: 120 }), 'utf8');
    }
    if (manifest) {
      manifest.archived_at = new Date().toISOString();
      fs.writeFileSync(manifestPath(changeDir), JSON.stringify(manifest, null, 2), 'utf8');
    }
  }

  const deltaCount = listDeltaYamlSpecs(changeDir).length;
  const report = {
    ok: actions.some(a => a.status === 'copied' || a.status === 'would_copy'),
    dryRun,
    change_dir: changeDir,
    main_specs: absMain,
    delta_file_count: deltaCount,
    actions,
  };

  if (asJson) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`\n📦 wetspec archive${dryRun ? '（预览）' : ''}\n`);
    console.log(`   Change: ${path.basename(changeDir)}`);
    console.log(`   Main:   ${absMain}`);
    console.log(`   Delta:  ${deltaCount} 文件\n`);
    for (const a of actions) {
      const icon = a.status === 'copied' || a.status === 'would_copy' ? '✅' : '⏭️';
      console.log(`   ${icon} ${a.rel} — ${a.status}${a.reason ? ` (${a.reason})` : ''}`);
    }
    if (dryRun) console.log('\n   去掉 --dry-run 以实际回写主 specs\n');
    else if (report.ok) console.log('\n🎉 已回写主 specs，change delta 保留为历史记录\n');
  }

  process.exit(report.ok ? 0 : 1);
}

archive(parseArgs(process.argv.slice(2)));
