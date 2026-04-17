"""Pydantic models for TestCase Agent.

This module defines all data models used throughout the TestCase Agent system.
"""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


# ==================== 优先级定义 ====================

# P1: 核心正向 - 核心功能，阻塞发布，必须测试
# P2: 基本正向 - 重要功能，应该测试
# P3: 核心异常 - 异常处理，必须覆盖
# P4: 边界条件 - 边界值测试
# P5: 低频场景 - 可选测试

PriorityLevel = Literal["P1", "P2", "P3", "P4", "P5"]


# ==================== 功能点模型 ====================


class FeaturePoint(BaseModel):
    """功能点模型"""

    id: str = Field(description="功能点 ID，如 FP-001")
    requirement_id: Optional[str] = Field(None, description="关联需求 ID")
    name: str = Field(description="功能名称")
    category: Literal["正向功能", "边界条件", "异常处理", "性能相关", "安全相关"] = Field(
        description="功能点分类"
    )
    description: str = Field(description="详细描述")
    preconditions: list[str] = Field(default_factory=list, description="前置条件")
    test_suggestions: list[str] = Field(
        default_factory=list, description="测试建议"
    )
    priority: PriorityLevel = Field(description="优先级 (P1-P5)")


class FeatureExtractionOutput(BaseModel):
    """功能点提取输出"""

    feature_points: list[FeaturePoint] = Field(description="提取的功能点列表")
    is_final: bool = Field(default=False, description="是否最终确认")
    summary: str = Field(description="提取摘要")


# ==================== 测试用例模型 ====================


class TestStep(BaseModel):
    """测试步骤"""

    step_no: int = Field(description="步骤序号")
    action: str = Field(description="操作描述")
    test_data: str = Field(default="", description="测试数据")
    expected_result: str = Field(description="预期结果")


class TestCase(BaseModel):
    """测试用例"""

    id: str = Field(description="用例 ID，如 TC-001")
    feature_point_id: str = Field(description="关联功能点 ID")
    title: str = Field(description="用例标题")
    purpose: str = Field(description="测试目的")
    priority: PriorityLevel = Field(description="优先级 (P1-P5)")
    type: Literal["正向", "逆向", "边界", "性能", "安全"] = Field(description="用例类型")
    preconditions: list[str] = Field(default_factory=list, description="前置条件")
    steps: list[TestStep] = Field(default_factory=list, description="测试步骤")
    postconditions: list[str] = Field(default_factory=list, description="后置条件")
    tags: list[str] = Field(default_factory=list, description="标签")
    status: Literal["pending", "passed", "failed", "blocked"] = Field(
        default="pending", description="用例状态"
    )


class TestCaseGenerationOutput(BaseModel):
    """测试用例生成输出"""

    test_cases: list[TestCase] = Field(description="生成的测试用例列表")


# ==================== API 请求/响应模型 ====================


class StartSessionRequest(BaseModel):
    """启动会话请求"""

    project_id: int = Field(default=0, description="项目 ID")


class ChatRequest(BaseModel):
    """对话请求"""

    message: str = Field(description="用户消息")
    project_id: int = Field(default=0, description="项目 ID")


class ResumeRequest(BaseModel):
    """恢复 HITL 中断请求"""

    decision: Literal["approve", "edit", "reject"] = Field(description="用户决策")
    modified_features: Optional[list[FeaturePoint]] = Field(
        None, description="修改后的功能点（仅在 edit 时使用）"
    )


class StartGenerationRequest(BaseModel):
    """启动生成请求"""

    session_id: str = Field(description="会话 ID")
    feature_points: list[dict] = Field(description="功能点列表")
    requirement_content: str = Field(default="", description="原始需求文档")
    max_concurrent: int = Field(default=10, ge=1, le=50, description="最大并发数")


class SaveRequest(BaseModel):
    """保存请求"""

    project_id: int = Field(description="项目 ID")
    module_id: int = Field(default=0, description="模块 ID")
    create_user: str = Field(default="agent", description="创建用户")


# ==================== 任务状态模型 ====================


class TaskStatus(BaseModel):
    """任务状态"""

    task_id: str = Field(description="任务 ID")
    status: Literal["pending", "processing", "completed", "failed"] = Field(
        description="任务状态"
    )
    progress: int = Field(description="已完成数量")
    total: int = Field(description="总数量")
    current_feature: Optional[str] = Field(None, description="当前处理的功能点")
    result: Optional[dict] = Field(None, description="任务结果")
    error: Optional[str] = Field(None, description="错误信息")
    created_at: datetime = Field(description="创建时间")


# ==================== SSE 事件模型 ====================


class SSEEvent(BaseModel):
    """SSE 事件"""

    type: Literal["token", "tool_start", "hitl_interrupt", "done", "error"] = Field(
        description="事件类型"
    )
    content: Optional[str] = Field(None, description="内容（token 类型时）")
    tool: Optional[str] = Field(None, description="工具名称（tool_start 类型时）")
    feature_points: Optional[list[dict]] = Field(
        None, description="功能点列表（hitl_interrupt 类型时）"
    )
    allowed_decisions: Optional[list[str]] = Field(
        None, description="允许的决策（hitl_interrupt 类型时）"
    )
    message: Optional[str] = Field(None, description="错误消息（error 类型时）")


# ==================== 覆盖率统计模型 ====================


class CoverageMetrics(BaseModel):
    """覆盖率指标"""

    valid_equivalence: float = Field(description="有效等价类覆盖率 (目标: 95%)")
    invalid_equivalence: float = Field(description="无效等价类覆盖率 (目标: 80%)")
    boundary_value: float = Field(description="边界值覆盖率 (目标: 90%)")

    def check_targets(self) -> dict:
        """检查是否达到目标覆盖率"""
        return {
            "valid_equivalence": {
                "current": self.valid_equivalence,
                "target": 0.95,
                "met": self.valid_equivalence >= 0.95,
            },
            "invalid_equivalence": {
                "current": self.invalid_equivalence,
                "target": 0.80,
                "met": self.invalid_equivalence >= 0.80,
            },
            "boundary_value": {
                "current": self.boundary_value,
                "target": 0.90,
                "met": self.boundary_value >= 0.90,
            },
        }


class PriorityDistribution(BaseModel):
    """用例优先级分布"""

    p1_count: int = Field(default=0, description="P1 核心正向数量 (目标: ~27%)")
    p2_count: int = Field(default=0, description="P2 基本正向数量 (目标: ~20%)")
    p3_count: int = Field(default=0, description="P3 核心异常数量 (目标: ~33%)")
    p4_count: int = Field(default=0, description="P4 边界条件数量 (目标: ~16%)")
    p5_count: int = Field(default=0, description="P5 低频场景数量 (目标: ~4%)")

    @property
    def total(self) -> int:
        """总用例数"""
        return self.p1_count + self.p2_count + self.p3_count + self.p4_count + self.p5_count

    def to_percentages(self) -> dict:
        """转换为百分比"""
        if self.total == 0:
            return {"P1": "0%", "P2": "0%", "P3": "0%", "P4": "0%", "P5": "0%"}
        return {
            "P1": f"{self.p1_count / self.total * 100:.0f}%",
            "P2": f"{self.p2_count / self.total * 100:.0f}%",
            "P3": f"{self.p3_count / self.total * 100:.0f}%",
            "P4": f"{self.p4_count / self.total * 100:.0f}%",
            "P5": f"{self.p5_count / self.total * 100:.0f}%",
        }

    def check_targets(self) -> dict:
        """检查是否接近目标分布"""
        if self.total == 0:
            return {}
        return {
            "P1": {
                "count": self.p1_count,
                "percentage": f"{self.p1_count / self.total * 100:.0f}%",
                "target": "~27%",
            },
            "P2": {
                "count": self.p2_count,
                "percentage": f"{self.p2_count / self.total * 100:.0f}%",
                "target": "~20%",
            },
            "P3": {
                "count": self.p3_count,
                "percentage": f"{self.p3_count / self.total * 100:.0f}%",
                "target": "~33%",
            },
            "P4": {
                "count": self.p4_count,
                "percentage": f"{self.p4_count / self.total * 100:.0f}%",
                "target": "~16%",
            },
            "P5": {
                "count": self.p5_count,
                "percentage": f"{self.p5_count / self.total * 100:.0f}%",
                "target": "~4%",
            },
        }


class TypeDistribution(BaseModel):
    """用例类型分布"""

    positive: int = Field(default=0, description="正向用例数量")
    negative: int = Field(default=0, description="逆向用例数量")
    boundary: int = Field(default=0, description="边界用例数量")
    performance: int = Field(default=0, description="性能用例数量")
    security: int = Field(default=0, description="安全用例数量")

    @property
    def total(self) -> int:
        return self.positive + self.negative + self.boundary + self.performance + self.security


class QualityGap(BaseModel):
    """质量缺口"""

    feature_id: str = Field(description="功能点 ID")
    feature_name: str = Field(description="功能点名称")
    issue: str = Field(description="问题描述")
    severity: Literal["high", "medium", "low"] = Field(description="严重程度")
    suggestion: str = Field(description="改进建议")


class QualityReport(BaseModel):
    """质量报告"""

    summary: dict = Field(description="摘要统计")
    coverage: CoverageMetrics = Field(description="覆盖率指标")
    priority_distribution: PriorityDistribution = Field(description="优先级分布")
    type_distribution: TypeDistribution = Field(description="类型分布")
    gaps: list[QualityGap] = Field(default_factory=list, description="质量缺口")
    recommendations: list[str] = Field(default_factory=list, description="改进建议")
    score: float = Field(default=0.0, description="综合质量评分 (0-100)")

