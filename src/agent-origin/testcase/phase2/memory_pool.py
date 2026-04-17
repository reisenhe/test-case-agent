"""Memory Pool for Phase 2.

This module tracks and manages memory for Agent instances.
"""

import weakref
from typing import Any
from loguru import logger


class MemoryPool:
    """内存池（追踪和回收 Agent 实例）"""

    def __init__(self):
        self._agent_refs: list[weakref.ref] = []
        self._context_cache: dict[str, Any] = {}

    def track_agent(self, agent):
        """
        追踪 Agent 实例（弱引用）

        Args:
            agent: Agent 实例
        """
        ref = weakref.ref(agent, self._on_agent_gc)
        self._agent_refs.append(ref)

    def _on_agent_gc(self, ref):
        """
        Agent 被 GC 回调

        Args:
            ref: 弱引用
        """
        try:
            self._agent_refs.remove(ref)
            logger.debug(f"[MemoryPool] Agent GC'd, remaining: {len(self._agent_refs)}")
        except ValueError:
            pass  # ref already removed

    def cache_context(self, session_id: str, context: str):
        """
        缓存上下文

        Args:
            session_id: 会话 ID
            context: 上下文内容
        """
        self._context_cache[session_id] = context
        logger.debug(f"[MemoryPool] Cached context for session: {session_id}")

    def get_context(self, session_id: str) -> str:
        """
        获取缓存的上下文

        Args:
            session_id: 会话 ID

        Returns:
            上下文内容
        """
        return self._context_cache.get(session_id, "")

    def clear_session(self, session_id: str):
        """
        清理会话相关内存

        Args:
            session_id: 会话 ID
        """
        if session_id in self._context_cache:
            del self._context_cache[session_id]
            logger.debug(f"[MemoryPool] Cleared context for session: {session_id}")

    def get_stats(self) -> dict:
        """
        获取内存统计

        Returns:
            统计信息
        """
        active_agents = len([r for r in self._agent_refs if r()])

        return {
            "active_agents": active_agents,
            "cached_contexts": len(self._context_cache),
            "total_refs": len(self._agent_refs),
        }

    def clear_all(self):
        """清空所有缓存"""
        self._context_cache.clear()
        self._agent_refs.clear()
        logger.info("[MemoryPool] Cleared all cached data")
