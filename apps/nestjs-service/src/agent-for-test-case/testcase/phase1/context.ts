/**
 * Context extraction for Phase 1 → Phase 2 transition
 * (TypeScript port of phase1/context.py).
 *
 * Implements the incremental concatenation mechanism:
 *  - Extract supplementary agreements from Phase 1 conversation
 *  - Preserve original requirement details
 *  - Combine into complete test context for Phase 2
 */

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';

// ==================== Delta Context Prompt ====================

const DELTA_CONTEXT_PROMPT = `# 任务：提取补充约定

你是一个专业的测试需求分析师。请分析以下对话历史，**只提取用户在对话中补充的额外约定**。

## 对话历史

{conversation_history}

## 输出要求

⚠️ **重要**：只输出用户在对话中**补充**的内容，不要重复原始需求文档的内容！

请输出：
1. **补充约定**：用户在对话中补充的特殊要求（如特定浏览器兼容性、性能指标等）
2. **测试约束**：用户明确指定的测试范围、优先级调整等
3. **注意事项**：用户特别强调需要关注的点

## 输出格式

直接输出 Markdown 格式，如果没有补充约定则输出"无特殊补充"。
`;

// ==================== Helper Functions ====================

interface RawMessage {
  _getType?: () => string;
  type?: string;
  role?: string;
  content?: string;
}

/**
 * 格式化对话历史为文本（等价于 Python 的 format_conversation_history）
 */
function formatConversationHistory(messages: RawMessage[]): string {
  const lines: string[] = [];

  for (const msg of messages) {
    const msgType =
      msg._getType?.() ?? msg.type ?? msg.role ?? 'unknown';

    let role: string;
    if (msgType === 'human') {
      role = '用户';
    } else if (msgType === 'ai') {
      role = 'AI';
    } else {
      role = '系统';
    }

    let content = msg.content ?? String(msg);

    // 截断过长的内容
    if (content.length > 500) {
      content = content.slice(0, 500) + '...';
    }

    lines.push(`**${role}**: ${content}\n`);
  }

  return lines.join('\n');
}

// ==================== Core Functions ====================

/**
 * 从 Phase 1 对话中只提取补充约定（增量）
 * (Equivalent to Python's extract_delta_context)
 *
 * @param checkpointer LangGraph MemorySaver 实例
 * @param sessionId    会话 ID（对应 thread_id）
 * @returns delta_context 只有补充约定的增量上下文
 */
export async function extractDeltaContext(
  checkpointer: MemorySaver,
  sessionId: string,
): Promise<string> {
  // 1. 获取对话历史
  let messages: RawMessage[] = [];

  try {
    const config = { configurable: { thread_id: sessionId } };
    const checkpointTuple = await checkpointer.getTuple(config);

    if (checkpointTuple) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const channelValues = (checkpointTuple.checkpoint as any)
        ?.channel_values ?? {};
      const rawMessages = channelValues.messages;
      if (Array.isArray(rawMessages)) {
        messages = rawMessages as RawMessage[];
      }
    }
  } catch (e) {
    console.warn(`[Context] Failed to get conversation history: ${e}`);
    return '';
  }

  if (messages.length === 0) {
    console.warn(`[Context] No messages found for session: ${sessionId}`);
    return '';
  }

  // 2. 格式化对话历史
  const conversationText = formatConversationHistory(messages);

  // 3. 调用 LLM 只提取增量（补充约定）
  const model = new ChatOpenAI({
    model: process.env.DASHSCOPE_LLM_MODEL ?? 'qwen-plus',
    apiKey: process.env.DASHSCOPE_API_KEY,
    configuration: {
      baseURL: process.env.DASHSCOPE_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    },
  });

  const prompt = DELTA_CONTEXT_PROMPT.replace(
    '{conversation_history}',
    conversationText,
  );

  try {
    const response = await model.invoke([new HumanMessage(prompt)]);
    const deltaContext = response.content as string;

    console.log(
      `[Context] Extracted delta context for session ${sessionId}: ${deltaContext.length} chars`,
    );

    return deltaContext;
  } catch (e) {
    console.error(`[Context] Failed to extract delta: ${e}`);
    return '';
  }
}

/**
 * 获取用于 Phase 2 生成的完整上下文（增量拼接）
 * (Equivalent to Python's get_full_context_for_generation)
 *
 * Core improvement: preserve the original requirement document in full,
 * only append supplementary agreements at the end.
 *
 * @param checkpointer       LangGraph MemorySaver 实例
 * @param sessionId          会话 ID
 * @param originalRequirement 原始需求文档（保留完整细节）
 * @returns 完整的测试上下文 = 原始需求 + 补充约定
 */
export async function getFullContextForGeneration(
  checkpointer: MemorySaver,
  sessionId: string,
  originalRequirement: string = '',
): Promise<string> {
  // 提取增量（补充约定）
  const deltaContext = await extractDeltaContext(checkpointer, sessionId);

  // 增量拼接：保留原始需求 + 追加补充约定
  if (originalRequirement && deltaContext) {
    // 过滤掉"无特殊补充"这类空内容
    if (
      deltaContext.includes('无特殊补充') ||
      deltaContext.trim().length < 10
    ) {
      console.log(`[Context] No delta context, using original only`);
      return `## 核心需求文档\n\n${originalRequirement}`;
    }

    console.log(
      `[Context] Combined context: original=${originalRequirement.length} chars, delta=${deltaContext.length} chars`,
    );

    return `## 核心需求文档\n\n${originalRequirement}\n\n---\n\n## 补充约定与测试约束（来自对话）\n\n${deltaContext}\n`;
  }

  // Fallback 1: 只有原始需求
  if (originalRequirement) {
    console.log(`[Context] Using original requirement only`);
    return `## 核心需求文档\n\n${originalRequirement}`;
  }

  // Fallback 2: 只有增量
  if (deltaContext) {
    console.warn(`[Context] No original requirement, using delta only`);
    return deltaContext;
  }

  return '';
}
