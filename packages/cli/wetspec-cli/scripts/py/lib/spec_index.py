"""扫描 specs/ 目录，构建功能名 → Spec 相对路径索引。"""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    yaml = None  # type: ignore


def normalize_name(name: str) -> str:
    return re.sub(r"\s+", "", name or "").replace("（", "(").replace("）", ")")


def load_yaml(path: Path) -> dict[str, Any]:
    if yaml is None:
        raise RuntimeError("缺少 PyYAML，请 pip install -r requirements.txt")
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def get_feature_info(data: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    if data.get("metadata"):
        m = data["metadata"]
        return m.get("id"), m.get("module"), m.get("feature")
    if data.get("spec"):
        s = data["spec"]
        return s.get("id"), s.get("module"), s.get("name")
    return None, None, None


def scan_spec_index(spec_dir: str | Path) -> dict[str, Any]:
    root = Path(spec_dir).resolve()
    features: list[dict[str, Any]] = []
    by_norm: dict[str, str] = {}
    by_id: dict[str, str] = {}

    if not root.exists():
        return {"features": features, "by_norm": by_norm, "by_id": by_id}

    for dirpath, _, files in os.walk(root):
        for fn in files:
            if not fn.endswith("_spec.yaml"):
                continue
            abs_path = Path(dirpath) / fn
            rel = abs_path.relative_to(root).as_posix()
            try:
                data = load_yaml(abs_path)
            except Exception:
                continue
            fid, module, feature = get_feature_info(data)
            if not feature:
                continue
            entry = {
                "id": fid,
                "module": module,
                "feature": feature,
                "rel_yaml": rel,
                "data": data,
            }
            features.append(entry)
            by_norm[normalize_name(feature)] = rel
            if fid:
                by_id[str(fid).lower()] = rel

    return {"features": features, "by_norm": by_norm, "by_id": by_id}


def resolve_spec_path(
    feature_hint: str,
    index: dict[str, Any],
    threshold: int = 75,
) -> str:
    """根据功能名提示解析 Spec 相对路径。"""
    if not feature_hint:
        return ""

    hint = feature_hint.strip()
    hint_norm = normalize_name(hint)

    if hint_norm in index["by_norm"]:
        return index["by_norm"][hint_norm]
    if hint.lower() in index["by_id"]:
        return index["by_id"][hint.lower()]

    try:
        from rapidfuzz import fuzz, process

        choices = {normalize_name(f["feature"]): f["rel_yaml"] for f in index["features"]}
        if not choices:
            return ""
        match = process.extractOne(hint_norm, list(choices.keys()), scorer=fuzz.token_set_ratio)
        if match and match[1] >= threshold:
            return choices[match[0]]
    except ImportError:
        for f in index["features"]:
            fn = normalize_name(f["feature"])
            if hint_norm in fn or fn in hint_norm:
                return f["rel_yaml"]

    return ""
