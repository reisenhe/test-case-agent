/**
 * TypeScript models for TestCase Agent (port of shared/models.py).
 *
 * Pydantic BaseModel → TypeScript interface / class with runtime validation skipped
 * (Zod schemas can be added on top if needed).
 */

// ==================== 优先级定义 ====================

export type PriorityLevel = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

// ==================== 功能点模型 ====================

export interface InputParameter {
  name: string;
  type: string;
  required: boolean;
  constraints?: string | null;
}

export interface FeaturePoint {
  /** 功能点 ID，如 FP-001 */
  id: string;
  /** 关联需求 ID */
  requirement_id?: string | null;
  /** 功能名称 */
  name: string;
  /** 功能点分类 */
  category: '正向功能' | '边界条件' | '异常处理' | '性能相关' | '安全相关';
  /** 详细描述 */
  description: string;
  /** 前置条件 */
  preconditions: string[];
  /** 输入参数（可选，用于更精细的测试生成） */
  input_parameters?: InputParameter[];
  /** 测试建议 */
  test_suggestions: string[];
  /** 优先级 P1-P5 */
  priority: PriorityLevel;
}

export interface FeatureExtractionOutput {
  feature_points: FeaturePoint[];
  is_final: boolean;
  summary: string;
}

// ==================== 测试用例模型 ====================

export interface TestStep {
  step_no: number;
  action: string;
  test_data: string;
  expected_result: string;
}

export interface TestCase {
  /** 用例 ID，如 TC-001 */
  id: string;
  /** 关联功能点 ID */
  feature_point_id: string;
  /** 用例标题 */
  title: string;
  /** 测试目的 */
  purpose: string;
  /** 优先级 P1-P5 */
  priority: PriorityLevel;
  /** 用例类型 */
  type: '正向' | '逆向' | '边界' | '性能' | '安全';
  /** 前置条件 */
  preconditions: string[];
  /** 测试步骤 */
  steps: TestStep[];
  /** 后置条件 */
  postconditions: string[];
  /** 标签 */
  tags: string[];
  /** 用例状态 */
  status: 'pending' | 'passed' | 'failed' | 'blocked';
}

export interface TestCaseGenerationOutput {
  test_cases: TestCase[];
}

// ==================== API 请求/响应模型 ====================

export interface StartSessionRequest {
  project_id?: number;
}

export interface ChatRequest {
  message: string;
  project_id?: number;
}

export interface ResumeRequest {
  decision: 'approve' | 'edit' | 'reject';
  modified_features?: FeaturePoint[] | null;
}

export interface StartGenerationRequest {
  session_id: string;
  feature_points: Record<string, unknown>[];
  requirement_content?: string;
  max_concurrent?: number;
}

export interface SaveRequest {
  project_id: number;
  module_id?: number;
  create_user?: string;
}

// ==================== 任务状态模型 ====================

export type TaskStatusType = 'pending' | 'processing' | 'completed' | 'failed';

export interface TaskStatus {
  task_id: string;
  status: TaskStatusType;
  progress: number;
  total: number;
  current_feature?: string | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
  created_at: Date;
}

// ==================== SSE 事件模型 ====================

export type SSEEventType =
  | 'token'
  | 'tool_start'
  | 'hitl_interrupt'
  | 'done'
  | 'error';

export interface SSEEvent {
  type: SSEEventType;
  content?: string | null;
  tool?: string | null;
  feature_points?: Record<string, unknown>[] | null;
  allowed_decisions?: string[] | null;
  message?: string | null;
}

// ==================== 覆盖率统计模型 ====================

export interface CoverageTargetResult {
  current: number;
  target: number;
  met: boolean;
}

export class CoverageMetrics {
  /** 有效等价类覆盖率 (目标: 95%) */
  valid_equivalence: number;
  /** 无效等价类覆盖率 (目标: 80%) */
  invalid_equivalence: number;
  /** 边界值覆盖率 (目标: 90%) */
  boundary_value: number;

  constructor(data: {
    valid_equivalence: number;
    invalid_equivalence: number;
    boundary_value: number;
  }) {
    this.valid_equivalence = data.valid_equivalence;
    this.invalid_equivalence = data.invalid_equivalence;
    this.boundary_value = data.boundary_value;
  }

  checkTargets(): Record<string, CoverageTargetResult> {
    return {
      valid_equivalence: {
        current: this.valid_equivalence,
        target: 0.95,
        met: this.valid_equivalence >= 0.95,
      },
      invalid_equivalence: {
        current: this.invalid_equivalence,
        target: 0.80,
        met: this.invalid_equivalence >= 0.80,
      },
      boundary_value: {
        current: this.boundary_value,
        target: 0.90,
        met: this.boundary_value >= 0.90,
      },
    };
  }

  toJSON() {
    return {
      valid_equivalence: this.valid_equivalence,
      invalid_equivalence: this.invalid_equivalence,
      boundary_value: this.boundary_value,
    };
  }
}

export class PriorityDistribution {
  /** P1 核心正向数量 (目标: ~27%) */
  p1_count: number = 0;
  /** P2 基本正向数量 (目标: ~20%) */
  p2_count: number = 0;
  /** P3 核心异常数量 (目标: ~33%) */
  p3_count: number = 0;
  /** P4 边界条件数量 (目标: ~16%) */
  p4_count: number = 0;
  /** P5 低频场景数量 (目标: ~4%) */
  p5_count: number = 0;

  get total(): number {
    return (
      this.p1_count +
      this.p2_count +
      this.p3_count +
      this.p4_count +
      this.p5_count
    );
  }

  toPercentages(): Record<string, string> {
    if (this.total === 0) {
      return { P1: '0%', P2: '0%', P3: '0%', P4: '0%', P5: '0%' };
    }
    return {
      P1: `${Math.round((this.p1_count / this.total) * 100)}%`,
      P2: `${Math.round((this.p2_count / this.total) * 100)}%`,
      P3: `${Math.round((this.p3_count / this.total) * 100)}%`,
      P4: `${Math.round((this.p4_count / this.total) * 100)}%`,
      P5: `${Math.round((this.p5_count / this.total) * 100)}%`,
    };
  }

  checkTargets(): Record<string, unknown> {
    if (this.total === 0) return {};
    return {
      P1: {
        count: this.p1_count,
        percentage: `${Math.round((this.p1_count / this.total) * 100)}%`,
        target: '~27%',
      },
      P2: {
        count: this.p2_count,
        percentage: `${Math.round((this.p2_count / this.total) * 100)}%`,
        target: '~20%',
      },
      P3: {
        count: this.p3_count,
        percentage: `${Math.round((this.p3_count / this.total) * 100)}%`,
        target: '~33%',
      },
      P4: {
        count: this.p4_count,
        percentage: `${Math.round((this.p4_count / this.total) * 100)}%`,
        target: '~16%',
      },
      P5: {
        count: this.p5_count,
        percentage: `${Math.round((this.p5_count / this.total) * 100)}%`,
        target: '~4%',
      },
    };
  }

  toJSON() {
    return {
      p1_count: this.p1_count,
      p2_count: this.p2_count,
      p3_count: this.p3_count,
      p4_count: this.p4_count,
      p5_count: this.p5_count,
    };
  }
}

export class TypeDistribution {
  positive: number = 0;
  negative: number = 0;
  boundary: number = 0;
  performance: number = 0;
  security: number = 0;

  get total(): number {
    return (
      this.positive +
      this.negative +
      this.boundary +
      this.performance +
      this.security
    );
  }

  toJSON() {
    return {
      positive: this.positive,
      negative: this.negative,
      boundary: this.boundary,
      performance: this.performance,
      security: this.security,
    };
  }
}

export interface QualityGap {
  feature_id: string;
  feature_name: string;
  issue: string;
  severity: 'high' | 'medium' | 'low';
  suggestion: string;
}

export interface QualityReport {
  summary: Record<string, unknown>;
  coverage: CoverageMetrics;
  priority_distribution: PriorityDistribution;
  type_distribution: TypeDistribution;
  gaps: QualityGap[];
  recommendations: string[];
  score: number;
}
