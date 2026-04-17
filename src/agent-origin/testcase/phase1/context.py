"""Context extraction for Phase 1 -> Phase 2 transition.

This module implements the incremental concatenation mechanism:
- Extract supplementary agreements from Phase 1 conversation
- Preserve original requirement details
- Combine into complete test context for Phase 2
"""

import os
from typing import Optional

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage
from loguru import logger


# 🆕 增量提取 Prompt (v5.3) - 只提取补充约定，不丢失原始细节
DELTA_CONTEXT_PROMPT = """# 任务：提取补充约定

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
"""


def format_conversation_history(messages: list) -> str:
    """
    格式化对话历史为文本

    Args:
        messages: 消息列表

    Returns:
        格式化的对话文本
    """
    lines = []

    for msg in messages:
        if isinstance(msg, HumanMessage):
            role = "用户"
            content = msg.content
        elif isinstance(msg, AIMessage):
            role = "AI"
            content = msg.content
        else:
            role = "系统"
            content = str(msg)

        # 截断过长的内容
        if len(content) > 500:
            content = content[:500] + "..."

        lines.append(f"**{role}**: {content}\n")

    return "\n".join(lines)


async def extract_delta_context(
    checkpointer,
    session_id: str,
) -> str:
    """
    🆕 v5.3: 从 Phase 1 对话中只提取补充约定（增量）

    Args:
        checkpointer: Checkpointer 实例
        session_id: 会话 ID

    Returns:
        delta_context: 只有补充约定的增量上下文（不含原始需求）
    """
    # 1. 获取对话历史
    try:
        config = {"configurable": {"thread_id": session_id}}

        # 使用 aget_tuple 获取完整的 checkpoint 信息
        checkpoint_tuple = await checkpointer.aget_tuple(config)

        messages = []
        if checkpoint_tuple:
            # checkpoint 结构: {"channel_values": {"messages": [...]}, ...}
            checkpoint = checkpoint_tuple.checkpoint
            if checkpoint and "channel_values" in checkpoint:
                channel_values = checkpoint["channel_values"]
                messages = channel_values.get("messages", [])

    except Exception as e:
        logger.warning(f"[Context] Failed to get conversation history: {e}")
        return ""

    if not messages:
        logger.warning(f"[Context] No messages found for session: {session_id}")
        return ""

    # 2. 格式化对话历史
    conversation_text = format_conversation_history(messages)

    # 3. 🆕 调用 LLM 只提取增量（补充约定）
    model = ChatOpenAI(
        model=os.getenv("OPENAI_LLM_MODEL", "gpt-4o"),
        openai_api_base=os.getenv("OPENAI_BASE_URL"),
    )

    prompt = DELTA_CONTEXT_PROMPT.format(conversation_history=conversation_text)

    try:
        response = await model.ainvoke([HumanMessage(content=prompt)])
        delta_context = response.content

        logger.info(
            f"[Context] Extracted delta context for session {session_id}: {len(delta_context)} chars"
        )

        return delta_context

    except Exception as e:
        logger.error(f"[Context] Failed to extract delta: {e}")
        return ""


async def get_full_context_for_generation(
    checkpointer,
    session_id: str,
    original_requirement: str = "",
) -> str:
    """
    🆕 v5.3: 获取用于 Phase 2 生成的完整上下文（增量拼接）

    核心改进：保留原始需求文档的完整细节，只在末尾追加补充约定

    Args:
        checkpointer: Checkpointer 实例
        session_id: 会话 ID
        original_requirement: 原始需求文档（必须传入，保留完整细节）

    Returns:
        完整的测试上下文 = 原始需求 + 补充约定
    """
    # 🆕 提取增量（补充约定）
    delta_context = await extract_delta_context(checkpointer, session_id)

    # 🆕 增量拼接：保留原始需求 + 追加补充约定
    if original_requirement and delta_context:
        # 过滤掉"无特殊补充"这类空内容
        if "无特殊补充" in delta_context or len(delta_context.strip()) < 10:
            logger.info(f"[Context] No delta context, using original only")
            return f"## 核心需求文档\n\n{original_requirement}"

        full_context = f"""## 核心需求文档

{original_requirement}

---

## 补充约定与测试约束（来自对话）

{delta_context}
"""
        logger.info(
            f"[Context] Combined context: original={len(original_requirement)} chars, delta={len(delta_context)} chars"
        )
        return full_context

    # Fallback 1: 只有原始需求
    if original_requirement:
        logger.info(f"[Context] Using original requirement only")
        return f"## 核心需求文档\n\n{original_requirement}"

    # Fallback 2: 只有增量（不太可能，但作为兜底）
    if delta_context:
        logger.warning(f"[Context] No original requirement, using delta only")
        return delta_context

    return ""
