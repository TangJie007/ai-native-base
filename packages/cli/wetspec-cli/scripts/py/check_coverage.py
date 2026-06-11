#!/usr/bin/env python3
"""
P2: PRD ↔ Spec 覆盖率（rapidfuzz 模糊匹配）
用法: python check_coverage.py <prd_path> <spec_dir> [--json]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.spec_index import normalize_name, scan_spec_index  # noqa: E402

MD_HEADING = re.compile(r"^(#{1,4})\s+(.+)$")
NUM_HEADING = re.compile(r"^(\d+(?:\.\d+)*)\s+(.+)$")
FEATURE_KW = re.compile(r"功能\s*[\d.]+\s*[：:]\s*(.+)")


def extract_prd_features(prd_text: str) -> list[dict]:
    lines = prd_text.split("\n")
    features = []
    current_module = ""

    for i, line in enumerate(lines):
        stripped = line.strip()
        md = MD_HEADING.match(stripped)
        if md:
            level = len(md.group(1))
            heading = md.group(2).strip()
            if level == 2 and "模块" in heading:
                current_module = re.sub(
                    r"^模块[一二三四五六七八九十\d]*[：:]\s*", "", heading
                ).strip() or heading
            if level >= 3:
                feat = FEATURE_KW.search(heading)
                if feat:
                    features.append({
                        "name": feat.group(1).strip(),
                        "module": current_module,
                        "line": i + 1,
                        "raw": heading,
                    })
                elif level == 4 and "功能" in heading:
                    features.append({
                        "name": heading,
                        "module": current_module,
                        "line": i + 1,
                        "raw": heading,
                    })

        num = NUM_HEADING.match(stripped)
        if num and len(num.group(1).split(".")) >= 3:
            features.append({
                "name": num.group(2).strip(),
                "module": current_module,
                "line": i + 1,
                "raw": stripped,
            })

    return features


def match_feature(
    prd_feature: dict,
    spec_features: list[dict],
    threshold: int = 80,
):
    prd_norm = normalize_name(prd_feature["name"])
    try:
        from rapidfuzz import fuzz

        best = None
        best_score = 0
        for s in spec_features:
            spec_norm = normalize_name(s["feature"])
            score = fuzz.token_set_ratio(prd_norm, spec_norm)
            if score > best_score:
                best_score = score
                best = s
        if best and best_score >= threshold:
            return best, best_score
    except ImportError:
        for s in spec_features:
            spec_norm = normalize_name(s["feature"])
            if (
                spec_norm == prd_norm
                or spec_norm in prd_norm
                or prd_norm in spec_norm
            ):
                return s, 100
    return None, 0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("prd")
    parser.add_argument("spec_dir")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--threshold", type=int, default=80)
    args = parser.parse_args()

    prd_path = Path(args.prd).resolve()
    spec_dir = Path(args.spec_dir).resolve()

    if not prd_path.exists():
        print(json.dumps({"ok": False, "error": f"PRD 不存在: {prd_path}"}))
        sys.exit(1)

    prd_text = prd_path.read_text(encoding="utf-8")
    prd_features = extract_prd_features(prd_text)
    index = scan_spec_index(spec_dir)
    spec_features = index["features"]

    covered = []
    missing = []
    orphaned = list(spec_features)

    for pf in prd_features:
        match, score = match_feature(pf, spec_features, args.threshold)
        if match:
            covered.append({
                "prd": pf,
                "spec": {
                    "id": match["id"],
                    "feature": match["feature"],
                    "module": match["module"],
                    "file": match["rel_yaml"],
                },
                "score": score,
            })
            orphaned = [
                o for o in orphaned
                if not (
                    o["feature"] == match["feature"]
                    and o["module"] == match["module"]
                )
            ]
        else:
            missing.append(pf)

    report = {
        "ok": len(missing) == 0,
        "engine": "python",
        "prd": prd_path.name,
        "specDir": str(spec_dir),
        "prdFeatureCount": len(prd_features),
        "specFeatureCount": len(spec_features),
        "covered": len(covered),
        "missing": [
            {"name": m["name"], "module": m["module"], "line": m["line"]}
            for m in missing
        ],
        "orphaned": [
            {
                "id": o["id"],
                "feature": o["feature"],
                "module": o["module"],
                "file": o["rel_yaml"],
            }
            for o in orphaned
        ],
        "coveragePercent": (
            round(len(covered) / len(prd_features) * 100)
            if prd_features else 100
        ),
        "matches": covered,
    }

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        pct = report["coveragePercent"]
        cov = report["covered"]
        total = report["prdFeatureCount"]
        print(
            f"\n📋 PRD ↔ Spec 覆盖率: {pct}% ({cov}/{total}) [python]\n",
            file=sys.stderr,
        )
        if missing:
            print("❌ PRD 中未覆盖的功能:", file=sys.stderr)
            for m in missing:
                mod = m["module"]
                print(
                    f"   - L{m['line']} [{mod}] {m['name']}",
                    file=sys.stderr,
                )

    sys.exit(0 if report["ok"] else 1)


if __name__ == "__main__":
    main()
