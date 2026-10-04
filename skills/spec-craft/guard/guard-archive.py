#!/usr/bin/env python
# -*- coding: utf-8 -*-
# guard-archive.py
# 用法: python guard-archive.py <path-to-change-dir>
#
# 归档前门禁：检查 tasks 已完成、delta 存在、路径合法。
# 退出码: 0 通过，1 失败
#
# 依赖: python 3 + PyYAML（跨平台：Windows / macOS / Linux）

import sys
import os
import re
import glob

try:
    import yaml
except ImportError:
    print("FAIL: PyYAML not installed. Run: pip install pyyaml", file=sys.stderr)
    sys.exit(1)

if len(sys.argv) < 2:
    print(f"FAIL: missing argument. usage: {sys.argv[0]} <path-to-change-dir>", file=sys.stderr)
    sys.exit(1)

CH_DIR = sys.argv[1]
change_yaml = os.path.join(CH_DIR, 'change.yaml')

if not os.path.isdir(CH_DIR):
    print(f"FAIL: directory not found: {CH_DIR}", file=sys.stderr)
    sys.exit(1)

if not os.path.exists(change_yaml):
    print(f"FAIL: {change_yaml} not found")
    sys.exit(1)

with open(change_yaml, encoding='utf-8') as f:
    data = yaml.safe_load(f)

errors = []
warnings = []

# 1. tasks.confirmed 必须为 true
tasks_meta = data.get('tasks') or {}
if not tasks_meta.get('confirmed'):
    errors.append("change.yaml.tasks.confirmed is not true; user has not confirmed tasks")

# 2. tasks.complete 必须为 true
if not tasks_meta.get('complete'):
    errors.append("change.yaml.tasks.complete is not true; not all tasks are done")

# 3. 所有 tasks 文件的 checkbox 必须勾选完
tasks_files = glob.glob(os.path.join(CH_DIR, 'tasks', '**', '*.md'), recursive=True)
if not tasks_files:
    errors.append("no tasks/*.md files found")
else:
    for tf in tasks_files:
        with open(tf, encoding='utf-8') as f:
            content = f.read()
        unchecked = re.findall(r'^\s*-\s*\[ \]', content, re.MULTILINE)
        if unchecked:
            errors.append(f"{tf}: {len(unchecked)} unchecked checkbox(es) remain")

# 4. delta 文件必须存在且非空
atoms = data.get('atoms') or []
for i, a in enumerate(atoms):
    delta_rel = a.get('delta')
    if not delta_rel:
        errors.append(f"atoms[{i}].delta is empty")
        continue
    delta_abs = os.path.join(CH_DIR, delta_rel)
    if not os.path.exists(delta_abs):
        errors.append(f"delta file not found: {delta_rel}")
    else:
        size = os.path.getsize(delta_abs)
        if size < 50:
            warnings.append(f"delta file very small: {delta_rel} ({size} bytes)")

# 5. open_questions 是否清空
open_q = data.get('open_questions') or []
unanswered = [q for q in open_q if isinstance(q, dict) and not q.get('answered', False)]
if unanswered:
    warnings.append(f"{len(unanswered)} unanswered open_questions remain")

# 6. 状态检查（不重复归档）
if data.get('status') in ('archived', 'abandoned'):
    errors.append(f"change is already {data.get('status')}; cannot archive again")

# 7. spike 不应走完整 archive
if data.get('path') == 'spike' and atoms:
    warnings.append("spike path usually has no atoms; are you sure?")

if errors:
    print("FAIL: archive blocked:")
    for e in errors:
        print(f"  - [ERROR] {e}")
    if warnings:
        print()
        print("Warnings:")
        for w in warnings:
            print(f"  - [WARN] {w}")
    sys.exit(1)

if warnings:
    print("OK with warnings:")
    for w in warnings:
        print(f"  - [WARN] {w}")
    print("Fixing warnings is recommended but not blocking.")
    sys.exit(0)

print(f"OK: all archive checks passed for {CH_DIR}")
