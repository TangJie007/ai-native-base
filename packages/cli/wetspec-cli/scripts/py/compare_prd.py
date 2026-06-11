#!/usr/bin/env python3
"""
P3: PRD 差异对比（章节 + 功能正文级）— 增强版 compare_prd

用法:
  python compare_prd.py <old_prd> <new_prd> \\
    [--output diff.json] [--spec-dir specs/] [--format json|text]
"""
from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.spec_index import resolve_spec_path, scan_spec_index  # noqa: E402
from map_affected import enrich_diff, find_modified_features  # noqa: E402

MD_HEADING = re.compile(r"^(#{1,4})\s+(.+)$")
NUM_HEADING = re.compile(r"^(\d+(?:\.\d+)*)\s+(.+)$")
KW_HEADING = re.compile(r"^(?:【(.+?)】|(?:模块|功能|需求)[：:]\s*(.+))$")


def read_prd(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def extract_sections(text: str) -> list[dict]:
    lines = text.split("\n")
    sections = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        info: dict = {
            "lineNumber": i + 1,
            "text": stripped,
            "suggestedModule": "",
            "suggestedFeature": "",
        }

        md = MD_HEADING.match(stripped)
        if md:
            level = len(md.group(1))
            heading = md.group(2).strip()
            if level == 1:
                info["suggestedModule"] = heading
            elif level == 2:
                info["suggestedFeature"] = heading
            info["type"] = f"h{level}"
            sections.append(info)
            continue

        num = NUM_HEADING.match(stripped)
        if num:
            number, content = num.group(1), num.group(2)
            depth = len(number.split("."))
            info["number"] = number
            if depth == 1:
                info["suggestedModule"] = f"{number} {content}"
            else:
                info["suggestedFeature"] = f"{number} {content}"
            info["type"] = "numbered"
            sections.append(info)
            continue

        kw = KW_HEADING.match(stripped)
        if kw:
            if kw.group(1):
                info["suggestedFeature"] = kw.group(1)
            info["type"] = "keyword"
            sections.append(info)

    return sections


def compare_sections(old_secs: list[dict], new_secs: list[dict]) -> dict:
    old_texts = [s["text"] for s in old_secs]
    new_texts = [s["text"] for s in new_secs]
    sm = difflib.SequenceMatcher(None, old_texts, new_texts)
    details = []
    summary = {"added": 0, "modified": 0, "removed": 0, "unchanged": 0}

    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            summary["unchanged"] += i2 - i1
            for k in range(i1, i2):
                details.append(_detail("unchanged", old_secs[k], old_secs[k]))
        elif tag == "delete":
            for k in range(i1, i2):
                details.append(_detail("removed", old_secs[k], None))
            summary["removed"] += i2 - i1
        elif tag == "insert":
            for k in range(j1, j2):
                details.append(_detail("added", None, new_secs[k]))
            summary["added"] += j2 - j1
        elif tag == "replace":
            # 尝试 pairwise；长度不一时标为 modified
            olen, nlen = i2 - i1, j2 - j1
            pairs = max(olen, nlen)
            for p in range(pairs):
                o = old_secs[i1 + p] if p < olen else None
                n = new_secs[j1 + p] if p < nlen else None
                if o and n:
                    details.append(_detail("modified", o, n))
                    summary["modified"] += 1
                elif o:
                    details.append(_detail("removed", o, None))
                    summary["removed"] += 1
                elif n:
                    details.append(_detail("added", None, n))
                    summary["added"] += 1

    return {
        "summary": summary,
        "modules": {"added": [], "removed": [], "changed": []},
        "features": {"added": [], "removed": [], "changed": []},
        "details": details,
        "affected_specs": [],
    }


def _detail(change_type: str, old_s: dict | None, new_s: dict | None) -> dict:
    s = new_s or old_s or {}
    actions = {
        "added": "创建新 Spec 文件并更新 INDEX",
        "modified": "更新现有 Spec 并追加 changelog",
        "removed": "将 metadata.status 标为 deprecated",
        "unchanged": "无需操作",
    }
    return {
        "changeType": change_type,
        "lineNumber": s.get("lineNumber"),
        "text": s.get("text", ""),
        "suggestedModule": s.get("suggestedModule", ""),
        "suggestedFeature": s.get("suggestedFeature", ""),
        "affectedSpecFile": "",
        "actionRequired": actions.get(change_type, ""),
    }


def attach_heading_specs(comparison: dict, spec_dir: str | None) -> dict:
    if not spec_dir:
        return comparison
    index = scan_spec_index(spec_dir)
    affected = set()
    for d in comparison["details"]:
        if d["changeType"] == "unchanged":
            continue
        feat = d.get("suggestedFeature") or d.get("text", "")
        rel = resolve_spec_path(feat, index)
        d["affectedSpecFile"] = rel
        if rel:
            affected.add(rel)
    comparison["affected_specs"] = sorted(affected)
    return comparison


def unified_diff_text(old_text: str, new_text: str) -> str:
    old_lines = old_text.splitlines(keepends=True)
    new_lines = new_text.splitlines(keepends=True)
    diff = difflib.unified_diff(
        old_lines,
        new_lines,
        fromfile="旧版 PRD",
        tofile="新版 PRD",
        lineterm="",
    )
    return "".join(diff) or "--- 旧版 PRD\n+++ 新版 PRD\n"


def merge_body_changes(
    comparison: dict,
    old_text: str,
    new_text: str,
    spec_dir: str | None,
) -> dict:
    """将正文级功能变更合并进 summary/details。"""
    body_changes = find_modified_features(old_text, new_text)
    for bc in body_changes:
        ct = bc.get("change_type", "modified")
        if ct == "unchanged":
            continue
        comparison["summary"][ct] = comparison["summary"].get(ct, 0) + 1
        comparison["details"].append({
            "changeType": ct,
            "lineNumber": bc.get("line"),
            "text": bc.get("heading", bc["name"]),
            "suggestedModule": "",
            "suggestedFeature": bc["name"],
            "affectedSpecFile": "",
            "actionRequired": "更新现有 Spec 并追加 changelog",
            "source": "body_diff",
        })
    if spec_dir:
        comparison = enrich_diff(comparison, spec_dir, old_text, new_text)
    return comparison


def format_text(comp: dict) -> str:
    lines = ["===== PRD 差异报告 (python) =====", ""]
    lines.append("--- 摘要 ---")
    s = comp["summary"]
    lines.append(
        f"新增: {s['added']}  修改: {s['modified']}  "
        f"删除: {s['removed']}  未变: {s['unchanged']}"
    )
    lines.append(f"affected_specs: {comp.get('affected_specs', [])}")
    lines.append("")
    for d in comp["details"]:
        if d["changeType"] == "unchanged":
            continue
        ctype = d["changeType"].upper()
        lineno = d.get("lineNumber", "?")
        lines.append(f"[{ctype}] L{lineno} {d['text']}")
        if d.get("affectedSpecFile"):
            lines.append(f"  Spec: {d['affectedSpecFile']}")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("old_prd")
    parser.add_argument("new_prd")
    parser.add_argument("--output", "-o")
    parser.add_argument("--spec-dir")
    parser.add_argument("--format", default="json", choices=["json", "text"])
    args = parser.parse_args()

    old_path = Path(args.old_prd).resolve()
    new_path = Path(args.new_prd).resolve()
    if not old_path.exists() or not new_path.exists():
        print(json.dumps({"ok": False, "error": "PRD 文件不存在"}), file=sys.stderr)
        sys.exit(1)

    old_text = read_prd(old_path)
    new_text = read_prd(new_path)
    old_secs = extract_sections(old_text)
    new_secs = extract_sections(new_text)

    comparison = compare_sections(old_secs, new_secs)
    comparison = attach_heading_specs(comparison, args.spec_dir)
    comparison = merge_body_changes(
        comparison, old_text, new_text, args.spec_dir
    )

    udiff = unified_diff_text(old_text, new_text)
    comparison["unified_diff"] = udiff
    comparison["unifiedDiff"] = udiff
    comparison["meta"] = {
        "oldFile": str(old_path),
        "newFile": str(new_path),
        "oldSectionCount": len(old_secs),
        "newSectionCount": len(new_secs),
        "engine": "python",
    }

    if args.format == "text":
        out = format_text(comparison)
    else:
        out = json.dumps(comparison, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(out, encoding="utf-8")
        print(f"✅ 差异报告已保存: {args.output}", file=sys.stderr)
    else:
        print(out)


if __name__ == "__main__":
    main()
