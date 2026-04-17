"""Quality Analyzer for TestCase Agent.

This module analyzes test case quality including coverage metrics,
priority distribution, and gap detection.
"""

from collections import defaultdict
from typing import Any

from loguru import logger

from ..shared.models import (
    CoverageMetrics,
    PriorityDistribution,
    TypeDistribution,
    QualityGap,
    QualityReport,
)


def analyze_quality(
    test_cases: list[dict],
    feature_points: list[dict],
) -> QualityReport:
    """
    分析测试用例集的质量

    Args:
        test_cases: 测试用例列表
        feature_points: 功能点列表

    Returns:
        QualityReport: 质量报告
    """
    logger.info(
        f"[QualityAnalyzer] Analyzing {len(test_cases)} cases, {len(feature_points)} features"
    )

    # 1. 计算覆盖率
    coverage = _calculate_coverage(test_cases, feature_points)

    # 2. 计算优先级分布
    priority_dist = _calculate_priority_distribution(test_cases)

    # 3. 计算类型分布
    type_dist = _calculate_type_distribution(test_cases)

    # 4. 检测质量缺口
    gaps = _detect_gaps(test_cases, feature_points)

    # 5. 生成改进建议
    recommendations = _generate_recommendations(coverage, priority_dist, gaps)

    # 6. 计算综合评分
    score = _calculate_score(coverage, priority_dist, gaps, len(feature_points))

    # 7. 生成摘要
    summary = {
        "total_cases": len(test_cases),
        "total_features": len(feature_points),
        "avg_cases_per_feature": (
            round(len(test_cases) / len(feature_points), 1) if feature_points else 0
        ),
        "features_covered": len(set(tc.get("feature_point_id") for tc in test_cases)),
        "features_uncovered": len(feature_points)
        - len(set(tc.get("feature_point_id") for tc in test_cases)),
    }

    return QualityReport(
        summary=summary,
        coverage=coverage,
        priority_distribution=priority_dist,
        type_distribution=type_dist,
        gaps=gaps,
        recommendations=recommendations,
        score=score,
    )


def _calculate_coverage(
    test_cases: list[dict],
    feature_points: list[dict],
) -> CoverageMetrics:
    """计算覆盖率指标"""
    if not feature_points:
        return CoverageMetrics(
            valid_equivalence=0.0,
            invalid_equivalence=0.0,
            boundary_value=0.0,
        )

    # 按功能点ID分组用例
    cases_by_feature = defaultdict(list)
    for tc in test_cases:
        fp_id = tc.get("feature_point_id")
        if fp_id:
            cases_by_feature[fp_id].append(tc)

    # 有效等价类覆盖率：有正向用例的功能点比例
    features_with_positive = 0
    for fp in feature_points:
        fp_id = fp.get("id")
        cases = cases_by_feature.get(fp_id, [])
        if any(tc.get("type") == "正向" for tc in cases):
            features_with_positive += 1
    valid_equiv = features_with_positive / len(feature_points)

    # 无效等价类覆盖率：异常处理功能点有逆向用例的比例
    exception_features = [
        fp for fp in feature_points if fp.get("category") == "异常处理"
    ]
    features_with_negative = 0
    if exception_features:
        for fp in exception_features:
            fp_id = fp.get("id")
            cases = cases_by_feature.get(fp_id, [])
            if any(tc.get("type") in ["逆向", "边界"] for tc in cases):
                features_with_negative += 1
        invalid_equiv = features_with_negative / len(exception_features)
    else:
        invalid_equiv = 1.0  # 没有异常处理功能点时，视为100%

    # 边界值覆盖率：边界条件功能点有边界用例的比例
    boundary_features = [
        fp for fp in feature_points if fp.get("category") == "边界条件"
    ]
    features_with_boundary = 0
    if boundary_features:
        for fp in boundary_features:
            fp_id = fp.get("id")
            cases = cases_by_feature.get(fp_id, [])
            if any(tc.get("type") == "边界" for tc in cases):
                features_with_boundary += 1
        boundary_val = features_with_boundary / len(boundary_features)
    else:
        boundary_val = 1.0  # 没有边界条件功能点时，视为100%

    return CoverageMetrics(
        valid_equivalence=round(valid_equiv, 2),
        invalid_equivalence=round(invalid_equiv, 2),
        boundary_value=round(boundary_val, 2),
    )


def _calculate_priority_distribution(test_cases: list[dict]) -> PriorityDistribution:
    """计算优先级分布"""
    dist = PriorityDistribution()

    for tc in test_cases:
        priority = tc.get("priority", "P2")
        if priority == "P1":
            dist.p1_count += 1
        elif priority == "P2":
            dist.p2_count += 1
        elif priority == "P3":
            dist.p3_count += 1
        elif priority == "P4":
            dist.p4_count += 1
        elif priority == "P5":
            dist.p5_count += 1
        # 兼容旧的 P0 优先级
        elif priority == "P0":
            dist.p1_count += 1

    return dist


def _calculate_type_distribution(test_cases: list[dict]) -> TypeDistribution:
    """计算类型分布"""
    dist = TypeDistribution()

    for tc in test_cases:
        tc_type = tc.get("type", "正向")
        if tc_type == "正向":
            dist.positive += 1
        elif tc_type == "逆向":
            dist.negative += 1
        elif tc_type == "边界":
            dist.boundary += 1
        elif tc_type == "性能":
            dist.performance += 1
        elif tc_type == "安全":
            dist.security += 1

    return dist


def _detect_gaps(
    test_cases: list[dict],
    feature_points: list[dict],
) -> list[QualityGap]:
    """检测质量缺口"""
    gaps = []

    # 按功能点ID分组用例
    cases_by_feature = defaultdict(list)
    for tc in test_cases:
        fp_id = tc.get("feature_point_id")
        if fp_id:
            cases_by_feature[fp_id].append(tc)

    for fp in feature_points:
        fp_id = fp.get("id")
        fp_name = fp.get("name", fp_id)
        fp_category = fp.get("category", "")
        cases = cases_by_feature.get(fp_id, [])

        # 检测：无任何用例覆盖
        if not cases:
            gaps.append(
                QualityGap(
                    feature_id=fp_id,
                    feature_name=fp_name,
                    issue="无测试用例覆盖",
                    severity="high",
                    suggestion=f"为 {fp_name} 添加测试用例",
                )
            )
            continue

        # 检测：正向功能缺少 P1/P2 用例
        if fp_category == "正向功能":
            has_p1_p2 = any(tc.get("priority") in ["P1", "P2"] for tc in cases)
            if not has_p1_p2:
                gaps.append(
                    QualityGap(
                        feature_id=fp_id,
                        feature_name=fp_name,
                        issue="正向功能缺少 P1/P2 优先级用例",
                        severity="high",
                        suggestion=f"为 {fp_name} 添加 P1 或 P2 优先级的正向测试用例",
                    )
                )

        # 检测：边界条件缺少边界用例
        if fp_category == "边界条件":
            has_boundary = any(tc.get("type") == "边界" for tc in cases)
            if not has_boundary:
                gaps.append(
                    QualityGap(
                        feature_id=fp_id,
                        feature_name=fp_name,
                        issue="边界条件缺少边界值测试",
                        severity="high",
                        suggestion=f"为 {fp_name} 添加边界值测试用例 (P4)",
                    )
                )

        # 检测：异常处理缺少逆向用例
        if fp_category == "异常处理":
            has_negative = any(tc.get("type") in ["逆向", "边界"] for tc in cases)
            if not has_negative:
                gaps.append(
                    QualityGap(
                        feature_id=fp_id,
                        feature_name=fp_name,
                        issue="异常处理缺少逆向测试",
                        severity="medium",
                        suggestion=f"为 {fp_name} 添加异常场景测试用例 (P3)",
                    )
                )

        # 检测：安全相关缺少安全用例
        if fp_category == "安全相关":
            has_security = any(tc.get("type") == "安全" for tc in cases)
            if not has_security:
                gaps.append(
                    QualityGap(
                        feature_id=fp_id,
                        feature_name=fp_name,
                        issue="安全相关缺少安全测试",
                        severity="high",
                        suggestion=f"为 {fp_name} 添加安全测试用例",
                    )
                )

    return gaps


def _generate_recommendations(
    coverage: CoverageMetrics,
    priority_dist: PriorityDistribution,
    gaps: list[QualityGap],
) -> list[str]:
    """生成改进建议"""
    recommendations = []

    # 覆盖率建议
    if coverage.valid_equivalence < 0.95:
        recommendations.append(
            f"有效等价类覆盖率 {coverage.valid_equivalence*100:.0f}% 低于目标 95%，建议补充正向测试用例"
        )
    if coverage.invalid_equivalence < 0.80:
        recommendations.append(
            f"无效等价类覆盖率 {coverage.invalid_equivalence*100:.0f}% 低于目标 80%，建议补充异常处理测试用例"
        )
    if coverage.boundary_value < 0.90:
        recommendations.append(
            f"边界值覆盖率 {coverage.boundary_value*100:.0f}% 低于目标 90%，建议补充边界条件测试"
        )

    # 分布建议
    total = priority_dist.total
    if total > 0:
        p1_pct = priority_dist.p1_count / total * 100
        p3_pct = priority_dist.p3_count / total * 100

        if p1_pct < 20:
            recommendations.append(
                f"P1 用例占比 {p1_pct:.0f}% 低于目标 27%，建议增加核心功能测试"
            )
        if p3_pct < 25:
            recommendations.append(
                f"P3 用例占比 {p3_pct:.0f}% 低于目标 33%，建议增加异常处理测试"
            )

    # 缺口建议（取前5个高优先级）
    high_severity_gaps = [g for g in gaps if g.severity == "high"][:5]
    for gap in high_severity_gaps:
        recommendations.append(f"[{gap.feature_id}] {gap.suggestion}")

    return recommendations


def _calculate_score(
    coverage: CoverageMetrics,
    priority_dist: PriorityDistribution,
    gaps: list[QualityGap],
    total_features: int,
) -> float:
    """计算综合质量评分 (0-100)"""
    # 覆盖率得分 (40%)
    coverage_score = (
        coverage.valid_equivalence
        + coverage.invalid_equivalence
        + coverage.boundary_value
    ) / 3 * 100

    # 分布得分 (30%)
    total = priority_dist.total
    if total > 0:
        # 目标分布
        targets = {"P1": 0.27, "P2": 0.20, "P3": 0.33, "P4": 0.16, "P5": 0.04}
        actuals = {
            "P1": priority_dist.p1_count / total,
            "P2": priority_dist.p2_count / total,
            "P3": priority_dist.p3_count / total,
            "P4": priority_dist.p4_count / total,
            "P5": priority_dist.p5_count / total,
        }
        deviation = sum(abs(actuals[p] - targets[p]) for p in targets)
        distribution_score = max(0, 100 - deviation * 200)
    else:
        distribution_score = 0

    # 完整性得分 (30%)
    if total_features > 0:
        completeness_score = (1 - len(gaps) / total_features) * 100
    else:
        completeness_score = 100

    # 综合评分
    score = coverage_score * 0.4 + distribution_score * 0.3 + completeness_score * 0.3

    return round(score, 1)
