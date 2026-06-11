/**
 * wetspec 共享工具库
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const VALID_STATUSES = ['draft', 'review', 'approved', 'implemented', 'deprecated'];
const VALID_PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
const LEGACY_PRIORITIES = ['high', 'medium', 'low'];
const SEMVER = /^\d+\.\d+\.\d+/;

function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim();
}

function findYamlSpecs(specDir) {
  const results = [];
  if (!fs.existsSync(specDir)) return results;

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile() && entry.name.endsWith('_spec.yaml')) results.push(fullPath);
    }
  }
  walk(specDir);
  return results;
}

function loadYamlFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return yaml.load(content);
}

function getSpecFormat(data) {
  if (!data || typeof data !== 'object') return 'invalid';
  if (data.metadata && data.description) return 'standard';
  if (data.spec) return 'legacy';
  return 'unknown';
}

function getFeatureName(data) {
  if (getSpecFormat(data) === 'standard') return data.metadata.feature;
  if (data.spec) return data.spec.name;
  return null;
}

function getModuleName(data) {
  if (getSpecFormat(data) === 'standard') return data.metadata.module;
  if (data.spec) return data.spec.module;
  return null;
}

function getFeatureId(data) {
  if (getSpecFormat(data) === 'standard') return data.metadata.id;
  if (data.spec) return data.spec.id;
  return null;
}

function inferSpecMdPath(yamlPath) {
  return yamlPath.replace(/_spec\.yaml$/, '_spec.md');
}

function inferSpecYamlPath(featureName, moduleDir) {
  return path.join(moduleDir, `${sanitizeFileName(featureName)}_spec.yaml`);
}

function scanSpecIndex(specDir) {
  const index = { modules: {}, features: [] };

  for (const yamlPath of findYamlSpecs(specDir)) {
    let data;
    try {
      data = loadYamlFile(yamlPath);
    } catch {
      continue;
    }
    const module = getModuleName(data);
    const feature = getFeatureName(data);
    const id = getFeatureId(data);
    if (!module || !feature) continue;

    if (!index.modules[module]) index.modules[module] = [];
    const relYaml = path.relative(specDir, yamlPath);
    const relMd = path.relative(specDir, inferSpecMdPath(yamlPath));
    const entry = { id, module, feature, yamlPath, mdPath: inferSpecMdPath(yamlPath), relYaml, relMd, data };
    index.modules[module].push(entry);
    index.features.push(entry);
  }
  return index;
}

function priorityLabel(data) {
  if (getSpecFormat(data) === 'standard') return data.metadata.priority;
  if (data.spec?.priority === 'high') return 'P0';
  if (data.spec?.priority === 'medium') return 'P1';
  if (data.spec?.priority === 'low') return 'P2';
  return 'P2';
}

function statusLabel(data) {
  if (getSpecFormat(data) === 'standard') return data.metadata.status;
  return data.spec?.status || 'draft';
}

module.exports = {
  yaml,
  VALID_STATUSES,
  VALID_PRIORITIES,
  LEGACY_PRIORITIES,
  SEMVER,
  sanitizeFileName,
  findYamlSpecs,
  loadYamlFile,
  getSpecFormat,
  getFeatureName,
  getModuleName,
  getFeatureId,
  inferSpecMdPath,
  inferSpecYamlPath,
  scanSpecIndex,
  priorityLabel,
  statusLabel,
};
