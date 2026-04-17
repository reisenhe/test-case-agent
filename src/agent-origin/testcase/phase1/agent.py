"""Deep Agent implementation for Phase 1 (Requirement Clarification).

This module creates the DeepAgent with HITL (Human-in-the-Loop) support.
"""

import os
from pathlib import Path
from typing import Optional

from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend
from langchain_openai import ChatOpenAI
from loguru import logger

from .tools import confirm_features
from .session_manager import get_session_manager


# 获取当前目录
BASE_DIR = Path(__file__).parent.parent

# Phase 1 系统提示词
PHASE1_SYSTEM_PROMPT = """# 测试需求澄清助手

## 你的任务

1. 分析用户提供的 Markdown 需求文档
2. 使用 feature-extraction skill 提取功能点
3. 调用 `confirm_features` 工具触发用户确认
4. 根据用户反馈调整功能点列表

## 重要提示

- 当你完成功能点提取后，**必须**调用 `confirm_features` 工具
- 这会暂停执行，等待用户确认
- 用户可以：approve（批准）、edit（修改）、reject（拒绝重新提取）

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

- **P0**：核心功能，阻塞发布
- **P1**：重要功能，应该测试
- **P2**：次要功能，建议测试
- **P3**：可选功能
"""


def create_chat_agent(project_id: int = 0, checkpointer=None):
    """
    创建 Phase 1 需求澄清 Agent（使用 HITL）

    Args:
        project_id: 项目 ID
        checkpointer: LangGraph checkpointer 用于会话持久化

    Returns:
        CompiledStateGraph: 配置好的 DeepAgent
    """
    # 获取 LLM 配置
    model_name = os.getenv("OPENAI_LLM_MODEL", "gpt-4o")
    base_url = os.getenv("OPENAI_BASE_URL")
    api_key = os.getenv("OPENAI_API_KEY")

    # 创建 LLM
    model = ChatOpenAI(
        model=model_name,
        openai_api_base=base_url,
        openai_api_key=api_key,
    )

    logger.info(f"[Phase1] Using model: {model_name}, base_url: {base_url}")

    # 获取路径
    skills_path = str(BASE_DIR / "shared" / "skills" / "feature-extraction")
    memory_path = str(BASE_DIR / "AGENTS.md")
    workspace_path = str(BASE_DIR / "workspace")

    # 确保 workspace 目录存在
    os.makedirs(workspace_path, exist_ok=True)

    agent = create_deep_agent(
        model=model,
        tools=[confirm_features],  # ✅ 自定义确认工具
        system_prompt=PHASE1_SYSTEM_PROMPT,
        middleware=[],  # ✅ 使用 deepagents 内置中间件栈
        skills=[skills_path],  # ✅ 功能点提取技能
        memory=[memory_path],  # ✅ 项目级规范
        checkpointer=checkpointer,  # ✅ 会话持久化
        interrupt_on={
            # ✅ HITL 配置：功能点确认时中断
            "confirm_features": {"allowed_decisions": ["approve", "edit", "reject"]}
        },
        backend=FilesystemBackend(root_dir=workspace_path),
    )

    logger.info(f"[Phase1] Created chat agent for project {project_id}")
    return agent


async def get_chat_agent(session_id: str, project_id: int = 0):
    """
    获取或创建 Phase 1 聊天 Agent

    使用共享的 SQLite checkpointer，通过 thread_id 区分不同会话。

    Args:
        session_id: 会话 ID
        project_id: 项目 ID

    Returns:
        tuple: (agent, config)

    Raises:
        RuntimeError: 如果 SessionManager 未初始化
    """
    session_manager = get_session_manager()
    session_info = await session_manager.get_session(session_id)

    if not session_info:
        # 会话不存在，创建新会话
        session_id = await session_manager.create_session(project_id)
        session_info = await session_manager.get_session(session_id)

    # ✅ 关键改动：使用共享的 SQLite checkpointer（而不是 session_info.checkpointer）
    # 所有会话共享同一个 checkpointer，通过 thread_id 区分
    checkpointer = session_manager.get_checkpointer()

    # 创建 Agent
    agent = create_chat_agent(project_id, checkpointer=checkpointer)

    # 配置：thread_id = session_id，用于区分不同会话的 checkpoint
    config = {"configurable": {"thread_id": session_id}}

    return agent, config
