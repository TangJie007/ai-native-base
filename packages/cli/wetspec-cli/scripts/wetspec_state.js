#!/usr/bin/env node
/**
 * wetspec_state.js — 状态管理（借鉴 Comet .comet.yaml 脚本化状态机）
 * 用法:
 *   node wetspec_state.js init <spec_dir> [--prd <file>]
 *   node wetspec_state.js get <spec_dir> [--field <name>]
 *   node wetspec_state.js set <spec_dir> --field <name> --value <value>
 *   node wetspec_state.js check <spec_dir> [--transition <name>]
 *   node wetspec_state.js validate <spec_dir>
 */

const fs = require('fs');
const path = require('path');
const { yaml } = require('./lib/spec_utils');

const STATE_FILE = '.wetspec.yaml';
const VALID_PHASES = ['idle', 'parse', 'awaiting-unit-test', 'update', 'sync', 'specs-ready', 'design', 'build', 'verify', 'archive', 'done'];
const VALID_MODES = ['incremental', 'full'];

const DEFAULT_STATE = {
  version: '1.0',
  workflow: 'full',
  phase: 'idle',
  mode: 'incremental',
  prd: { current: null, previous: null },
  last_diff: null,
  last_sync_at: null,
  affected_specs: [],
  archived: false,
  auto_transition: true,
  changes_root: 'wetspec/changes',
  active_change: null,
  openspec_change: null, // 已废弃，与 active_change 同步，仅兼容旧状态文件
  design_doc: null,
  build_target: null,
  verify_result: 'pending',
  verification_report: null,
  unit_test: null,
};

function statePath(specDir) {
  return path.join(path.resolve(specDir), STATE_FILE);
}

function loadState(specDir) {
  const p = statePath(specDir);
  if (!fs.existsSync(p)) return null;
  return yaml.load(fs.readFileSync(p, 'utf8'));
}

function saveState(specDir, state) {
  const p = statePath(specDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, yaml.dump(state, { lineWidth: 120, noRefs: true }), 'utf8');
}

function validateState(state) {
  const errors = [];
  if (!state.version) errors.push('缺少 version');
  if (state.phase && !VALID_PHASES.includes(state.phase)) errors.push(`phase 无效: ${state.phase}`);
  if (state.mode && !VALID_MODES.includes(state.mode)) errors.push(`mode 无效: ${state.mode}`);
  return errors;
}

const TRANSITIONS = {
  'start-parse': { from: ['idle', 'done'], to: 'parse', requires: [] },
  'await-unit-test': { from: ['parse'], to: 'awaiting-unit-test', requires: [] },
  'unit-test-ready': { from: ['awaiting-unit-test'], to: 'parse', requires: [] },
  'parse-complete': { from: ['parse'], to: 'specs-ready', requires: [] },
  'start-update': { from: ['idle', 'done'], to: 'update', requires: ['prd.current'] },
  'update-complete': { from: ['update'], to: 'specs-ready', requires: ['last_diff'] },
  'start-sync': { from: ['idle', 'update', 'done'], to: 'sync', requires: ['prd.current'] },
  'sync-complete': { from: ['sync'], to: 'specs-ready', requires: [] },
  'start-design': { from: ['specs-ready', 'done'], to: 'design', requires: [] },
  'skip-design': { from: ['specs-ready'], to: 'done', requires: [] },
  'design-complete': { from: ['design'], to: 'done', requires: ['design_doc'] },
  'start-build': { from: ['done', 'verify'], to: 'build', requires: [] },
  'build-complete': { from: ['build'], to: 'verify', requires: ['build_target'] },
  'verify-pass': { from: ['verify'], to: 'done', requires: ['verify_result'] },
  'verify-fail': { from: ['verify'], to: 'build', requires: [] },
  'archive': { from: ['done'], to: 'archive', requires: [] },
  'archive-complete': { from: ['archive'], to: 'done', requires: [] },
};

function getNested(obj, keyPath) {
  return keyPath.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
}

function setNested(obj, keyPath, value) {
  const keys = keyPath.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!cur[keys[i]]) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

function cmdInit(specDir, prdPath) {
  const state = { ...DEFAULT_STATE, phase: 'idle' };
  if (prdPath) state.prd.current = path.basename(path.resolve(prdPath));
  saveState(specDir, state);
  console.log(`✅ 已初始化 ${STATE_FILE}`);
  if (prdPath) console.log(`   prd.current = ${state.prd.current}`);
}

function cmdGet(specDir, field) {
  const state = loadState(specDir);
  if (!state) {
    console.error('❌ 状态文件不存在，请先 init');
    process.exit(1);
  }
  if (field) {
    const val = getNested(state, field);
    console.log(val === undefined ? '' : (typeof val === 'object' ? JSON.stringify(val, null, 2) : val));
  } else {
    console.log(yaml.dump(state, { lineWidth: 120 }));
  }
}

function cmdSet(specDir, field, value) {
  let state = loadState(specDir);
  if (!state) {
    cmdInit(specDir);
    state = loadState(specDir);
  }
  let parsed = value;
  if (value === 'true') parsed = true;
  else if (value === 'false') parsed = false;
  else if (value === 'null') parsed = null;
  else if (value.startsWith('[') || value.startsWith('{')) {
    try { parsed = JSON.parse(value); } catch { /* keep string */ }
  }
  setNested(state, field, parsed);
  if (field === 'active_change') {
    state.openspec_change = parsed;
  } else if (field === 'openspec_change') {
    state.active_change = parsed;
  }
  saveState(specDir, state);
  console.log(`✅ 已设置 ${field} = ${JSON.stringify(parsed)}`);
}

function cmdCheck(specDir, transition) {
  const state = loadState(specDir);
  if (!state) {
    console.error('❌ 状态文件不存在');
    process.exit(1);
  }

  const errors = validateState(state);
  if (errors.length) {
    console.error('[HARD STOP] 状态 Schema 无效:');
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }

  if (!transition) {
    console.log(`✅ 状态有效 | phase=${state.phase} mode=${state.mode}`);
    process.exit(0);
  }

  const rule = TRANSITIONS[transition];
  if (!rule) {
    console.error(`❌ 未知 transition: ${transition}`);
    process.exit(1);
  }

  if (!rule.from.includes(state.phase)) {
    console.error(`[HARD STOP] 无法执行 ${transition}：当前 phase=${state.phase}，需要 ${rule.from.join('|')}`);
    process.exit(1);
  }

  for (const req of rule.requires) {
    if (getNested(state, req) === null || getNested(state, req) === undefined || getNested(state, req) === '') {
      console.error(`[HARD STOP] 缺少前置条件: ${req}`);
      process.exit(1);
    }
  }

  console.log(`✅ 允许 transition: ${transition} (${state.phase} → ${rule.to})`);
}

function cmdValidate(specDir) {
  const state = loadState(specDir);
  if (!state) {
    console.error('❌ 状态文件不存在');
    process.exit(1);
  }
  const errors = validateState(state);
  if (errors.length) {
    errors.forEach(e => console.error(`❌ ${e}`));
    process.exit(1);
  }
  console.log('✅ .wetspec.yaml 校验通过');
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2 || args.includes('--help')) {
    console.log(`
用法:
  node wetspec_state.js init <spec_dir> [--prd <file>]
  node wetspec_state.js get <spec_dir> [--field <name>]
  node wetspec_state.js set <spec_dir> --field <name> --value <value>
  node wetspec_state.js check <spec_dir> [--transition <name>]
  node wetspec_state.js validate <spec_dir>
`);
    process.exit(args.includes('--help') ? 0 : 1);
  }

  const cmd = args[0];
  const specDir = args[1];

  if (cmd === 'init') {
    const prdIdx = args.indexOf('--prd');
    cmdInit(specDir, prdIdx >= 0 ? args[prdIdx + 1] : null);
  } else if (cmd === 'get') {
    const fIdx = args.indexOf('--field');
    cmdGet(specDir, fIdx >= 0 ? args[fIdx + 1] : null);
  } else if (cmd === 'set') {
    const fIdx = args.indexOf('--field');
    const vIdx = args.indexOf('--value');
    if (fIdx < 0 || vIdx < 0) {
      console.error('set 需要 --field 和 --value');
      process.exit(1);
    }
    cmdSet(specDir, args[fIdx + 1], args[vIdx + 1]);
  } else if (cmd === 'check') {
    const tIdx = args.indexOf('--transition');
    cmdCheck(specDir, tIdx >= 0 ? args[tIdx + 1] : null);
  } else if (cmd === 'validate') {
    cmdValidate(specDir);
  } else {
    console.error(`未知命令: ${cmd}`);
    process.exit(1);
  }
}

main();
