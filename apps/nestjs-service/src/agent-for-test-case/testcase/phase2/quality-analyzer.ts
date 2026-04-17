/**
 * Quality Analyzer for TestCase Agent (TypeScript port of phase2/quality_analyzer.py).
 *
 * Analyzes test case quality including:
 *  - Coverage metrics (valid/invalid equivalence, boundary values)
 *  - Priority distribution
 *  - Type distribution
 *  - Quality gap detection
 *  - Improvement recommendations
 *  - Composite quality score (0-100)
 */

import {
  CoverageMetrics,
  PriorityDistribution,
  TypeDistribution,
  QualityReport,
} from '../shared/models';
import type { QualityGap } from '../shared/models';

// ==================== Public API ====================

/**
 * 分析测试用例集的质量
 * (Equivalent to Python's analyze_quality)
 *
 * @param testCases     测试用例列表
 * @param featurePoints 功能点列表
 * @returns QualityReport 质量报告
 */
export function analyzeQuality(
  testCases: Record<string, unknown>[],
  featurePoints: Record<string, unknown>[],
): QualityReport {
  console.log(
    `[QualityAnalyzer] Analyzing ${testCases.length} cases, ${featurePoints.length} features`,
  );

  const coverage = calculateCoverage(testCases, featurePoints);
  const priorityDist = calculatePriorityDistribution(testCases);
  const typeDist = calculateTypeDistribution(testCases);
  const gaps = detectGaps(testCases, featurePoints);
  const recommendations = generateRecommendations(
    coverage,
    priorityDist,
    gaps,
  );
  const score = calculateScore(
    coverage,
    priorityDist,
    gaps,
    featurePoints.length,
  );

  const coveredFeatureIds = new Set(
    testCases.map((tc) => tc.feature_point_id as string).filter(Boolean),
  );

  const summary = {
    total_cases: testCases.length,
    total_features: featurePoints.length,
    avg_cases_per_feature:
      featurePoints.length > 0
        ? Math.round((testCases.length / featurePoints.length) * 10) / 10
        : 0,
    features_covered: coveredFeatureIds.size,
    features_uncovered: featurePoints.length - coveredFeatureIds.size,
  };

  return {
    summary,
    coverage,
    priority_distribution: priorityDist,
    type_distribution: typeDist,
    gaps,
    recommendations,
    score,
  };
}

// ==================== Internal Functions ====================

/** 计算覆盖率指标 */
function calculateCoverage(
  testCases: Record<string, unknown>[],
  featurePoints: Record<string, unknown>[],
): CoverageMetrics {
  if (featurePoints.length === 0) {
    return new CoverageMetrics({
      valid_equivalence: 0,
      invalid_equivalence: 0,
      boundary_value: 0,
    });
  }

  // 按功能点ID分组用例
  const casesByFeature = new Map<string, Record<string, unknown>[]>();
  for (const tc of testCases) {
    const fpId = tc.feature_point_id as string;
    if (fpId) {
      if (!casesByFeature.has(fpId)) casesByFeature.set(fpId, []);
      casesByFeature.get(fpId)!.push(tc);
    }
  }

  // 有效等价类覆盖率：有正向用例的功能点比例
  let featuresWithPositive = 0;
  for (const fp of featurePoints) {
    const fpId = fp.id as string;
    const cases = casesByFeature.get(fpId) ?? [];
    if (cases.some((tc) => tc.type === '正向')) {
      featuresWithPositive++;
    }
  }
  const validEquiv = featuresWithPositive / featurePoints.length;

  // 无效等价类覆盖率：异常处理功能点有逆向用例的比例
  const exceptionFeatures = featurePoints.filter(
    (fp) => fp.category === '异常处理',
  );
  let invalidEquiv = 1.0; // 没有异常处理功能点时视为100%
  if (exceptionFeatures.length > 0) {
    let featuresWithNegative = 0;
    for (const fp of exceptionFeatures) {
      const fpId = fp.id as string;
      const cases = casesByFeature.get(fpId) ?? [];
      if (cases.some((tc) => tc.type === '逆向' || tc.type === '边界')) {
        featuresWithNegative++;
      }
    }
    invalidEquiv = featuresWithNegative / exceptionFeatures.length;
  }

  // 边界值覆盖率：边界条件功能点有边界用例的比例
  const boundaryFeatures = featurePoints.filter(
    (fp) => fp.category === '边界条件',
  );
  let boundaryVal = 1.0; // 没有边界条件功能点时视为100%
  if (boundaryFeatures.length > 0) {
    let featuresWithBoundary = 0;
    for (const fp of boundaryFeatures) {
      const fpId = fp.id as string;
      const cases = casesByFeature.get(fpId) ?? [];
      if (cases.some((tc) => tc.type === '边界')) {
        featuresWithBoundary++;
      }
    }
    boundaryVal = featuresWithBoundary / boundaryFeatures.length;
  }

  return new CoverageMetrics({
    valid_equivalence: Math.round(validEquiv * 100) / 100,
    invalid_equivalence: Math.round(invalidEquiv * 100) / 100,
    boundary_value: Math.round(boundaryVal * 100) / 100,
  });
}

/** 计算优先级分布 */
function calculatePriorityDistribution(
  testCases: Record<string, unknown>[],
): PriorityDistribution {
  const dist = new PriorityDistribution();

  for (const tc of testCases) {
    const priority = tc.priority as string;
    switch (priority) {
      case 'P1':
        dist.p1_count++;
        break;
      case 'P2':
        dist.p2_count++;
        break;
      case 'P3':
        dist.p3_count++;
        break;
      case 'P4':
        dist.p4_count++;
        break;
      case 'P5':
        dist.p5_count++;
        break;
      case 'P0':
        // 兼容旧的 P0 优先级
        dist.p1_count++;
        break;
    }
  }

  return dist;
}

/** 计算类型分布 */
function calculateTypeDistribution(
  testCases: Record<string, unknown>[],
): TypeDistribution {
  const dist = new TypeDistribution();

  for (const tc of testCases) {
    const tcType = tc.type as string;
    switch (tcType) {
      case '正向':
        dist.positive++;
        break;
      case '逆向':
        dist.negative++;
        break;
      case '边界':
        dist.boundary++;
        break;
      case '性能':
        dist.performance++;
        break;
      case '安全':
        dist.security++;
        break;
    }
  }

  return dist;
}

/** 检测质量缺口 */
function detectGaps(
  testCases: Record<string, unknown>[],
  featurePoints: Record<string, unknown>[],
): QualityGap[] {
  const gaps: QualityGap[] = [];

  // 按功能点ID分组用例
  const casesByFeature = new Map<string, Record<string, unknown>[]>();
  for (const tc of testCases) {
    const fpId = tc.feature_point_id as string;
    if (fpId) {
      if (!casesByFeature.has(fpId)) casesByFeature.set(fpId, []);
      casesByFeature.get(fpId)!.push(tc);
    }
  }

  for (const fp of featurePoints) {
    const fpId = fp.id as string;
    const fpName = (fp.name as string) ?? fpId;
    const fpCategory = (fp.category as string) ?? '';
    const cases = casesByFeature.get(fpId) ?? [];

    // 检测：无任何用例覆盖
    if (cases.length === 0) {
      gaps.push({
        feature_id: fpId,
        feature_name: fpName,
        issue: '无测试用例覆盖',
        severity: 'high',
        suggestion: `为 ${fpName} 添加测试用例`,
      });
      continue;
    }

    // 检测：正向功能缺少 P1/P2 用例
    if (fpCategory === '正向功能') {
      const hasP1P2 = cases.some(
        (tc) => tc.priority === 'P1' || tc.priority === 'P2',
      );
      if (!hasP1P2) {
        gaps.push({
          feature_id: fpId,
          feature_name: fpName,
          issue: '正向功能缺少 P1/P2 优先级用例',
          severity: 'high',
          suggestion: `为 ${fpName} 添加 P1 或 P2 优先级的正向测试用例`,
        });
      }
    }

    // 检测：边界条件缺少边界用例
    if (fpCategory === '边界条件') {
      const hasBoundary = cases.some((tc) => tc.type === '边界');
      if (!hasBoundary) {
        gaps.push({
          feature_id: fpId,
          feature_name: fpName,
          issue: '边界条件缺少边界值测试',
          severity: 'high',
          suggestion: `为 ${fpName} 添加边界值测试用例 (P4)`,
        });
      }
    }

    // 检测：异常处理缺少逆向用例
    if (fpCategory === '异常处理') {
      const hasNegative = cases.some(
        (tc) => tc.type === '逆向' || tc.type === '边界',
      );
      if (!hasNegative) {
        gaps.push({
          feature_id: fpId,
          feature_name: fpName,
          issue: '异常处理缺少逆向测试',
          severity: 'medium',
          suggestion: `为 ${fpName} 添加异常场景测试用例 (P3)`,
        });
      }
    }

    // 检测：安全相关缺少安全用例
    if (fpCategory === '安全相关') {
      const hasSecurity = cases.some((tc) => tc.type === '安全');
      if (!hasSecurity) {
        gaps.push({
          feature_id: fpId,
          feature_name: fpName,
          issue: '安全相关缺少安全测试',
          severity: 'high',
          suggestion: `为 ${fpName} 添加安全测试用例`,
        });
      }
    }
  }

  return gaps;
}

/** 生成改进建议 */
function generateRecommendations(
  coverage: CoverageMetrics,
  priorityDist: PriorityDistribution,
  gaps: QualityGap[],
): string[] {
  const recommendations: string[] = [];

  // 覆盖率建议
  if (coverage.valid_equivalence < 0.95) {
    recommendations.push(
      `有效等价类覆盖率 ${Math.round(coverage.valid_equivalence * 100)}% 低于目标 95%，建议补充正向测试用例`,
    );
  }
  if (coverage.invalid_equivalence < 0.8) {
    recommendations.push(
      `无效等价类覆盖率 ${Math.round(coverage.invalid_equivalence * 100)}% 低于目标 80%，建议补充异常处理测试用例`,
    );
  }
  if (coverage.boundary_value < 0.9) {
    recommendations.push(
      `边界值覆盖率 ${Math.round(coverage.boundary_value * 100)}% 低于目标 90%，建议补充边界条件测试`,
    );
  }

  // 分布建议
  const total = priorityDist.total;
  if (total > 0) {
    const p1Pct = (priorityDist.p1_count / total) * 100;
    const p3Pct = (priorityDist.p3_count / total) * 100;

    if (p1Pct < 20) {
      recommendations.push(
        `P1 用例占比 ${Math.round(p1Pct)}% 低于目标 27%，建议增加核心功能测试`,
      );
    }
    if (p3Pct < 25) {
      recommendations.push(
        `P3 用例占比 ${Math.round(p3Pct)}% 低于目标 33%，建议增加异常处理测试`,
      );
    }
  }

  // 缺口建议（取前5个高优先级）
  const highSeverityGaps = gaps.filter((g) => g.severity === 'high').slice(0, 5);
  for (const gap of highSeverityGaps) {
    recommendations.push(`[${gap.feature_id}] ${gap.suggestion}`);
  }

  return recommendations;
}

/** 计算综合质量评分 (0-100) */
function calculateScore(
  coverage: CoverageMetrics,
  priorityDist: PriorityDistribution,
  gaps: QualityGap[],
  totalFeatures: number,
): number {
  // 覆盖率得分 (40%)
  const coverageScore =
    ((coverage.valid_equivalence +
      coverage.invalid_equivalence +
      coverage.boundary_value) /
      3) *
    100;

  // 分布得分 (30%)
  const total = priorityDist.total;
  let distributionScore = 0;
  if (total > 0) {
    const targets: Record<string, number> = {
      P1: 0.27,
      P2: 0.2,
      P3: 0.33,
      P4: 0.16,
      P5: 0.04,
    };
    const actuals: Record<string, number> = {
      P1: priorityDist.p1_count / total,
      P2: priorityDist.p2_count / total,
      P3: priorityDist.p3_count / total,
      P4: priorityDist.p4_count / total,
      P5: priorityDist.p5_count / total,
    };
    const deviation = Object.keys(targets).reduce(
      (sum, p) => sum + Math.abs(actuals[p] - targets[p]),
      0,
    );
    distributionScore = Math.max(0, 100 - deviation * 200);
  }

  // 完整性得分 (30%)
  let completenessScore = 100;
  if (totalFeatures > 0) {
    completenessScore = (1 - gaps.length / totalFeatures) * 100;
  }

  const score =
    coverageScore * 0.4 + distributionScore * 0.3 + completenessScore * 0.3;

  return Math.round(score * 10) / 10;
}
