#!/usr/bin/env python3
"""
pdfplumber 字符提取脚本

供 TypeScript 规则引擎调用，输出 JSON 格式的字符数据。

使用方法:
python3 scripts/poc/pdfplumber_extract.py <pdf_path> --json
"""

import pdfplumber
import json
import sys
import os
from typing import List, Dict, Any


def extract_chars_from_pdf(pdf_path: str) -> Dict[str, Any]:
    """
    从 PDF 提取所有页面的字符及其坐标

    返回结构:
    {
        "file": "文件名",
        "totalPages": 页数,
        "pages": [
            {
                "pageNum": 1,
                "chars": [
                    {"text": "A", "x0": 10.0, "x1": 15.0, "top": 20.0, "bottom": 30.0},
                    ...
                ],
                "text": "完整文本"
            }
        ]
    }
    """
    result = {
        "file": os.path.basename(pdf_path),
        "totalPages": 0,
        "pages": []
    }

    with pdfplumber.open(pdf_path) as pdf:
        result["totalPages"] = len(pdf.pages)

        for i, page in enumerate(pdf.pages):
            page_data = {
                "pageNum": i + 1,
                "chars": [],
                "text": ""
            }

            # 提取字符及坐标
            for char in page.chars:
                page_data["chars"].append({
                    "text": char["text"],
                    "x0": round(char["x0"], 2),
                    "x1": round(char["x1"], 2),
                    "top": round(char["top"], 2),
                    "bottom": round(char["bottom"], 2)
                })

            # 提取完整文本
            page_data["text"] = page.extract_text() or ""

            result["pages"].append(page_data)

    return result


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 pdfplumber_extract.py <pdf_path> [--json]", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]

    if not os.path.exists(pdf_path):
        print(f"Error: File not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    result = extract_chars_from_pdf(pdf_path)

    # 始终输出 JSON (供 TypeScript 调用)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
