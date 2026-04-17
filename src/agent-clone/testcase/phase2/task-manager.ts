/**
 * Task Manager for Phase 2 (TypeScript port of phase2/task_manager.py).
 *
 * Manages asynchronous task status with automatic memory cleanup.
 */

// ==================== Task Info ====================

export interface TaskInfo {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  progress: number;
  total: number;
  currentFeature?: string | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
  memoryRefs: unknown[];
}

// ==================== Task Manager ====================

export class TaskManager {
  private _tasks: Map<string, TaskInfo> = new Map();
  private readonly maxTasks: number;
  private readonly ttlMs: number;

  constructor(options?: { maxTasks?: number; ttlHours?: number }) {
    this.maxTasks = options?.maxTasks ?? 100;
    this.ttlMs = (options?.ttlHours ?? 2) * 60 * 60 * 1000;
  }

  /**
   * 创建新任务
   *
   * @returns task_id (UUID)
   */
  async createTask(): Promise<string> {
    // 清理过期任务
    await this._cleanupExpired();

    // 限制最大任务数
    if (this._tasks.size >= this.maxTasks) {
      await this._cleanupOldest();
    }

    const taskId = crypto.randomUUID();
    this._tasks.set(taskId, {
      taskId,
      status: 'pending',
      createdAt: new Date(),
      progress: 0,
      total: 0,
      memoryRefs: [],
    });

    console.log(`[TaskManager] Created task: ${taskId}`);
    return taskId;
  }

  /**
   * 更新任务状态
   *
   * @param taskId 任务 ID
   * @param updates 要更新的字段
   */
  async updateTask(
    taskId: string,
    updates: Partial<Omit<TaskInfo, 'taskId' | 'createdAt' | 'memoryRefs'>>,
  ): Promise<void> {
    const task = this._tasks.get(taskId);
    if (!task) return;

    Object.assign(task, updates);
    console.debug(`[TaskManager] Updated task ${taskId}:`, updates);
  }

  /**
   * 获取任务信息
   *
   * @param taskId 任务 ID
   * @returns TaskInfo 或 null
   */
  async getTask(taskId: string): Promise<TaskInfo | null> {
    return this._tasks.get(taskId) ?? null;
  }

  /**
   * 删除任务并回收内存
   *
   * @param taskId 任务 ID
   */
  async deleteTask(taskId: string): Promise<void> {
    const task = this._tasks.get(taskId);
    if (!task) return;

    // 清理内存引用
    if (task.result && Array.isArray((task.result as Record<string, unknown>).test_cases)) {
      ((task.result as Record<string, unknown>).test_cases as unknown[]).length = 0;
    }

    this._tasks.delete(taskId);
    console.log(`[TaskManager] Deleted task: ${taskId}`);
  }

  /**
   * 获取任务统计
   */
  getStats(): Record<string, unknown> {
    const statusCounts: Record<string, number> = {};
    for (const task of this._tasks.values()) {
      statusCounts[task.status] = (statusCounts[task.status] ?? 0) + 1;
    }

    return {
      total_tasks: this._tasks.size,
      max_tasks: this.maxTasks,
      ttl_hours: this.ttlMs / (60 * 60 * 1000),
      status_counts: statusCounts,
    };
  }

  /** 清理过期任务 */
  private async _cleanupExpired(): Promise<void> {
    const now = Date.now();
    const expired: string[] = [];

    for (const [id, task] of this._tasks.entries()) {
      if (now - task.createdAt.getTime() > this.ttlMs) {
        expired.push(id);
      }
    }

    for (const id of expired) {
      await this.deleteTask(id);
    }

    if (expired.length > 0) {
      console.log(`[TaskManager] Cleaned up ${expired.length} expired tasks`);
    }
  }

  /** 清理最旧的任务 */
  private async _cleanupOldest(): Promise<void> {
    if (this._tasks.size === 0) return;

    let oldestId = '';
    let oldestTime = Infinity;

    for (const [id, task] of this._tasks.entries()) {
      const t = task.createdAt.getTime();
      if (t < oldestTime) {
        oldestTime = t;
        oldestId = id;
      }
    }

    if (oldestId) {
      await this.deleteTask(oldestId);
      console.log(`[TaskManager] Cleaned up oldest task: ${oldestId}`);
    }
  }
}
