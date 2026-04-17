"""Session Manager for Phase 1.

This module manages session lifecycle with SQLite persistence.

Features:
- SQLite-backed checkpoint persistence (survives restarts)
- Automatic session metadata recovery on startup
- TTL-based cleanup with SQLite data deletion
- Full CRUD support for sessions
"""

import os
import uuid
from datetime import datetime, timedelta
from dataclasses import dataclass
from typing import Optional, AsyncIterator
from contextlib import asynccontextmanager

import aiosqlite
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from loguru import logger

from ..config import storage_config


@dataclass
class SessionInfo:
    """会话信息（元数据，不包含 checkpointer）"""

    session_id: str
    created_at: datetime
    last_active: datetime
    project_id: int
    status: str = "active"


class SessionManager:
    """
    会话管理器（SQLite 持久化）

    架构说明：
    - 内存 _sessions: 存储 session 元数据（快速访问）
    - SQLite checkpointer: 存储 checkpoint 数据（对话历史、状态）
    - thread_id = session_id: 通过 thread_id 关联两者

    启动时自动从 SQLite 恢复 session 元数据。
    """

    def __init__(
        self,
        db_path: str = None,
        max_sessions: int = 100,
        ttl_hours: int = 24
    ):
        """
        初始化会话管理器

        Args:
            db_path: SQLite 数据库路径（默认使用 config 中的配置）
            max_sessions: 最大会话数
            ttl_hours: 会话超时时间（小时）
        """
        self._sessions: dict[str, SessionInfo] = {}
        self._db_path = db_path or storage_config.checkpoint_db
        self._checkpointer: Optional[AsyncSqliteSaver] = None
        self._conn: Optional[aiosqlite.Connection] = None
        self.max_sessions = max_sessions
        self.ttl = timedelta(hours=ttl_hours)
        self._initialized = False

    @asynccontextmanager
    async def lifespan(self) -> AsyncIterator["SessionManager"]:
        """
        异步上下文管理器，管理 checkpointer 生命周期

        用法:
            session_manager = SessionManager()
            async with session_manager.lifespan():
                # 应用运行期间...
                pass

        或在 FastAPI 中:
            @asynccontextmanager
            async def lifespan(app):
                async with session_manager.lifespan():
                    yield
        """
        await self._initialize()
        try:
            yield self
        finally:
            await self._close()

    async def _initialize(self) -> None:
        """初始化 SQLite checkpointer 并恢复 session 元数据"""
        if self._initialized:
            return

        # 确保 db_path 是绝对路径
        db_path = self._db_path
        if not os.path.isabs(db_path):
            base_dir = os.path.dirname(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            )
            db_path = os.path.join(base_dir, db_path)

        # 确保目录存在
        db_dir = os.path.dirname(db_path)
        if db_dir:
            os.makedirs(db_dir, exist_ok=True)

        logger.info(f"[SessionManager] Initializing SQLite checkpointer at: {db_path}")

        # 创建连接和 checkpointer
        self._conn = await aiosqlite.connect(db_path)
        self._checkpointer = AsyncSqliteSaver(self._conn)
        await self._checkpointer.setup()

        # 从 SQLite 恢复 session 元数据
        await self._restore_sessions_from_db()

        self._initialized = True
        logger.info(
            f"[SessionManager] Initialized with {len(self._sessions)} restored sessions"
        )

    async def _restore_sessions_from_db(self) -> None:
        """
        从 SQLite checkpoints 表恢复 session 元数据

        扫描 checkpoints 表中的所有 thread_id，
        为每个唯一的 thread_id 创建 SessionInfo。
        """
        if not self._conn:
            return

        try:
            # 查询所有唯一的 thread_id
            async with self._conn.execute(
                "SELECT DISTINCT thread_id FROM checkpoints"
            ) as cursor:
                rows = await cursor.fetchall()

            now = datetime.now()

            for (thread_id,) in rows:
                # 跳过空或无效的 thread_id
                if not thread_id or not thread_id.strip():
                    continue

                # 尝试解析 thread_id 是否为有效 UUID
                try:
                    uuid.UUID(thread_id)
                except ValueError:
                    # 不是有效 UUID，跳过（可能是其他系统的数据）
                    continue

                # 获取该 thread 的最新 checkpoint 时间戳
                async with self._conn.execute(
                    """
                    SELECT checkpoint_id FROM checkpoints
                    WHERE thread_id = ?
                    ORDER BY checkpoint_id DESC LIMIT 1
                    """,
                    (thread_id,)
                ) as cursor:
                    row = await cursor.fetchone()
                    if row:
                        # checkpoint_id 通常是时间戳格式，可以用来推断创建时间
                        # 如果无法解析，使用当前时间
                        created_at = now

                        self._sessions[thread_id] = SessionInfo(
                            session_id=thread_id,
                            created_at=created_at,
                            last_active=now,
                            project_id=0,  # 无法从 checkpoint 恢复 project_id
                            status="active",
                        )

            if self._sessions:
                logger.info(
                    f"[SessionManager] Restored {len(self._sessions)} sessions from SQLite"
                )

        except Exception as e:
            logger.warning(f"[SessionManager] Failed to restore sessions from DB: {e}")

    async def _close(self) -> None:
        """关闭 SQLite 连接"""
        if self._conn is not None:
            logger.info("[SessionManager] Closing SQLite connection...")
            await self._conn.close()
            self._conn = None
            self._checkpointer = None
            self._initialized = False
            logger.info("[SessionManager] SQLite connection closed")

    def get_checkpointer(self) -> AsyncSqliteSaver:
        """
        获取共享的 checkpointer

        Raises:
            RuntimeError: 如果未初始化
        """
        if self._checkpointer is None:
            raise RuntimeError(
                "SessionManager not initialized. "
                "Use 'async with session_manager.lifespan()' or call initialize() first."
            )
        return self._checkpointer

    @property
    def is_initialized(self) -> bool:
        """检查是否已初始化"""
        return self._initialized

    async def create_session(self, project_id: int = 0) -> str:
        """
        创建新会话

        Args:
            project_id: 项目 ID

        Returns:
            session_id: 会话 ID（UUID 格式，同时作为 thread_id）
        """
        if not self._initialized:
            await self._initialize()

        await self._cleanup_expired()

        if len(self._sessions) >= self.max_sessions:
            await self._cleanup_oldest()

        session_id = str(uuid.uuid4())
        now = datetime.now()

        self._sessions[session_id] = SessionInfo(
            session_id=session_id,
            created_at=now,
            last_active=now,
            project_id=project_id,
            status="active",
        )

        logger.info(f"[SessionManager] Created session: {session_id}")
        return session_id

    async def get_session(self, session_id: str) -> Optional[SessionInfo]:
        """
        获取会话信息

        Args:
            session_id: 会话 ID

        Returns:
            SessionInfo 或 None
        """
        session = self._sessions.get(session_id)

        if session:
            session.last_active = datetime.now()

        return session

    async def delete_session(self, session_id: str) -> bool:
        """
        删除会话（同时删除内存元数据和 SQLite checkpoint）

        Args:
            session_id: 会话 ID

        Returns:
            是否成功删除
        """
        if session_id not in self._sessions:
            return False

        # 1. 删除内存中的 session 元数据
        del self._sessions[session_id]

        # 2. 删除 SQLite 中的 checkpoint 数据
        if self._checkpointer:
            try:
                await self._checkpointer.adelete_thread(session_id)
                logger.info(
                    f"[SessionManager] Deleted session: {session_id} (memory + SQLite)"
                )
            except Exception as e:
                logger.error(
                    f"[SessionManager] Failed to delete checkpoint for {session_id}: {e}"
                )

        return True

    async def _cleanup_expired(self) -> None:
        """清理过期会话（内存 + SQLite）"""
        now = datetime.now()
        expired = [
            sid
            for sid, session in self._sessions.items()
            if now - session.last_active > self.ttl
        ]

        for sid in expired:
            await self.delete_session(sid)

        if expired:
            logger.info(f"[SessionManager] Cleaned up {len(expired)} expired sessions")

    async def _cleanup_oldest(self) -> None:
        """清理最旧的会话"""
        if not self._sessions:
            return

        oldest_id = min(
            self._sessions.keys(), key=lambda sid: self._sessions[sid].created_at
        )
        await self.delete_session(oldest_id)
        logger.info(f"[SessionManager] Cleaned up oldest session: {oldest_id}")

    def get_stats(self) -> dict:
        """
        获取会话统计

        Returns:
            统计信息
        """
        return {
            "total_sessions": len(self._sessions),
            "max_sessions": self.max_sessions,
            "ttl_hours": self.ttl.total_seconds() / 3600,
            "db_path": self._db_path,
            "initialized": self._initialized,
        }

    async def list_sessions(self) -> list[dict]:
        """
        获取所有会话列表

        Returns:
            会话列表
        """
        sessions = []
        for session in self._sessions.values():
            sessions.append({
                "session_id": session.session_id,
                "project_id": session.project_id,
                "created_at": session.created_at.isoformat(),
                "last_active": session.last_active.isoformat(),
                "status": session.status
            })
        return sessions

    async def get_session_details(self, session_id: str) -> Optional[dict]:
        """
        获取会话详细信息（包括历史消息）

        Args:
            session_id: 会话 ID

        Returns:
            会话详情或 None
        """
        session = await self.get_session(session_id)
        if not session:
            return None

        try:
            # 使用共享的 checkpointer 获取状态
            config = {"configurable": {"thread_id": session_id}}

            # 使用 aget_tuple 获取完整的 checkpoint 信息
            checkpoint_tuple = await self._checkpointer.aget_tuple(config)

            messages = []
            if checkpoint_tuple:
                # checkpoint 结构: {"channel_values": {"messages": [...]}, ...}
                checkpoint = checkpoint_tuple.checkpoint
                if checkpoint and "channel_values" in checkpoint:
                    channel_values = checkpoint["channel_values"]
                    if "messages" in channel_values:
                        raw_messages = channel_values["messages"]
                        for msg in raw_messages:
                            messages.append({
                                "role": getattr(msg, 'type', None) or
                                        getattr(msg, 'role', 'unknown'),
                                "content": getattr(msg, 'content', str(msg))
                            })

            logger.info(
                f"[SessionManager] Retrieved {len(messages)} messages for session {session_id}"
            )

            return {
                "session_id": session.session_id,
                "project_id": session.project_id,
                "created_at": session.created_at.isoformat(),
                "last_active": session.last_active.isoformat(),
                "status": session.status,
                "messages": messages
            }
        except Exception as e:
            logger.error(f"[SessionManager] Failed to get session details: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return {
                "session_id": session.session_id,
                "project_id": session.project_id,
                "created_at": session.created_at.isoformat(),
                "last_active": session.last_active.isoformat(),
                "status": session.status,
                "messages": []
            }


# 全局单例
_session_manager: Optional[SessionManager] = None


def get_session_manager() -> SessionManager:
    """获取全局会话管理器实例"""
    global _session_manager

    if _session_manager is None:
        _session_manager = SessionManager()

    return _session_manager


async def init_session_manager() -> SessionManager:
    """
    初始化并返回全局会话管理器

    用于 FastAPI lifespan 中调用
    """
    manager = get_session_manager()
    if not manager.is_initialized:
        await manager._initialize()
    return manager


async def close_session_manager() -> None:
    """
    关闭全局会话管理器

    用于 FastAPI shutdown 时调用
    """
    global _session_manager
    if _session_manager is not None:
        await _session_manager._close()
