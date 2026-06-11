/**
 * Change 隔离路径约定（delta → main archive）
 */
const path = require('path');
const fs = require('fs');
const { findYamlSpecs } = require('./spec_utils');

const DELTA_DIR_NAME = 'wetspec-delta';
const MANIFEST_FILE = 'MANIFEST.json';
const STATE_FILE = '.wetspec.yaml';

function normalizeRel(p) {
  return p.replace(/\\/g, '/');
}

function resolveChangeDir(changeDir) {
  return path.resolve(changeDir);
}

function deltaDir(changeDir) {
  return path.join(resolveChangeDir(changeDir), DELTA_DIR_NAME);
}

function manifestPath(changeDir) {
  return path.join(deltaDir(changeDir), MANIFEST_FILE);
}

function statePath(changeDir) {
  return path.join(resolveChangeDir(changeDir), STATE_FILE);
}

function listDeltaYamlSpecs(changeDir) {
  const dir = deltaDir(changeDir);
  if (!fs.existsSync(dir)) return [];
  return findYamlSpecs(dir).map(abs => ({
    abs,
    rel: normalizeRel(path.relative(dir, abs)),
  }));
}

function deltaFilePath(changeDir, relSpecPath) {
  return path.join(deltaDir(changeDir), relSpecPath);
}

function mainSpecPath(mainSpecsDir, relSpecPath) {
  return path.join(path.resolve(mainSpecsDir), relSpecPath);
}

module.exports = {
  DELTA_DIR_NAME,
  MANIFEST_FILE,
  STATE_FILE,
  normalizeRel,
  resolveChangeDir,
  deltaDir,
  manifestPath,
  statePath,
  listDeltaYamlSpecs,
  deltaFilePath,
  mainSpecPath,
};
