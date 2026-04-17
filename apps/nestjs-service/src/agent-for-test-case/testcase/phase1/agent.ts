/**
 * Deep Agent implementation for Phase 1 (Requirement Clarification)
 * (TypeScript port of phase1/agent.py).
 *
 * Creates a LangGraph ReAct agent with HITL (Human-in-the-Loop) support
 * using the confirm_features tool.
 */

import * as fs from 'fs';
import * as path from 'path';

import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';

import { confirmFeaturesTool } from './tools';
import { getSessionManager } from './session-manager';

// Base directory is the `testcase/` folder (parent of phase1/)
const BASE_DIR = path.resolve(__dirname, '..');

// ==================== System Prompt ====================

const PHASE1_SYSTEM_PROMPT = `# 测试需求澄清助手

## 你的任务

1. 分析用户提供的 Markdown 需求文档
2. 使用 feature-extraction skill 提取功能点
3. 调用 \`confirm_features\` 工具触发用户确认
4. 根据用户反馈调整功能点列表

## 重要提示

- 当你完成功能点提取后，**必须**调用 \`confirm_features\` 工具
- 这会暂停执行，等待用户确认
- 用户可以：approve（批准）、edit（修改）、reject（拒绝重新提取）

## 处理用户决策

### approve
用户批准功能点，回复确认成功即可。

### edit
用户提供了修改后的功能点（\`args.feature_points\`），使用修改版本并回复确认。

### reject
- 如果 \`decisions[0]\` 包含 \`user_feedback\` 字段：  
  说明用户针对当前功能点提出了具体修改意见。请：
  1. 以 \`current_features\` 中的现有功能点为基础
  2. 根据 \`user_feedback\` 的描述对功能点进行增、删、改
  3. 调整完成后再次调用 \`confirm_features\` 工具让用户确认新的功能点列表
- 如果 \`decisions[0]\` **不包含** \`user_feedback\`：  
  说明用户希望全重新提取，请从需求文档重新分析并调用 \`confirm_features\`。

## 功能点提取原则

1. **原子性**：每个功能点应是可独立测试的最小单元
2. **可验证性**：每个功能点必须有明确的验证方式
3. **完整性**：覆盖所有需求描述的功能
4. **无冗余**：功能点之间不应有重叠

## 功能点分类

- **正向功能**：正常使用场景
- **边界条件**：边界值、极限值
- **异常处理**：错误输入、异常状态
- **性能相关**：响应时间、并发
- **安全相关**：权限、数据安全

## 优先级定义

- **P1**：核心功能，阻塞发布
- **P2**：重要功能，应该测试
- **P3**：异常处理，必须覆盖
- **P4**：边界条件，建议测试
- **P5**：低频场景，可选测试
`;

// ==================== Skill / Memory Loading ====================

/**
 * 加载技能内容（跳过 YAML frontmatter）
 */
function loadSkillContent(skillName: string): string {
  const skillPath = path.join(
    BASE_DIR,
    'shared',
    'skills',
    skillName,
    'SKILL.md',
  );

  try {
    let content = fs.readFileSync(skillPath, 'utf-8');

    // Remove YAML frontmatter (--- ... ---)
    if (content.startsWith('---')) {
      const parts = content.split('---');
      if (parts.length >= 3) {
        content = parts.slice(2).join('---').trim();
      }
    }

    console.log(
      `[Phase1] Loaded skill: ${skillName} (${content.length} chars)`,
    );
    return content;
  } catch {
    console.warn(`[Phase1] Skill not found: ${skillPath}`);
    return `Skill '${skillName}' not found.`;
  }
}

/**
 * 加载 AGENTS.md 内容（项目级规范）
 */
function loadAgentsMemory(): string {
  const agentsPath = path.join(BASE_DIR, 'AGENTS.md');
  try {
    return fs.readFileSync(agentsPath, 'utf-8');
  } catch {
    console.warn(`[Phase1] AGENTS.md not found at ${agentsPath}`);
    return '';
  }
}

// ==================== Agent Factory ====================

/**
 * 创建 Phase 1 需求澄清 Agent（使用 HITL）
 *
 * Equivalent to Python's create_chat_agent(). Uses createReactAgent from
 * @langchain/langgraph/prebuilt as a drop-in for deepagents.create_deep_agent().
 *
 * @param projectId   项目 ID
 * @param checkpointer LangGraph checkpointer（用于会话持久化）
 */
export function createChatAgent(
  projectId: number = 0,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  checkpointer?: any,
) {
  // Use DashScope API configuration (same as memory-chat.agent.ts)
  const modelName = process.env.DASHSCOPE_LLM_MODEL ?? 'qwen-plus';
  const baseUrl = process.env.DASHSCOPE_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  const apiKey = process.env.DASHSCOPE_API_KEY;

  const model = new ChatOpenAI({
    model: modelName,
    apiKey,
    configuration: { baseURL: baseUrl },
    temperature: 0.7,
    streaming: true,
  });

  console.log(
    `[Phase1] Using model: ${modelName}, base_url: ${baseUrl}`,
  );

  // Build full system prompt: AGENTS.md + phase1 instructions + feature-extraction skill
  const agentsMemory = loadAgentsMemory();
  const skillContent = loadSkillContent('feature-extraction');
  const fullSystemPrompt = [
    agentsMemory,
    PHASE1_SYSTEM_PROMPT,
    '## 功能点提取技能 (feature-extraction)\n\n' + skillContent,
  ]
    .filter(Boolean)
    .join('\n\n---\n\n');

  const agent = createReactAgent({
    llm: model,
    tools: [confirmFeaturesTool],
    checkpointSaver: checkpointer,
    prompt: fullSystemPrompt,
  });

  console.log(`[Phase1] Created chat agent for project ${projectId}`);
  return agent;
}

/**
 * 获取或创建 Phase 1 聊天 Agent
 *
 * Uses the shared MemorySaver checkpointer; thread_id = session_id
 * to differentiate sessions (same as Python implementation).
 *
 * @param sessionId 会话 ID
 * @param projectId 项目 ID
 * @returns [agent, config]
 */
export async function getChatAgent(
  sessionId: string,
  projectId: number = 0,
): Promise<[ReturnType<typeof createChatAgent>, Record<string, unknown>]> {
  const sessionManager = getSessionManager();
  let sessionInfo = await sessionManager.getSession(sessionId);

  if (!sessionInfo) {
    // 会话不存在，创建新会话
    const newId = await sessionManager.createSession(projectId);
    sessionInfo = await sessionManager.getSession(newId);
    // Use the newly created session ID
  }

  // Shared checkpointer; thread_id differentiates sessions
  const checkpointer = sessionManager.getCheckpointer();

  const agent = createChatAgent(projectId, checkpointer);

  // config: thread_id = session_id
  const config = { configurable: { thread_id: sessionId } };

  return [agent, config];
}
