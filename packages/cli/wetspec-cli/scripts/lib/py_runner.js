/**
 * py_runner.js — 统一调用 wetspec Python 插件
 */
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PY_DIR = path.join(__dirname, '..', 'py');

function findPython() {
  const candidates = process.platform === 'win32'
    ? ['py -3', 'python', 'python3']
    : ['python3', 'python'];
  for (const cmd of candidates) {
    try {
      execSync(`${cmd} --version`, { encoding: 'utf8', stdio: 'pipe' });
      return cmd;
    } catch { /* next */ }
  }
  return null;
}

function pyAvailable() {
  return findPython() !== null;
}

function scriptPath(name) {
  const p = path.join(PY_DIR, name);
  if (!fs.existsSync(p)) throw new Error(`Python 脚本不存在: ${p}`);
  return p;
}

/**
 * @param {string} script 如 compare_prd.py
 * @param {string[]} args 参数列表（已转义由调用方负责）
 * @param {{ json?: boolean, cwd?: string }} [opts]
 */
function runPy(script, args = [], opts = {}) {
  const python = findPython();
  if (!python) {
    return { ok: false, error: 'Python 未安装或不在 PATH 中', python: null };
  }

  const scriptAbs = scriptPath(script);
  const cmd = `${python} "${scriptAbs}" ${args.join(' ')}`;
  try {
    const stdout = execSync(cmd, {
      encoding: 'utf8',
      cwd: opts.cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    });
    if (opts.json) {
      try {
        return { ok: true, data: JSON.parse(stdout), stdout, python };
      } catch {
        return { ok: false, error: 'Python 输出非合法 JSON', stdout, python };
      }
    }
    return { ok: true, stdout, python };
  } catch (e) {
    const stderr = e.stderr?.toString() || '';
    const stdout = e.stdout?.toString() || '';
    return {
      ok: false,
      error: stderr.trim() || e.message,
      stdout,
      stderr,
      python,
      exitCode: e.status,
    };
  }
}

function requirementsPath() {
  return path.join(PY_DIR, 'requirements.txt');
}

function checkPyDeps() {
  const python = findPython();
  if (!python) {
    return {
      ok: false,
      python: null,
      core: { ok: false, missing: ['python'] },
      optional: { ok: false, missing: [] },
    };
  }

  const coreModules = [
    { pip: 'PyYAML', import: 'yaml' },
    { pip: 'rapidfuzz', import: 'rapidfuzz' },
  ];
  const optionalModules = [
    { pip: 'pymupdf', import: 'fitz' },
    { pip: 'python-docx', import: 'docx' },
  ];

  function probe(modules) {
    const missing = [];
    for (const mod of modules) {
      try {
        execSync(`${python} -c "import ${mod.import}"`, { encoding: 'utf8', stdio: 'pipe' });
      } catch {
        missing.push(mod.pip);
      }
    }
    return { ok: missing.length === 0, missing };
  }

  const core = probe(coreModules);
  const optional = probe(optionalModules);
  return {
    ok: core.ok,
    python,
    core,
    optional,
    requirements: requirementsPath(),
  };
}

function ensurePyDeps(opts = {}) {
  const { quiet = false, user = false } = opts;
  const python = findPython();
  if (!python) {
    return { ok: false, error: 'Python 未安装或不在 PATH 中（需要 Python 3）', python: null };
  }

  const req = requirementsPath();
  if (!fs.existsSync(req)) {
    return { ok: true, skipped: true, python, requirements: req };
  }

  const pipFlags = [
    quiet ? '-q' : '',
    user ? '--user' : '',
  ].filter(Boolean).join(' ');

  try {
    execSync(`${python} -m pip install ${pipFlags} -r "${req}"`.replace(/\s+/g, ' ').trim(), {
      encoding: 'utf8',
      stdio: quiet ? 'pipe' : 'inherit',
    });
    const check = checkPyDeps();
    if (!check.core.ok) {
      return {
        ok: false,
        error: `安装后仍缺少核心依赖: ${check.core.missing.join(', ')}`,
        python,
        check,
      };
    }
    return { ok: true, python, check, requirements: req };
  } catch (e) {
    return {
      ok: false,
      error: (e.stderr?.toString() || e.message || 'pip install 失败').trim(),
      python,
    };
  }
}

module.exports = {
  findPython,
  pyAvailable,
  runPy,
  ensurePyDeps,
  checkPyDeps,
  requirementsPath,
  PY_DIR,
};
