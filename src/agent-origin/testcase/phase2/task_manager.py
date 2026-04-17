"""Task Manager for Phase 2.

This module manages asynchronous task status with automatic memory cleanup.
"""

import uuid
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from typing import Optional

from loguru import logger


@dataclass
class TaskInfo:
    """任务信息"""

    task_id: str
    status: str  # pending/processing/completed/failed
    created_at: datetime
    progress: int = 0
    total: int = 0
    current_feature: Optional[str] = None
    result: Optional[dict] = None
    error: Optional[str] = None
    memory_refs: list = field(default_factory=list)  # 内存引用追踪


class TaskManager:
    """异步任务管理器（内存存储 + 自动回收）"""

    def __init__(self, max_tasks: int = 100, ttl_hours: int = 2):
        """
        初始化任务管理器

        Args:
            max_tasks: 最大任务数
            ttl_hours: 任务超时时间（小时）
        """
        self._tasks: dict[str, TaskInfo] = {}
        self.max_tasks = max_tasks
        self.ttl = timedelta(hours=ttl_hours)

    async def create_task(self) -> str:
        """
        创建新任务

        Returns:
            task_id: 任务 ID
        """
        # 🧹 清理过期任务
        await self._cleanup_expired()

        # 限制最大任务数
        if len(self._tasks) >= self.max_tasks:
            await self._cleanup_oldest()

        task_id = str(uuid.uuid4())
        self._tasks[task_id] = TaskInfo(
            task_id=task_id,
            status="pending",
            created_at=datetime.now(),
        )

        logger.info(f"[TaskManager] Created task: {task_id}")
        return task_id

    async def update_task(self, task_id: str, **kwargs):
        """
        更新任务状态

        Args:
            task_id: 任务 ID
            **kwargs: 要更新的字段
        """
        if task_id in self._tasks:
            task = self._tasks[task_id]
            for key, value in kwargs.items():
                if hasattr(task, key):
                    setattr(task, key, value)
            logger.debug(f"[TaskManager] Updated task {task_id}: {kwargs}")

    async def get_task(self, task_id: str) -> Optional[TaskInfo]:
        """
        获取任务信息

        Args:
            task_id: 任务 ID

        Returns:
            TaskInfo 或 None
        """
        return self._tasks.get(task_id)

    async def delete_task(self, task_id: str):
        """
        删除任务并回收内存

        Args:
            task_id: 任务 ID
        """
        if task_id in self._tasks:
            task = self._tasks[task_id]

            # 🧹 清理内存引用
            if task.result and "test_cases" in task.result:
                task.result["test_cases"].clear()

            del self._tasks[task_id]
            logger.info(f"[TaskManager] Deleted task: {task_id}")

    async def _cleanup_expired(self):
        """清理过期任务"""
        now = datetime.now()
        expired = [
            tid
            for tid, task in self._tasks.items()
            if now - task.created_at > self.ttl
        ]

        for tid in expired:
            await self.delete_task(tid)

        if expired:
            logger.info(f"[TaskManager] Cleaned up {len(expired)} expired tasks")

    async def _cleanup_oldest(self):
        """清理最旧的任务"""
        if not self._tasks:
            return

        oldest_id = min(
            self._tasks.keys(), key=lambda tid: self._tasks[tid].created_at
        )
        await self.delete_task(oldest_id)
        logger.info(f"[TaskManager] Cleaned up oldest task: {oldest_id}")

    def get_stats(self) -> dict:
        """
        获取任务统计

        Returns:
            统计信息
        """
        status_counts = {}
        for task in self._tasks.values():
            status_counts[task.status] = status_counts.get(task.status, 0) + 1

        return {
            "total_tasks": len(self._tasks),
            "max_tasks": self.max_tasks,
            "ttl_hours": self.ttl.total_seconds() / 3600,
            "status_counts": status_counts,
        }
