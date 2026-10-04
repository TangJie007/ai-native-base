#!/usr/bin/env python
# -*- coding: utf-8 -*-
# validate-change-yaml.py
# 用法: python validate-change-yaml.py <path-to-change.yaml>
#
# 校验 change.yaml 的 schema：必填字段、枚举值、路径合法。
# 退出码: 0 通过，1 失败
#
# 依赖: python 3 + PyYAML（跨平台：Windows / macOS / Linux）

import sys
import os
import re

try:
    import yaml
except ImportError:
    print("FAIL: PyYAML not installed. Run: pip install pyyaml", file=sys.stderr)
    sys.exit(1)

if len(sys.argv) < 2:
    print(f"FAIL: missing argument. usage: {sys.argv[0]} <path-to-change.yaml>", file=sys.stderr)
    sys.exit(1)

FILE = sys.argv[1]

if not os.path.isfile(FILE):
    print(f"FAIL: file not found: {FILE}", file=sys.stderr)
    sys.exit(1)

try:
    with open(FILE, encoding='utf-8') as f:
        data = yaml.safe_load(f)
except yaml.YAMLError as e:
    print(f"FAIL: YAML parse error: {e}")
    sys.exit(1)

if not isinstance(data, dict):
    print("FAIL: change.yaml root must be a mapping")
    sys.exit(1)

errors = []

# 必填字段
required = ['name', 'path', 'created', 'status', 'author', 'atoms']
for k in required:
    if k not in data or data[k] is None:
        errors.append(f"missing required field: {k}")

# name: kebab-case
name = data.get('name')
if name and not re.match(r'^[a-z0-9]+(-[a-z0-9]+)*$', name):
    errors.append(f"name must be kebab-case: {name!r}")

# path 枚举
paths = {'spike', 'bounded', 'architectural'}
if data.get('path') not in paths:
    errors.append(f"path must be one of {sorted(paths)}, got {data.get('path')!r}")

# status 枚举
statuses = {'proposed', 'designing', 'implementing', 'review', 'archived', 'abandoned'}
if data.get('status') not in statuses:
    errors.append(f"status must be one of {sorted(statuses)}, got {data.get('status')!r}")

# created: ISO 日期（PyYAML 会把它解析成 datetime，兼容两种）
created = data.get('created')
if not created:
    errors.append("created must be an ISO datetime")
elif isinstance(created, str):
    if not re.match(r'^\d{4}-\d{2}-\d{2}', created):
        errors.append(f"created must be ISO date, got {created!r}")
# else: PyYAML 已解析成 datetime，视为合法

# atoms 结构
atoms = data.get('atoms') or []
if data.get('path') != 'spike' and not atoms:
    errors.append("atoms must not be empty (except for spike path)")

operations = {'ADDED', 'MODIFIED', 'REMOVED'}
for i, a in enumerate(atoms):
    for k in ['domain', 'atom', 'operation', 'delta', 'target']:
        if k not in a:
            errors.append(f"atoms[{i}] missing field: {k}")
    if a.get('operation') not in operations:
        errors.append(f"atoms[{i}].operation must be one of {sorted(operations)}, got {a.get('operation')!r}")

# tasks 门禁（若存在）
tasks = data.get('tasks') or {}
if tasks:
    for k in ['confirmed', 'complete']:
        if k not in tasks:
            errors.append(f"tasks.{k} must exist")

if errors:
    print("FAIL: validation failed:")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)

print(f"OK: {FILE}")
