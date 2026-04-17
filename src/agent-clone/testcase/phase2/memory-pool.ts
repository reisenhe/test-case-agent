/**
 * Memory Pool for Phase 2 (TypeScript port of phase2/memory_pool.py).
 *
 * Tracks and manages context cache for Agent instances.
 * Note: JavaScript GC does not provide WeakRef finalization callbacks in the
 * same way Python does, so agent tracking uses a simple Set.
 */

export class MemoryPool {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _agentRefs: WeakRef<object>[] = [];
  private _contextCache: Map<string, string> = new Map();
  private _registry: FinalizationRegistry<void>;

  constructor() {
    // FinalizationRegistry is used as the JS equivalent of weakref callbacks
    this._registry = new FinalizationRegistry(() => {
      // Remove dead refs when GC fires
      this._agentRefs = this._agentRefs.filter((r) => r.deref() !== undefined);
      console.debug(
        `[MemoryPool] Agent GC'd, remaining: ${this._agentRefs.length}`,
      );
    });
  }

  /**
   * 追踪 Agent 实例（弱引用）
   *
   * @param agent Agent 实例
   */
  trackAgent(agent: object): void {
    const ref = new WeakRef(agent);
    this._agentRefs.push(ref);
    this._registry.register(agent, undefined);
  }

  /**
   * 缓存上下文
   *
   * @param sessionId 会话 ID
   * @param context   上下文内容
   */
  cacheContext(sessionId: string, context: string): void {
    this._contextCache.set(sessionId, context);
    console.debug(`[MemoryPool] Cached context for session: ${sessionId}`);
  }

  /**
   * 获取缓存的上下文
   *
   * @param sessionId 会话 ID
   * @returns 上下文内容（如果存在）
   */
  getContext(sessionId: string): string {
    return this._contextCache.get(sessionId) ?? '';
  }

  /**
   * 清理会话相关内存
   *
   * @param sessionId 会话 ID
   */
  clearSession(sessionId: string): void {
    if (this._contextCache.delete(sessionId)) {
      console.debug(`[MemoryPool] Cleared context for session: ${sessionId}`);
    }
  }

  /**
   * 获取内存统计
   */
  getStats(): Record<string, number> {
    const activeAgents = this._agentRefs.filter(
      (r) => r.deref() !== undefined,
    ).length;

    return {
      active_agents: activeAgents,
      cached_contexts: this._contextCache.size,
      total_refs: this._agentRefs.length,
    };
  }

  /** 清空所有缓存 */
  clearAll(): void {
    this._contextCache.clear();
    this._agentRefs = [];
    console.log('[MemoryPool] Cleared all cached data');
  }
}
