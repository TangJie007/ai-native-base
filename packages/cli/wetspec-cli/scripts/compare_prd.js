#!/usr/bin/env node
/**
 * PRD 文档差异对比工具 — prd-to-spec Skill 核心脚本
 *
 * 功能：
 * 1. 对比两个 PRD 文档（.md / .txt / .pdf），输出结构化差异报告
 * 2. 识别哪些模块/功能发生了变更（新增/修改/删除）
 * 3. 输出 JSON 格式结果，供 Skill 后续增量更新 Spec 使用
 *
 * 用法：
 *   node compare_prd.js <old_prd> <new_prd> [--format json|text] [--output result.json]
 * 默认优先 Python 引擎（正文级 diff + affected 映射）；--node-only 强制 Node 回退
 */

const fs = require('fs');
const path = require('path');
const { diffLines } = require('diff');
const { scanSpecIndex, sanitizeFileName } = require('./lib/spec_utils');
const { runPy, pyAvailable } = require('./lib/py_runner');

// ── 依赖检查 ──────────────────────────────────────────────────────────────────────
try {
  require.resolve('diff');
} catch {
  console.error(
    '❌ 缺少依赖：diff\n' +
    '   请安装：npm install -g diff\n' +
    '   或在脚本目录运行：npm install diff'
  );
  process.exit(1);
}

// ── 读取文件 ──────────────────────────────────────────────────────────────────────
function readFile(filepath) {
  const p = path.resolve(filepath);
  if (!fs.existsSync(p)) {
    console.error(`❌ 文件不存在: ${filepath}`);
    process.exit(1);
  }

  const ext = path.extname(p).toLowerCase();
  if (ext === '.pdf' || ext === '.docx') {
    if (!pyAvailable()) {
      console.error(
        `⚠️  ${ext} 需要先转换为 Markdown。\n` +
        '   请安装 Python 3 并运行: wetspec py-install\n' +
        '   或: node prd_ingest.js <file> --output prd.md'
      );
      process.exit(1);
    }
    const tmpOut = path.join(path.dirname(p), `${path.basename(p, ext)}.ingested.md`);
    const ingest = runPy('prd_ingest.py', [`"${p}"`, '--output', `"${tmpOut}"`]);
    if (!ingest.ok || !fs.existsSync(tmpOut)) {
      console.error(`❌ 文档摄入失败: ${ingest.error || 'unknown'}`);
      process.exit(1);
    }
    return fs.readFileSync(tmpOut, 'utf8');
  }

  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    console.error(`❌ 无法读取文件: ${filepath}（${e.message}）`);
    process.exit(1);
  }
}

// ── 章节识别 ──────────────────────────────────────────────────────────────────────
const MD_HEADING = /^(#{1,4})\s+(.+)$/;
const NUM_HEADING = /^(\d+(?:\.\d+)*)\s+(.+)$/;
const KW_HEADING = /^(?:【(.+?)】|(?:模块|功能|需求)[：:]\s*(.+))$/;

function extractSections(text) {
  const lines = text.split('\n');
  const sections = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const mdMatch = MD_HEADING.exec(line);
    const numMatch = NUM_HEADING.exec(line);
    const kwMatch = KW_HEADING.exec(line);

    const info = {
      lineNumber: i + 1,
      text: line,
      suggestedModule: '',
      suggestedFeature: '',
    };

    if (mdMatch) {
      const level = mdMatch[1].length;
      const heading = mdMatch[2].trim();
      if (level === 1) info.suggestedModule = heading;
      else if (level === 2) info.suggestedFeature = heading;
      else if (level >= 3) info.suggestedSubfeature = heading;
      info.type = `h${level}`;
      sections.push(info);
    } else if (numMatch) {
      const number = numMatch[1];
      const content = numMatch[2];
      const depth = number.split('.').length;
      info.number = number;
      info.depth = depth;
      if (depth === 1) info.suggestedModule = `${number} ${content}`;
      else if (depth >= 2) info.suggestedFeature = `${number} ${content}`;
      info.type = 'numbered';
      sections.push(info);
    } else if (kwMatch) {
      if (kwMatch[1]) {
        info.suggestedFeature = kwMatch[1];
      } else {
        const key = kwMatch[2] === '模块' ? 'suggestedModule' : 'suggestedFeature';
        info[key] = kwMatch[3] || '';
      }
      info.type = 'keyword';
      sections.push(info);
    }
  }

  return sections;
}

// ── 章节文本序列（用于序列对比）────────────────────────────────────────────────
function sectionTexts(sections) {
  return sections.map(s => s.text);
}

// ── 序列对比（LCS 算法简化版）──────────────────────────────────────────────────
function compareSequences(oldTexts, newTexts, oldSections, newSections) {
  const m = oldTexts.length;
  const n = newTexts.length;

  // 构建 LCS DP 表
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldTexts[i - 1] === newTexts[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // 回溯恢复操作序列
  const ops = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldTexts[i - 1] === newTexts[j - 1]) {
      ops.push({ tag: 'equal', i: i - 1, j: j - 1 });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ tag: 'insert', j: j - 1 });
      j--;
    } else {
      ops.push({ tag: 'delete', i: i - 1 });
      i--;
    }
  }
  ops.reverse();

  // 合并连续同类操作为 opcodes 格式
  const opcodes = [];
  let cur = null;
  for (const op of ops) {
    if (!cur || cur.tag !== op.tag) {
      cur = { tag: op.tag, oldIndices: [], newIndices: [] };
      opcodes.push(cur);
    }
    if (op.tag === 'equal') { cur.oldIndices.push(op.i); cur.newIndices.push(op.j); }
    else if (op.tag === 'delete') cur.oldIndices.push(op.i);
    else if (op.tag === 'insert') cur.newIndices.push(op.j);
  }

  return opcodes;
}

// ── 变更归类 ──────────────────────────────────────────────────────────────────────
function classifyChange(section) {
  const mod = section.suggestedModule || '';
  const feat = section.suggestedFeature || '';
  if (mod) return { type: 'module', name: mod };
  if (feat) return { type: 'feature', name: feat };
  return { type: 'unknown', name: section.text.slice(0, 30) };
}

function actionFor(changeType) {
  return {
    added: '创建新的 Spec 文件',
    modified: '更新现有 Spec 文件并追加 changelog',
    removed: '标记 Spec 文件状态为 deprecated',
  }[changeType] || '检查并手动处理';
}

// ── 主对比逻辑 ────────────────────────────────────────────────────────────────────
function compareSections(oldSections, newSections) {
  const oldTexts = sectionTexts(oldSections);
  const newTexts = sectionTexts(newSections);
  const opcodes = compareSequences(oldTexts, newTexts, oldSections, newSections);

  const result = {
    summary: { added: 0, modified: 0, removed: 0, unchanged: 0 },
    modules: { added: [], removed: [], changed: [] },
    features: { added: [], removed: [], changed: [] },
    details: [],
  };

  const moduleFeatureMap = {};

  for (const op of opcodes) {
    if (op.tag === 'equal') {
      result.summary.unchanged += op.oldIndices.length;
      for (const idx of op.oldIndices) {
        const s = oldSections[idx];
        const mod = s.suggestedModule;
        if (mod) {
          if (!moduleFeatureMap[mod]) moduleFeatureMap[mod] = [];
          if (s.suggestedFeature) moduleFeatureMap[mod].push(s.suggestedFeature);
        }
      }
    } else if (op.tag === 'delete') {
      result.summary.removed += op.oldIndices.length;
      for (const idx of op.oldIndices) {
        const s = oldSections[idx];
        const detail = makeDetail('removed', s, null);
        result.details.push(detail);
        const cls = classifyChange(s);
        result[`${cls.type}s`].removed.push({ name: cls.name, detail });
      }
    } else if (op.tag === 'insert') {
      result.summary.added += op.newIndices.length;
      for (const idx of op.newIndices) {
        const s = newSections[idx];
        const detail = makeDetail('added', null, s);
        result.details.push(detail);
        const cls = classifyChange(s);
        result[`${cls.type}s`].added.push({ name: cls.name, detail });
      }
    }
    // 'replace' ≈ delete + insert （已拆分为 delete/insert）
  }

  // 合并相邻 delete+insert 为 modified（同模块下标题相似）
  result.details = mergeAsModified(result.details);
  result.summary.added = result.details.filter(d => d.changeType === 'added').length;
  result.summary.removed = result.details.filter(d => d.changeType === 'removed').length;
  result.summary.modified = result.details.filter(d => d.changeType === 'modified').length;

  return result;
}

function normalizeFeatureName(name) {
  return (name || '').replace(/功能\s*[\d.]+\s*[：:]\s*/, '').replace(/\s+/g, '').toLowerCase();
}

function isSimilarFeature(a, b) {
  const na = normalizeFeatureName(a);
  const nb = normalizeFeatureName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function mergeAsModified(details) {
  const out = [];
  let i = 0;
  while (i < details.length) {
    const cur = details[i];
    const next = details[i + 1];
    if (
      cur.changeType === 'removed' &&
      next?.changeType === 'added' &&
      isSimilarFeature(cur.text, next.text)
    ) {
      out.push({
        ...cur,
        changeType: 'modified',
        oldText: cur.text,
        newText: next.text,
        lineNumber: next.lineNumber,
        text: next.text,
        actionRequired: actionFor('modified'),
      });
      i += 2;
    } else {
      out.push(cur);
      i += 1;
    }
  }
  return out;
}

function buildSpecLookup(specDir) {
  if (!specDir || !fs.existsSync(specDir)) return null;
  const index = scanSpecIndex(specDir);
  const map = new Map();
  for (const f of index.features) {
    map.set(normalizeFeatureName(f.feature), f.relYaml);
    if (f.id) map.set(f.id.toLowerCase(), f.relYaml);
  }
  return map;
}

function resolveAffectedSpecFile(detail, specLookup) {
  if (!specLookup) return '';
  const feat = detail.suggestedFeature || normalizeFeatureName(detail.text);
  const key = normalizeFeatureName(feat);
  return specLookup.get(key) || '';
}

function attachAffectedSpecs(comparison, specDir) {
  const specLookup = buildSpecLookup(specDir);
  const affected = new Set();
  for (const d of comparison.details) {
    d.affectedSpecFile = resolveAffectedSpecFile(d, specLookup);
    if (d.affectedSpecFile) affected.add(d.affectedSpecFile);
  }
  comparison.affected_specs = [...affected];
  return comparison;
}

function makeDetail(changeType, oldSection, newSection) {
  const s = oldSection || newSection;
  return {
    changeType,
    lineNumber: s ? s.lineNumber : null,
    text: s ? s.text : '',
    suggestedModule: s ? s.suggestedModule : '',
    suggestedFeature: s ? s.suggestedFeature : '',
    affectedSpecFile: '',
    actionRequired: actionFor(changeType),
  };
}

// ── 生成 unified diff 文本 ────────────────────────────────────────────────────────
function generateUnifiedDiff(oldText, newText) {
  const diff = diffLines(oldText, newText);
  const lines = [];
  let oldLine = 1, newLine = 1;

  // 简化：直接拼接 diff 结果
  for (const part of diff) {
    const prefix = part.added ? '+' : part.removed ? '-' : ' ';
    const textLines = part.value.replace(/\n$/, '').split('\n');
    for (const ln of textLines) {
      lines.push(`${prefix}${ln}`);
    }
  }

  return `--- 旧版 PRD\n+++ 新版 PRD\n${lines.join('\n')}`;
}

function tryPythonEngine(args) {
  if (args.includes('--node-only') || !pyAvailable()) return false;

  const pyArgs = [];
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--node-only') continue;
    if (args[i].startsWith('-')) {
      pyArgs.push(args[i]);
      if (['--format', '--output', '-o', '--spec-dir'].includes(args[i]) && args[i + 1]) {
        pyArgs.push(`"${args[++i]}"`);
      }
    } else {
      positional.push(`"${path.resolve(args[i])}"`);
    }
  }
  if (positional.length < 2) return false;
  pyArgs.unshift(...positional);

  const result = runPy('compare_prd.py', pyArgs);
  if (result.ok) {
    if (result.stdout) process.stdout.write(result.stdout);
    return true;
  }
  console.error(`⚠️  Python compare_prd 失败，回退 Node: ${result.error || ''}`);
  return false;
}

// ── CLI 入口 ──────────────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
    console.log(`
用法:
  node compare_prd.js <old_prd> <new_prd> [options]

选项:
  --format <json|text>   输出格式（默认: json）
  --output, -o <file>    输出到文件（默认: stdout）
  --spec-dir <dir>       Spec 目录，自动映射 affectedSpecFile
  --node-only            强制 Node 引擎（默认优先 Python）

示例:
  node compare_prd.js v1/prd.md v2/prd.md
  node compare_prd.js v1/prd.md v2/prd.md --output diff.json --spec-dir ./specs
  node compare_prd.js v1/prd.md v2/prd.md --format text
`);
    process.exit(args.length < 2 ? 1 : 0);
  }

  if (tryPythonEngine(args)) return;

  let oldPrd = args[0];
  let newPrd = args[1];
  let format = 'json';
  let output = null;
  let specDir = null;

  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--node-only') { continue; }
    if (args[i] === '--format' && args[i + 1]) { format = args[++i]; }
    else if (args[i] === '--output' || args[i] === '-o') { output = args[++i]; }
    else if (args[i] === '--spec-dir' && args[i + 1]) { specDir = args[++i]; }
  }

  const oldText = readFile(oldPrd);
  const newText = readFile(newPrd);

  const oldSections = extractSections(oldText);
  const newSections = extractSections(newText);

  let comparison = compareSections(oldSections, newSections);
  comparison = attachAffectedSpecs(comparison, specDir);
  comparison.unified_diff = generateUnifiedDiff(oldText, newText);
  comparison.unifiedDiff = comparison.unified_diff;
  comparison.meta = {
    oldFile: path.resolve(oldPrd),
    newFile: path.resolve(newPrd),
    oldSectionCount: oldSections.length,
    newSectionCount: newSections.length,
  };

  const outputStr = format === 'text'
    ? formatTextOutput(comparison)
    : JSON.stringify(comparison, null, 2);

  if (output) {
    fs.writeFileSync(output, outputStr, 'utf8');
    console.log(`✅ 差异报告已保存到: ${output}`);
  } else {
    console.log(outputStr);
  }
}

function formatTextOutput(comp) {
  const lines = [];
  lines.push('===== PRD 差异报告 =====');
  lines.push(`旧版: ${comp.meta.oldFile}`);
  lines.push(`新版: ${comp.meta.newFile}`);
  lines.push('');
  lines.push('--- 摘要 ---');
  lines.push(`新增: ${comp.summary.added}`);
  lines.push(`修改: ${comp.summary.modified}`);
  lines.push(`删除: ${comp.summary.removed}`);
  lines.push(`未变: ${comp.summary.unchanged}`);
  lines.push('');
  lines.push('--- 变更详情 ---');
  for (const d of comp.details) {
    lines.push(`[${d.changeType.toUpperCase()}] L${d.lineNumber || '?'} ${d.text}`);
    if (d.suggestedModule) lines.push(`  模块: ${d.suggestedModule}`);
    if (d.suggestedFeature) lines.push(`  功能: ${d.suggestedFeature}`);
    if (d.affectedSpecFile) lines.push(`  Spec: ${d.affectedSpecFile}`);
    lines.push(`  建议: ${d.actionRequired}`);
    lines.push('');
  }
  return lines.join('\n');
}

main();
