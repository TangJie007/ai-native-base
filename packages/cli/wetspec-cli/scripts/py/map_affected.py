#!/usr/bin/env python3
"""
P1: 根据 PRD diff 正文映射 affected_specs（弥补仅比标题的不足）
用法:
  python map_affected.py --diff diff.json --spec-dir specs/ [--json]
  python map_affected.py --old old.md --new new.md --spec-dir specs/ [--json]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# 允许从 scripts/py 运行
sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.spec_index import (  # noqa: E402
    normalize_name,
    resolve_spec_path,
    scan_spec_index,
)

FEATURE_HEADING = re.compile(
    r"^(?:#{1,6}\s+)?(?:功能\s*[\d.]+\s*[：:]\s*)?(.+)$",
    re.I,
)
FEATURE_NUM = re.compile(r"^\d+(?:\.\d+){2,}\s+(.+)$")


def _append_to_body(block: dict | None, line: str) -> None:
    if block is not None:
        block["body"].append(line)


def extract_feature_blocks(text: str) -> list[dict]:
    """按功能标题切分 PRD 块（含正文）。"""
    lines = text.split("\n")
    blocks: list[dict] = []
    current: dict | None = None

    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            _append_to_body(current, "")
            continue

        is_feature = False
        name = ""
        if "功能" in stripped and re.search(r"功能\s*[\d.]", stripped):
            m = FEATURE_HEADING.match(stripped.lstrip("#").strip())
            if m:
                name = m.group(1).strip()
                is_feature = True
        elif stripped.startswith("####") and "功能" in stripped:
            name = stripped.lstrip("#").strip()
            is_feature = True
        else:
            m = FEATURE_NUM.match(stripped.lstrip("#").strip())
            if m and "." in stripped.split()[0]:
                name = m.group(1).strip()
                is_feature = True

        if is_feature and name:
            if current:
                blocks.append(current)
            current = {
                "name": name,
                "line": i + 1,
                "heading": stripped,
                "body": [],
            }
        else:
            _append_to_body(current, line)

    if current is not None:
        blocks.append(current)
    return blocks


def body_hash(block: dict) -> str:
    return normalize_name("\n".join(block.get("body", [])))


def find_modified_features(old_text: str, new_text: str) -> list[dict]:
    old_blocks = {
        normalize_name(b["name"]): b
        for b in extract_feature_blocks(old_text)
    }
    new_blocks = {
        normalize_name(b["name"]): b
        for b in extract_feature_blocks(new_text)
    }
    modified = []

    for key, nb in new_blocks.items():
        ob = old_blocks.get(key)
        if ob is None:
            modified.append({**nb, "change_type": "added"})
        elif body_hash(ob) != body_hash(nb):
            modified.append({**nb, "change_type": "modified"})

    for key, ob in old_blocks.items():
        if key not in new_blocks:
            modified.append({**ob, "change_type": "removed"})

    return modified


def map_from_texts(old_text: str, new_text: str, spec_dir: str) -> dict:
    index = scan_spec_index(spec_dir)
    modified = find_modified_features(old_text, new_text)
    affected: list[str] = []
    details = []

    for block in modified:
        rel = resolve_spec_path(block["name"], index)
        if not rel and "：" in block["name"]:
            rel = resolve_spec_path(block["name"].split("：")[-1], index)
        if not rel:
            rel = resolve_spec_path(block.get("heading", ""), index)

        item = {
            "changeType": block.get("change_type", "modified"),
            "text": block.get("heading", block["name"]),
            "suggestedFeature": block["name"],
            "affectedSpecFile": rel,
            "lineNumber": block.get("line"),
            "actionRequired": (
                "更新现有 Spec 并追加 changelog"
                if rel else "需 AI 语义映射 Spec"
            ),
        }
        details.append(item)
        if rel:
            affected.append(rel)

    return {
        "affected_specs": sorted(set(affected)),
        "details": details,
        "mapped_count": len(affected),
        "block_count": len(modified),
    }


def enrich_diff(
    diff: dict,
    spec_dir: str,
    old_text: str | None,
    new_text: str | None,
) -> dict:
    mapping = {}
    if old_text and new_text:
        mapping = map_from_texts(old_text, new_text, spec_dir)
    elif diff.get("unified_diff") or diff.get("unifiedDiff"):
        # 从 unified diff 中提取含「功能」的上下文行作 hint
        udiff = diff.get("unified_diff") or diff.get("unifiedDiff") or ""
        hints = set()
        for line in udiff.split("\n"):
            if line.startswith(("+", "-")) and "功能" in line:
                hints.add(line[1:].strip())
        index = scan_spec_index(spec_dir)
        affected = set(diff.get("affected_specs") or [])
        for h in hints:
            rel = resolve_spec_path(h, index)
            if rel:
                affected.add(rel)
        mapping = {
            "affected_specs": sorted(affected),
            "details": [],
            "mapped_count": len(affected),
        }

    existing = set(diff.get("affected_specs") or [])
    merged = sorted(existing | set(mapping.get("affected_specs", [])))
    diff["affected_specs"] = merged
    diff["body_mapping"] = mapping

    for d in diff.get("details") or []:
        if not d.get("affectedSpecFile"):
            hint = d.get("suggestedFeature") or d.get("text", "")
            rel = resolve_spec_path(hint, scan_spec_index(spec_dir))
            if rel:
                d["affectedSpecFile"] = rel

    # 补充 body 级 details
    for bd in mapping.get("details") or []:
        if bd.get("affectedSpecFile") and bd["affectedSpecFile"] not in [
            x.get("affectedSpecFile") for x in diff.get("details") or []
        ]:
            diff.setdefault("details", []).append(bd)

    return diff


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--diff", help="diff.json 路径")
    parser.add_argument("--old", help="旧版 PRD")
    parser.add_argument("--new", help="新版 PRD")
    parser.add_argument("--spec-dir", required=True, help="主 specs 目录")
    parser.add_argument("--output", "-o", help="写回 diff.json")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    spec_dir = str(Path(args.spec_dir).resolve())
    old_text = new_text = None

    if args.old and args.new:
        old_text = Path(args.old).read_text(encoding="utf-8")
        new_text = Path(args.new).read_text(encoding="utf-8")

    if args.diff:
        diff_path = Path(args.diff).resolve()
        diff = json.loads(diff_path.read_text(encoding="utf-8"))
        meta = diff.get("meta") or {}
        if not old_text and meta.get("oldFile"):
            p = Path(meta["oldFile"])
            if p.exists():
                old_text = p.read_text(encoding="utf-8")
        if not new_text and meta.get("newFile"):
            p = Path(meta["newFile"])
            if p.exists():
                new_text = p.read_text(encoding="utf-8")
        result = enrich_diff(diff, spec_dir, old_text, new_text)
        if args.output:
            Path(args.output).write_text(
                json.dumps(result, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        if args.json:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            specs = result["affected_specs"]
            print(f"✅ affected_specs: {specs}", file=sys.stderr)
        sys.exit(0)

    if old_text and new_text:
        result = map_from_texts(old_text, new_text, spec_dir)
        if args.json:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        sys.exit(0)

    print("需要 --diff 或 --old + --new", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
