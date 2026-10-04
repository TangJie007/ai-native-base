#!/usr/bin/env python
# -*- coding: utf-8 -*-
# check-delta-mirror.py
# 用法: python check-delta-mirror.py <path-to-change-dir>
#
# 校验 change 目录下 delta/ 与 tasks/ 的路径是否镜像（对应 atoms[] 声明）。
# 退出码: 0 通过，1 失败
#
# 依赖: python 3 + PyYAML（跨平台：Windows / macOS / Linux）

import sys
import os

try:
    import yaml
except ImportError:
    print("FAIL: PyYAML not installed. Run: pip install pyyaml", file=sys.stderr)
    sys.exit(1)

if len(sys.argv) < 2:
    print(f"FAIL: missing argument. usage: {sys.argv[0]} <path-to-change-dir>", file=sys.stderr)
    sys.exit(1)

CH_DIR = sys.argv[1]

if not os.path.isdir(CH_DIR):
    print(f"FAIL: directory not found: {CH_DIR}", file=sys.stderr)
    sys.exit(1)

change_yaml = os.path.join(CH_DIR, 'change.yaml')
if not os.path.exists(change_yaml):
    print(f"FAIL: {change_yaml} not found")
    sys.exit(1)

with open(change_yaml, encoding='utf-8') as f:
    data = yaml.safe_load(f)

errors = []

atoms = data.get('atoms') or []
if not atoms:
    print(f"OK: no atoms declared in {change_yaml}")
    sys.exit(0)

for i, a in enumerate(atoms):
    delta_rel = a.get('delta')
    tasks_rel = a.get('tasks')
    target_rel = a.get('target')
    op = a.get('operation')

    # 路径合法性：不允许绝对路径或 .. 逃逸
    for field, rel in [('delta', delta_rel), ('tasks', tasks_rel), ('target', target_rel)]:
        if not rel:
            errors.append(f"atoms[{i}].{field} is empty")
            continue
        if os.path.isabs(rel):
            errors.append(f"atoms[{i}].{field} path must be relative: {rel}")
        if '..' in rel.replace('\\', '/').split('/'):
            errors.append(f"atoms[{i}].{field} must not contain '..': {rel}")

    # target 应指向 specs/atom/...
    if target_rel and not target_rel.replace('\\', '/').startswith('specs/atom/'):
        errors.append(f"atoms[{i}].target should start with 'specs/atom/': {target_rel}")

    # MODIFIED/REMOVED 时 target 应已存在（真相源）
    if op in ('MODIFIED', 'REMOVED') and target_rel:
        # 从 chdir 向上回溯：通常 chdir 是 specs/changes/<name>/，仓库根在其 3 层之上
        repo_root_guess = os.path.abspath(os.path.join(CH_DIR, '..', '..', '..'))
        target_abs = os.path.join(repo_root_guess, target_rel)
        if not os.path.exists(target_abs):
            errors.append(
                f"atoms[{i}].operation={op} but target file not found: "
                f"{target_rel} (checked under {repo_root_guess})"
            )

if errors:
    print("FAIL: delta mirror check failed:")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)

print(f"OK: delta/tasks mirror paths look valid for {CH_DIR}")
