/**
 * 简易 glob 展开（支持 ** 与 *）
 */
const fs = require('fs');
const path = require('path');

function globToRegex(glob) {
  const normalized = glob.replace(/\\/g, '/');
  let re = '^';
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '*') {
      if (normalized[i + 1] === '*') {
        re += '.*';
        i += 1;
        if (normalized[i + 1] === '/') i += 1;
      } else {
        re += '[^/]*';
      }
    } else if (ch === '?') {
      re += '[^/]';
    } else {
      re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  re += '$';
  return new RegExp(re, 'i');
}

function expandTestGlob(projectRoot, pattern) {
  const base = projectRoot;
  const normalized = pattern.replace(/\\/g, '/');
  const starIdx = normalized.indexOf('*');
  const rootPart = starIdx >= 0 ? normalized.slice(0, starIdx).replace(/\/$/, '') : normalized;
  const walkRoot = path.resolve(base, rootPart || '.');
  const regex = globToRegex(normalized);
  const results = [];

  if (!fs.existsSync(walkRoot)) return results;

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(base, full).replace(/\\/g, '/');
      if (entry.isDirectory()) walk(full);
      else if (regex.test(rel)) results.push(full);
    }
  }

  walk(walkRoot);
  return results.sort();
}

function findSpecDir(specYaml) {
  let dir = path.dirname(specYaml);
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.wetspec.yaml'))) return dir;
    dir = path.dirname(dir);
  }
  return path.dirname(specYaml);
}

module.exports = { expandTestGlob, findSpecDir };
