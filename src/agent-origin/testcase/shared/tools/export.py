"""Export tools for TestCase Agent.

This module provides export functionality for test cases.
Note: These are utility functions called by Controller, not Agent tools.
"""

import json
from typing import Literal
from pathlib import Path

from openpyxl import Workbook
from loguru import logger


async def export_testcases(
    test_cases: list[dict],
    format: Literal["excel", "xmind", "json"],
    filename: str,
) -> str:
    """
    导出测试用例（仅由 Controller 调用，非 Agent 工具）

    Args:
        test_cases: 测试用例列表
        format: 导出格式（excel/xmind/json）
        filename: 文件名（不含扩展名）

    Returns:
        导出文件路径

    Raises:
        ValueError: 不支持的格式
    """
    if not test_cases:
        raise ValueError("No test cases to export")

    # 确保 exports 目录存在
    exports_dir = Path("exports")
    exports_dir.mkdir(exist_ok=True)

    if format == "excel":
        return await _export_excel(test_cases, filename, exports_dir)
    elif format == "xmind":
        return await _export_xmind(test_cases, filename, exports_dir)
    elif format == "json":
        return await _export_json(test_cases, filename, exports_dir)
    else:
        raise ValueError(f"Unsupported format: {format}")


async def _export_excel(
    test_cases: list[dict], filename: str, exports_dir: Path
) -> str:
    """
    导出为 Excel

    Args:
        test_cases: 测试用例列表
        filename: 文件名
        exports_dir: 导出目录

    Returns:
        文件路径
    """
    logger.info(f"[Export] Exporting {len(test_cases)} test cases to Excel")

    wb = Workbook()
    ws = wb.active
    ws.title = "测试用例"

    # 表头
    headers = [
        "用例ID",
        "功能点ID",
        "标题",
        "类型",
        "优先级",
        "测试目的",
        "前置条件",
        "测试步骤",
        "预期结果",
        "标签",
    ]
    ws.append(headers)

    # 数据行
    for tc in test_cases:
        steps_text = "\n".join(
            [
                f"{s.get('step_no', i+1)}. {s.get('action', '')} "
                f"(数据: {s.get('test_data', '')})"
                for i, s in enumerate(tc.get("steps", []))
            ]
        )

        expected = "\n".join(
            [s.get("expected_result", "") for s in tc.get("steps", [])]
        )

        preconditions = "\n".join(tc.get("preconditions", []))
        tags = ", ".join(tc.get("tags", []))

        ws.append(
            [
                tc.get("id", ""),
                tc.get("feature_point_id", ""),
                tc.get("title", ""),
                tc.get("type", ""),
                tc.get("priority", ""),
                tc.get("purpose", ""),
                preconditions,
                steps_text,
                expected,
                tags,
            ]
        )

    # 调整列宽
    for column in ws.columns:
        max_length = 0
        column_letter = column[0].column_letter
        for cell in column:
            try:
                if len(str(cell.value)) > max_length:
                    max_length = len(str(cell.value))
            except:
                pass
        adjusted_width = min(max_length + 2, 50)
        ws.column_dimensions[column_letter].width = adjusted_width

    output_path = exports_dir / f"{filename}.xlsx"
    wb.save(output_path)

    logger.info(f"[Export] Excel saved to: {output_path}")
    return str(output_path)


async def _export_json(
    test_cases: list[dict], filename: str, exports_dir: Path
) -> str:
    """
    导出为 JSON

    Args:
        test_cases: 测试用例列表
        filename: 文件名
        exports_dir: 导出目录

    Returns:
        文件路径
    """
    logger.info(f"[Export] Exporting {len(test_cases)} test cases to JSON")

    output_path = exports_dir / f"{filename}.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(test_cases, f, ensure_ascii=False, indent=2)

    logger.info(f"[Export] JSON saved to: {output_path}")
    return str(output_path)


async def _export_xmind(
    test_cases: list[dict], filename: str, exports_dir: Path
) -> str:
    """
    导出为 XMind

    Args:
        test_cases: 测试用例列表
        filename: 文件名
        exports_dir: 导出目录

    Returns:
        文件路径

    Note:
        XMind 导出需要 xmind 库，目前使用 JSON 格式作为备选
    """
    logger.warning(
        "[Export] XMind export not implemented, using JSON as fallback"
    )

    # 暂时使用 JSON 作为备选
    return await _export_json(test_cases, f"{filename}_xmind_fallback", exports_dir)
