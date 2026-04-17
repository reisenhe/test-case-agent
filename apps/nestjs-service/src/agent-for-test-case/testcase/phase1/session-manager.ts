/**
 * Session Manager for Phase 1 (TypeScript port of phase1/session_manager.py).
 *
 * Manages session lifecycle using LangGraph MemorySaver as the checkpointer.
 *
 * Architecture:
 *  - In-memory _sessions map: stores session metadata (fast access)
 *  - MemorySaver checkpointer: stores graph checkpoint data (conversation history)
 *  - thread_id = session_id: correlates the two stores
 *
 * Note: Unlike the Python version (SQLite), this implementation uses MemorySaver
 * and does NOT survive process restarts. For production SQLite persistence,
 * install @langchain/langgraph-checkpoint-sqlite and swap the checkpointer.
 */

import { MemorySaver } from '@langchain/langgraph';
import { storageConfig } from '../config';

// ==================== Session Info ====================

export interface SessionInfo {
  sessionId: string;
  createdAt: Date;
  lastActive: Date;
  projectId: number;
  status: 'active' | 'completed' | 'error';
}

// ==================== Session Manager ====================

export class SessionManager {
  private _sessions: Map<string, SessionInfo> = new Map();
  private _checkpointer: MemorySaver;
  private _initialized = false;
  private readonly maxSessions: number;
  private readonly ttlMs: number;

  constructor(options?: { maxSessions?: number; ttlHours?: number }) {
    this.maxSessions = options?.maxSessions ?? 100;
    this.ttlMs = (options?.ttlHours ?? 24) * 60 * 60 * 1000;
    this._checkpointer = new MemorySaver();
  }

  /**
   * 初始化会话管理器
   * (No-op for MemorySaver, kept for API parity with Python version)
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;
    console.log('[SessionManager] Initializing with MemorySaver checkpointer');
    console.log(
      `[SessionManager] Note: DB path "${storageConfig.checkpointDb}" not used; using in-memory storage.`,
    );
    this._initialized = true;
  }

  /** 关闭资源（MemorySaver 无需关闭） */
  async close(): Promise<void> {
    console.log('[SessionManager] Closing session manager');
    this._initialized = false;
  }

  /** 检查是否已初始化 */
  get isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * 获取共享的 checkpointer
   * All sessions share the same checkpointer; thread_id differentiates them.
   */
  getCheckpointer(): MemorySaver {
    if (!this._initialized) {
      throw new Error(
        'SessionManager not initialized. Call initialize() first.',
      );
    }
    return this._checkpointer;
  }

  /**
   * 创建新会话
   *
   * @param projectId 项目 ID
   * @returns session_id (UUID)
   */
  async createSession(projectId: number = 0): Promise<string> {
    if (!this._initialized) await this.initialize();

    await this._cleanupExpired();

    if (this._sessions.size >= this.maxSessions) {
      await this._cleanupOldest();
    }

    const sessionId = crypto.randomUUID();
    const now = new Date();

    this._sessions.set(sessionId, {
      sessionId,
      createdAt: now,
      lastActive: now,
      projectId,
      status: 'active',
    });

    console.log(`[SessionManager] Created session: ${sessionId}`);
    return sessionId;
  }

  /**
   * 获取会话信息
   *
   * @param sessionId 会话 ID
   * @returns SessionInfo 或 null
   */
  async getSession(sessionId: string): Promise<SessionInfo | null> {
    const session = this._sessions.get(sessionId);
    if (session) {
      session.lastActive = new Date();
    }
    return session ?? null;
  }

  /**
   * 删除会话（内存元数据）
   *
   * Note: MemorySaver does not expose thread deletion; checkpoint data remains
   * until GC. For production use with SQLite, implement checkpoint deletion.
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    if (!this._sessions.has(sessionId)) return false;

    this._sessions.delete(sessionId);
    console.log(`[SessionManager] Deleted session: ${sessionId}`);
    return true;
  }

  /**
   * 获取所有会话列表
   */
  async listSessions(): Promise<Record<string, unknown>[]> {
    return Array.from(this._sessions.values()).map((s) => ({
      session_id: s.sessionId,
      project_id: s.projectId,
      created_at: s.createdAt.toISOString(),
      last_active: s.lastActive.toISOString(),
      status: s.status,
    }));
  }

  /**
   * 获取会话详细信息（含历史消息）
   *
   * @param sessionId 会话 ID
   */
  async getSessionDetails(
    sessionId: string,
  ): Promise<Record<string, unknown> | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    let messages: Record<string, unknown>[] = [];

    try {
      const config = { configurable: { thread_id: sessionId } };
      const checkpointer = this.getCheckpointer();

      // getTuple retrieves the latest checkpoint for this thread
      const checkpointTuple = await checkpointer.getTuple(config);
      if (checkpointTuple) {
        const channelValues =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (checkpointTuple.checkpoint as any)?.channel_values ?? {};
        const rawMessages = (
          channelValues as Record<string, unknown>
        ).messages;
        if (Array.isArray(rawMessages)) {
          messages = (rawMessages as Record<string, unknown>[]).map((msg) => ({
            role:
              (msg as { _getType?: () => string })._getType?.() ??
              (msg as { type?: string }).type ??
              'unknown',
            content: (msg as { content?: string }).content ?? String(msg),
          }));
        }
      }

      console.log(
        `[SessionManager] Retrieved ${messages.length} messages for session ${sessionId}`,
      );
    } catch (e) {
      console.error(`[SessionManager] Failed to get session details: ${e}`);
    }

    return {
      session_id: session.sessionId,
      project_id: session.projectId,
      created_at: session.createdAt.toISOString(),
      last_active: session.lastActive.toISOString(),
      status: session.status,
      messages,
    };
  }

  /**
   * 获取会话统计信息
   */
  getStats(): Record<string, unknown> {
    return {
      total_sessions: this._sessions.size,
      max_sessions: this.maxSessions,
      ttl_hours: this.ttlMs / (60 * 60 * 1000),
      initialized: this._initialized,
    };
  }

  /** 清理过期会话 */
  private async _cleanupExpired(): Promise<void> {
    const now = Date.now();
    const expired: string[] = [];

    for (const [id, session] of this._sessions.entries()) {
      if (now - session.lastActive.getTime() > this.ttlMs) {
        expired.push(id);
      }
    }

    for (const id of expired) {
      await this.deleteSession(id);
    }

    if (expired.length > 0) {
      console.log(
        `[SessionManager] Cleaned up ${expired.length} expired sessions`,
      );
    }
  }

  /** 清理最旧的会话 */
  private async _cleanupOldest(): Promise<void> {
    if (this._sessions.size === 0) return;

    let oldestId = '';
    let oldestTime = Infinity;

    for (const [id, session] of this._sessions.entries()) {
      const t = session.createdAt.getTime();
      if (t < oldestTime) {
        oldestTime = t;
        oldestId = id;
      }
    }

    if (oldestId) {
      await this.deleteSession(oldestId);
      console.log(`[SessionManager] Cleaned up oldest session: ${oldestId}`);
    }
  }
}

// ==================== Global singleton ====================

let _sessionManager: SessionManager | null = null;

/** 获取全局会话管理器单例 */
export function getSessionManager(): SessionManager {
  if (!_sessionManager) {
    _sessionManager = new SessionManager();
  }
  return _sessionManager;
}

/** 初始化全局会话管理器（在应用启动时调用） */
export async function initSessionManager(): Promise<SessionManager> {
  const manager = getSessionManager();
  if (!manager.isInitialized) {
    await manager.initialize();
  }
  return manager;
}

/** 关闭全局会话管理器（在应用关闭时调用） */
export async function closeSessionManager(): Promise<void> {
  if (_sessionManager) {
    await _sessionManager.close();
  }
}
