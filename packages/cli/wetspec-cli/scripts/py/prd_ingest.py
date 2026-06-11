#!/usr/bin/env python3
"""
P0: PRD 文档摄入 — PDF / Word / 文本 → 规范化 Markdown
用法:
  python prd_ingest.py <input_file> [--output <md_path>] [--json]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


def ingest_pdf(path: Path) -> str:
    try:
        import fitz  # pymupdf

        doc = fitz.open(path)
        return "\n\n".join(page.get_text() for page in doc)
    except ImportError:
        pass
    try:
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        return "\n\n".join(p.extract_text() or "" for p in reader.pages)
    except ImportError:
        raise RuntimeError("PDF 摄入需要 pymupdf 或 pypdf: pip install pymupdf")


def ingest_docx(path: Path) -> str:
    try:
        from docx import Document
    except ImportError:
        raise RuntimeError("Word 摄入需要 python-docx: pip install python-docx")

    doc = Document(str(path))
    lines = []
    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            lines.append("")
            continue
        style = (para.style.name or "").lower()
        if "heading 1" in style or style == "标题 1":
            lines.append(f"# {text}")
        elif "heading 2" in style or style == "标题 2":
            lines.append(f"## {text}")
        elif "heading 3" in style or style == "标题 3":
            lines.append(f"### {text}")
        elif "heading 4" in style or style == "标题 4":
            lines.append(f"#### {text}")
        else:
            lines.append(text)
    return "\n".join(lines)


def normalize_markdown(text: str) -> str:
    """轻量规范化：合并多余空行、统一换行。"""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() + "\n"


def ingest(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".pdf":
        raw = ingest_pdf(path)
    elif ext in (".docx", ".doc"):
        if ext == ".doc":
            raise RuntimeError(".doc 旧格式请先另存为 .docx")
        raw = ingest_docx(path)
    elif ext in (".md", ".txt", ".markdown"):
        raw = path.read_text(encoding="utf-8")
    else:
        raise RuntimeError(f"不支持的格式: {ext}（支持 .pdf .docx .md .txt）")
    return normalize_markdown(raw)


def main() -> None:
    parser = argparse.ArgumentParser(description="PRD 文档摄入 → Markdown")
    parser.add_argument("input", help="PRD 文件路径")
    parser.add_argument("--output", "-o", help="输出 Markdown 路径")
    parser.add_argument("--json", action="store_true", help="JSON 输出元数据")
    args = parser.parse_args()

    src = Path(args.input).resolve()
    if not src.exists():
        print(
            json.dumps({"ok": False, "error": f"文件不存在: {src}"}),
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        md = ingest(src)
        out_path = Path(args.output).resolve() if args.output else None
        if out_path:
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(md, encoding="utf-8")

        if args.json:
            print(json.dumps({
                "ok": True,
                "source": str(src),
                "output": str(out_path) if out_path else None,
                "format": src.suffix.lower(),
                "char_count": len(md),
                "line_count": md.count("\n") + 1,
            }, ensure_ascii=False, indent=2))
        elif out_path:
            print(f"✅ 已写入: {out_path}", file=sys.stderr)
        else:
            print(md, end="")
        sys.exit(0)
    except Exception as e:
        if args.json:
            print(json.dumps({"ok": False, "error": str(e)}), file=sys.stderr)
        else:
            print(f"❌ {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
