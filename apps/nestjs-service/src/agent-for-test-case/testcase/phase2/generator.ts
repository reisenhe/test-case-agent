/**
 * Parallel Test Case Generator for Phase 2
 * (TypeScript port of phase2/generator.py).
 *
 * Engineering-grade parallel generation with:
 *  - Task-level semaphore isolation (equivalent to asyncio.Semaphore)
 *  - Independent LLM instances per feature
 *  - Memory aggregation via MemoryPool
 *  - Skill-based generation (SKILL.md loaded on-demand)
 *  - Retry with exponential backoff (replaces tenacity)
 */

import * as fs from 'fs';
import * as path from 'path';

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';

import { MemoryPool } from './memory-pool';

// Base directory: testcase/
const BASE_DIR = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(BASE_DIR, 'shared', 'skills');

// ==================== Semaphore ====================

/**
 * Async semaphore (equivalent to asyncio.Semaphore)
 */
class AsyncSemaphore {
  private _permits: number;
  private _waiting: Array<() => void> = [];

  constructor(permits: number) {
    this._permits = permits;
  }

  async acquire(): Promise<void> {
    if (this._permits > 0) {
      this._permits--;
      return;
    }
    return new Promise<void>((resolve) => this._waiting.push(resolve));
  }

  release(): void {
    if (this._waiting.length > 0) {
      const next = this._waiting.shift()!;
      next();
    } else {
      this._permits++;
    }
  }

  async use<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// ==================== Skill Loader ====================

/**
 * Skills loader – loads SKILL.md files on demand with caching.
 * (Equivalent to Python's SkillLoader class)
 */
export class SkillLoader {
  private _cache: Map<string, string> = new Map();
  private readonly skillsDir: string;

  constructor(skillsDir: string = SKILLS_DIR) {
    this.skillsDir = skillsDir;
  }

  /**
   * 加载指定 skill 的完整内容（跳过 YAML frontmatter）
   */
  loadSkill(skillName: string): string {
    if (this._cache.has(skillName)) {
      return this._cache.get(skillName)!;
    }

    const skillPath = path.join(this.skillsDir, skillName, 'SKILL.md');

    if (!fs.existsSync(skillPath)) {
      console.warn(`[SkillLoader] Skill not found: ${skillPath}`);
      return `Skill '${skillName}' not found.`;
    }

    let content = fs.readFileSync(skillPath, 'utf-8');

    // Remove YAML frontmatter (--- ... ---)
    if (content.startsWith('---')) {
      const parts = content.split('---');
      if (parts.length >= 3) {
        content = parts.slice(2).join('---').trim();
      }
    }

    this._cache.set(skillName, content);
    console.log(
      `[SkillLoader] Loaded skill: ${skillName} (${content.length} chars)`,
    );
    return content;
  }

  /**
   * 列出所有可用的 skills
   */
  listAvailableSkills(): string[] {
    if (!fs.existsSync(this.skillsDir)) return [];

    return fs
      .readdirSync(this.skillsDir, { withFileTypes: true })
      .filter(
        (d) =>
          d.isDirectory() &&
          fs.existsSync(path.join(this.skillsDir, d.name, 'SKILL.md')),
      )
      .map((d) => d.name);
  }

  /**
   * 获取 skill 的简短描述（从 frontmatter 中提取）
   */
  getSkillDescription(skillName: string): string {
    const skillPath = path.join(this.skillsDir, skillName, 'SKILL.md');
    if (!fs.existsSync(skillPath)) return '';

    const content = fs.readFileSync(skillPath, 'utf-8');
    if (content.startsWith('---')) {
      const parts = content.split('---');
      if (parts.length >= 2) {
        for (const line of parts[1].split('\n')) {
          if (line.startsWith('description:')) {
            return line.split(':', 2)[1].trim();
          }
        }
      }
    }
    return '';
  }

  /** 清空 skill 缓存（用于热更新） */
  clearCache(): void {
    this._cache.clear();
  }
}

/** 全局 SkillLoader 实例 */
export const skillLoader = new SkillLoader();

// ==================== Generator Prompts ====================

const GENERATOR_BASE_PROMPT = `# 测试用例生成器

你是专业的测试用例生成器。根据给定的功能点和全局上下文生成详细、高质量的测试用例。

## ⚠️ 重要规则

1. **只输出 JSON**：严格按照提供的 JSON Schema 输出，不要输出任何其他内容
2. **遵守全局约束**：全局上下文中提到的所有约定必须体现在测试用例中
3. **满足覆盖率目标**：确保生成的用例达到覆盖率要求
4. **遵循 Skill 指导**：严格按照加载的 skill 内容生成用例

## 输出格式

必须输出以下 JSON 格式：
\`\`\`json
{
  "test_cases": [
    {
      "id": "TC-FP-XXX-001",
      "feature_point_id": "FP-XXX",
      "title": "用例标题",
      "purpose": "测试目的",
      "priority": "P1",
      "type": "正向",
      "preconditions": ["前置条件1"],
      "steps": [
        {"step_no": 1, "action": "操作描述", "test_data": "具体数据", "expected_result": "可验证结果"}
      ],
      "postconditions": ["后置条件1"],
      "tags": ["标签1"]
    }
  ]
}
\`\`\`
`;

/**
 * 构建生成器提示词（可选择是否包含 skill 内容）
 */
function buildGeneratorPrompt(includeSkill: boolean = true): string {
  let prompt = GENERATOR_BASE_PROMPT;

  if (includeSkill) {
    const skillContent = skillLoader.loadSkill('test-case-generation');
    prompt += `\n\n## ==================== 测试用例生成 Skill ====================\n\n${skillContent}\n\n## ==================== Skill 内容结束 ====================\n\n`;
  }

  return prompt;
}

/** 预加载的完整提示词（包含 skill） */
let GENERATOR_SYSTEM_PROMPT = buildGeneratorPrompt(true);

// ==================== Retry Utility ====================

/**
 * 带指数退避的重试逻辑（替代 Python tenacity）
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 2000,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), 10000);
        console.warn(
          `[Generator] Attempt ${attempt} failed, retrying in ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// ==================== Test Case Generator ====================

export interface GenerationResult {
  testCases: Record<string, unknown>[];
  totalFeatures: number;
  successCount: number;
  failureCount: number;
  errors: Array<{ featureId: string; error: string }>;
}

interface SingleFeatureResult {
  featureId: string;
  testCases: Record<string, unknown>[];
  success: boolean;
  error?: string;
}

/**
 * 并发生成器（任务级信号量隔离）
 * (TypeScript port of Python's TestCaseGenerator class)
 */
export class TestCaseGenerator {
  private readonly maxConcurrent: number;
  private readonly _memoryPool: MemoryPool;

  constructor(maxConcurrent: number = 10) {
    this.maxConcurrent = maxConcurrent;
    this._memoryPool = new MemoryPool();

    // 预加载 skill 以验证可用性
    const availableSkills = skillLoader.listAvailableSkills();
    console.log(`[Generator] Available skills: ${availableSkills.join(', ')}`);
  }

  /**
   * 并发生成测试用例（等价于 Python 的 generate_parallel）
   *
   * @param featurePoints   功能点列表
   * @param globalContext   完整的测试上下文（增量拼接）
   * @param progressCallback 进度回调
   */
  async generateParallel(
    featurePoints: Record<string, unknown>[],
    globalContext: string,
    progressCallback?: (
      completed: number,
      total: number,
      featureId: string,
    ) => Promise<void>,
  ): Promise<GenerationResult> {
    // 任务级信号量（避免全局死锁）
    const semaphore = new AsyncSemaphore(this.maxConcurrent);

    const allTestCases: Record<string, unknown>[] = [];
    const errors: Array<{ featureId: string; error: string }> = [];
    const total = featurePoints.length;
    let completed = 0;

    console.log(
      `[Generator] Starting parallel generation: ${total} features, max_concurrent=${this.maxConcurrent}`,
    );

    // Create all tasks
    const tasks = featurePoints.map((fp) =>
      this._generateSingleFeature(fp, globalContext, semaphore),
    );

    // Process as completed (equivalent to asyncio.as_completed)
    await Promise.all(
      tasks.map(async (taskPromise) => {
        const result = await taskPromise;
        completed++;

        if (result.success) {
          allTestCases.push(...result.testCases);
        } else {
          errors.push({ featureId: result.featureId, error: result.error! });
        }

        if (progressCallback) {
          await progressCallback(completed, total, result.featureId);
        }
      }),
    );

    const successCount = total - errors.length;

    console.log(
      `[Generator] Complete: ${successCount}/${total} success, ${allTestCases.length} cases`,
    );

    return {
      testCases: allTestCases,
      totalFeatures: total,
      successCount,
      failureCount: errors.length,
      errors,
    };
  }

  /**
   * 生成单个功能点的测试用例（带重试）
   * (Equivalent to Python's _generate_single_feature with @retry decorator)
   */
  private async _generateSingleFeature(
    featurePoint: Record<string, unknown>,
    globalContext: string,
    semaphore: AsyncSemaphore,
  ): Promise<SingleFeatureResult> {
    const featureId = (featurePoint.id as string) ?? 'unknown';

    return semaphore.use(() =>
      withRetry(async () => {
        try {
          console.log(`[Generator] Starting: ${featureId}`);

          const model = this._createModel();

          const inputParameters = this._formatInputParameters(
            (featurePoint.input_parameters as Record<string, unknown>[]) ?? [],
          );

          const prompt = `${GENERATOR_SYSTEM_PROMPT}

## 全局测试上下文

${globalContext}

---

## 当前目标功能点

- ID: ${featureId}
- 名称: ${featurePoint.name ?? ''}
- 分类: ${featurePoint.category ?? ''}
- 描述: ${featurePoint.description ?? ''}
- 优先级: ${featurePoint.priority ?? ''}
- 前置条件: ${((featurePoint.preconditions as string[]) ?? []).join(', ') || '无'}
- 测试建议: ${((featurePoint.test_suggestions as string[]) ?? []).join(', ')}

## 输入参数（如有）

${inputParameters}

## 生成要求

**重要**：
1. 严格按照上方 Skill 中的生成规则生成用例
2. 只输出 JSON 格式，不要输出任何其他内容
3. 每个测试用例的 feature_point_id 必须是 "${featureId}"
4. 优先级必须使用 P1-P5（不要使用 P0）
5. 测试数据使用具体值（如 "testuser" 而非 "用户名"）
`;

          const response = await model.invoke([new HumanMessage(prompt)]);
          const content = response.content as string;

          // 解析 JSON 输出
          const testCases = this._parseJsonOutput(content, featureId);

          if (testCases.length === 0) {
            throw new Error('Failed to parse test cases from output');
          }

          console.log(
            `[Generator] Success: ${featureId} -> ${testCases.length} cases`,
          );

          return {
            featureId,
            testCases,
            success: true,
          };
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          console.error(`[Generator] Failed: ${featureId} -> ${errMsg}`);
          return {
            featureId,
            testCases: [],
            success: false,
            error: errMsg,
          };
        }
      }),
    );
  }

  /** 创建 LLM 模型实例 */
  private _createModel(): ChatOpenAI {
    return new ChatOpenAI({
      model: process.env.DASHSCOPE_LLM_MODEL ?? 'qwen-plus',
      apiKey: process.env.DASHSCOPE_API_KEY,
      configuration: {
        baseURL: process.env.DASHSCOPE_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      },
      temperature: 0.7,
      streaming: true,
    });
  }

  /**
   * 格式化输入参数信息
   */
  private _formatInputParameters(
    inputParameters: Record<string, unknown>[],
  ): string {
    if (!inputParameters || inputParameters.length === 0) {
      return '（未提供输入参数信息，请根据功能描述自行识别）';
    }

    return inputParameters
      .map((param) => {
        const name = (param.name as string) ?? '未知参数';
        const ptype = (param.type as string) ?? '未知类型';
        const required = param.required ? '必填' : '可选';
        const constraints = (param.constraints as string) ?? '无限制';
        return `- **${name}** (${ptype}, ${required}): ${constraints}`;
      })
      .join('\n');
  }

  /**
   * 解析 LLM 输出的 JSON
   */
  private _parseJsonOutput(
    content: string,
    featureId: string,
  ): Record<string, unknown>[] {
    try {
      // 尝试提取 JSON 块
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;

      const data = JSON.parse(jsonStr.trim()) as Record<string, unknown>;

      let testCases: Record<string, unknown>[];
      if (data.test_cases && Array.isArray(data.test_cases)) {
        testCases = data.test_cases as Record<string, unknown>[];
      } else if (Array.isArray(data)) {
        testCases = data as unknown as Record<string, unknown>[];
      } else {
        console.warn(
          `[Generator] Unexpected JSON structure for ${featureId}`,
        );
        return [];
      }

      // 规范化测试用例
      return testCases.map((tc, i) => ({
        id: tc.id ?? `TC-${featureId}-${String(i + 1).padStart(3, '0')}`,
        feature_point_id: featureId,
        title: tc.title ?? `测试用例 ${i + 1}`,
        purpose: tc.purpose ?? tc.test_purpose ?? '',
        priority: tc.priority ?? 'P2',
        type: tc.type ?? '正向',
        preconditions: tc.preconditions ?? [],
        steps: tc.steps ?? [],
        postconditions: tc.postconditions ?? [],
        tags: tc.tags ?? [],
      }));
    } catch (e) {
      console.error(`[Generator] JSON parse error: ${e}`);
      // 宽松模式回退
      return this._extractTestCasesLoose(featureId);
    }
  }

  /**
   * 宽松模式提取测试用例（回退方案）
   */
  private _extractTestCasesLoose(
    featureId: string,
  ): Record<string, unknown>[] {
    console.warn(`[Generator] Using loose extraction for ${featureId}`);
    return [
      {
        id: `TC-${featureId}-001`,
        feature_point_id: featureId,
        title: `基本功能测试 - ${featureId}`,
        purpose: '验证基本功能是否正常工作',
        priority: 'P1',
        type: '正向',
        preconditions: ['系统正常运行', '用户已登录'],
        steps: [
          {
            step_no: 1,
            action: '执行基本操作',
            test_data: '',
            expected_result: '操作成功完成',
          },
        ],
        postconditions: ['系统状态正常'],
        tags: ['自动生成'],
      },
    ];
  }

  /** 获取内存统计 */
  getMemoryStats(): Record<string, number> {
    return this._memoryPool.getStats();
  }

  /**
   * 重新加载 skill 内容（用于热更新）
   */
  reloadSkill(): string {
    skillLoader.clearCache();
    GENERATOR_SYSTEM_PROMPT = buildGeneratorPrompt(true);
    console.log('[Generator] Skill reloaded');
    return GENERATOR_SYSTEM_PROMPT;
  }
}
