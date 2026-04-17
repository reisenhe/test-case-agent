"""Phase 1 Tools for TestCase Agent.

This module defines the tools used in Phase 1 (requirement clarification).
"""

from langchain_core.tools import tool
from pydantic import BaseModel, Field


class FeaturePoints(BaseModel):
    """功能点列表"""

    feature_points: list[dict] = Field(description="提取的功能点列表")


@tool
def confirm_features(feature_points: list[dict]) -> dict:
    """
    确认提取的功能点列表

    调用此工具会触发人工审核流程（HITL - Human-in-the-Loop）。
    用户可以：
    - approve: 批准功能点列表
    - edit: 修改功能点后批准
    - reject: 拒绝并要求重新提取

    Args:
        feature_points: 提取的功能点列表

    Returns:
        确认结果（由 HITL 机制填充）

    注意:
        此函数体不会真正执行，HITL 机制会拦截并返回用户决策。
    """
    # 此函数体不会真正执行
    # HITL 机制会拦截并返回用户决策
    return {"feature_points": feature_points, "status": "pending_review"}
