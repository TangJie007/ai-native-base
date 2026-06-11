#!/usr/bin/env node
/**
 * prd_ingest.js — P0 Node 路由：PRD 文档摄入（委托 Python）
 * 用法: node prd_ingest.js <input> [--output <md>] [--json]
 */
const fs = require('fs');
const path = require('path');
const { runPy, pyAvailable } = require('./lib/py_runner');

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1 || args.includes('--help')) {
    console.log(`
用法: node prd_ingest.js <input_file> [--output <md_path>] [--json]

支持: .pdf .docx .md .txt（PDF/Word 需 Python + requirements.txt）
`);
    process.exit(args.includes('--help') ? 0 : 1);
  }

  const input = path.resolve(args[0]);
  const outIdx = args.indexOf('--output');
  const output = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : null;
  const asJson = args.includes('--json');
  const ext = path.extname(input).toLowerCase();

  if (!fs.existsSync(input)) {
    console.error(`❌ 文件不存在: ${input}`);
    process.exit(1);
  }

  if (ext === '.md' || ext === '.txt' || ext === '.markdown') {
    const text = fs.readFileSync(input, 'utf8');
    if (output) fs.writeFileSync(output, text, 'utf8');
    if (asJson) {
      console.log(JSON.stringify({ ok: true, source: input, output, engine: 'node', format: ext }));
    } else if (output) {
      console.log(`✅ 已复制到: ${output}`);
    } else {
      process.stdout.write(text);
    }
    process.exit(0);
  }

  if (!pyAvailable()) {
    console.error('❌ PDF/Word 摄入需要 Python。请安装 Python 3 并运行: wetspec py-install');
    process.exit(1);
  }

  const pyArgs = [`"${input}"`];
  if (output) pyArgs.push('--output', `"${output}"`);
  if (asJson) pyArgs.push('--json');

  const result = runPy('prd_ingest.py', pyArgs, { json: asJson });
  if (!result.ok) {
    console.error(`❌ prd_ingest 失败: ${result.error}`);
    process.exit(1);
  }
  if (asJson) console.log(JSON.stringify(result.data, null, 2));
  else if (!output && result.stdout) process.stdout.write(result.stdout);
}

main();
