/**
 * TestCase Agent Service
 * Business logic layer for TestCase Agent v5.3
 *
 * Encapsulates all core functionality:
 *  - Phase 1: Session management + HITL chat
 *  - Phase 2: Parallel test case generation
 *  - Quality analysis
 *  - Export handling
 */

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Command } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { Observable, Subject } from 'rxjs';

import { getChatAgent } from './phase1/agent';
import {
  getSessionManager,
  initSessionManager,
  closeSessionManager,
} from './phase1/session-manager';
import { getFullContextForGeneration } from './phase1/context';
import { TaskManager } from './phase2/task-manager';
import { TestCaseGenerator } from './phase2/generator';
import { analyzeQuality } from './phase2/quality-analyzer';
import { exportTestcases } from './shared/tools/export';
import type {
  StartSessionRequest,
  ChatRequest,
  ResumeRequest,
  StartGenerationRequest,
  SaveRequest,
  QualityReport,
} from './shared/models';

@Injectable()
export class TestcaseAgentService implements OnModuleInit, OnModuleDestroy {
  private readonly taskManager = new TaskManager();
  private readonly generator = new TestCaseGenerator(10);

  // ==================== Lifecycle ====================

  async onModuleInit(): Promise<void> {
    console.log('[TestCase API] Starting up...');
    await initSessionManager();
    console.log('[TestCase API] SessionManager initialized');
  }

  async onModuleDestroy(): Promise<void> {
    await closeSessionManager();
    console.log('[TestCase API] Shutdown complete');
  }

  // ==================== Phase 1: Session Management ====================

  /**
   * 启动 Phase 1 需求澄清会话
   */
  async startSession(req: StartSessionRequest): Promise<{
    session_id: string;
    status: string;
    message: string;
  }> {
    const sessionManager = getSessionManager();
    const sessionId = await sessionManager.createSession(req.project_id ?? 0);

    console.log(`[API] Started session: ${sessionId}`);

    return {
      session_id: sessionId,
      status: 'ready',
      message: '会话已创建，可以开始对话',
    };
  }

  /**
   * 获取所有活跃会话列表
   */
  async listSessions(): Promise<{
    sessions: Record<string, unknown>[];
    total: number;
  }> {
    const sessionManager = getSessionManager();
    const sessions = await sessionManager.listSessions();

    console.log(`[API] Listed ${sessions.length} sessions`);

    return {
      sessions,
      total: sessions.length,
    };
  }

  /**
   * 获取会话详细信息（包括历史消息）
   */
  async getSessionDetail(
    sessionId: string,
  ): Promise<Record<string, unknown> | null> {
    const sessionManager = getSessionManager();
    const session = await sessionManager.getSessionDetails(sessionId);

    if (!session) {
      return null;
    }

    console.log(`[API] Retrieved session details: ${sessionId}`);
    return session;
  }

  /**
   * 检查会话是否存在
   */
  async sessionExists(sessionId: string): Promise<boolean> {
    const sessionManager = getSessionManager();
    const session = await sessionManager.getSession(sessionId);
    return session !== null;
  }

  /**
   * 删除指定会话
   */
  async deleteSession(sessionId: string): Promise<{
    session_id: string;
    status: string;
    message: string;
  }> {
    const sessionManager = getSessionManager();
    await sessionManager.deleteSession(sessionId);

    console.log(`[API] Deleted session: ${sessionId}`);

    return {
      session_id: sessionId,
      status: 'deleted',
      message: '会话已删除',
    };
  }

  // ==================== Phase 1: SSE Chat Stream ====================

  /**
   * SSE 流式对话（支持 HITL 中断）
   */
  chatStream(sessionId: string, req: ChatRequest): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();

    (async () => {
      try {
        const [agent, config] = await getChatAgent(sessionId, req.project_id);

        // 开始先检查是否有挂起的 HITL 中断
        // 如果有，不能再往状态里追加 HumanMessage（会导致 tool_calls 没有对应 ToolMessage 的 400 报错）
        const currentState = await agent.getState(config);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pendingInterrupt = (currentState?.tasks as any[])?.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (task: any) => task.interrupts && task.interrupts.length > 0,
        );

        // 确定流式输入：有挂起中断时用用户反馈恢复图（避免 tool_calls 没有 ToolMessage 的 400 报错）
        // 否则追加新的 HumanMessage 正常对话
        let streamInput: Parameters<typeof agent.streamEvents>[0];

        if (pendingInterrupt) {
          console.log(
            `[API] Session ${sessionId}: pending interrupt, resuming with user feedback: "${req.message.substring(0, 60)}"`,
          );

          // 从中断状态中取出现有功能点，作为 LLM 调整的参考
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const interruptValue = (pendingInterrupt as any).interrupts[0]?.value;
          const actionRequests: Record<string, unknown>[] =
            interruptValue?.action_requests ?? [];
          const existingFeaturePoints =
            (actionRequests[0]?.args as Record<string, unknown>)
              ?.feature_points ?? [];

          // 以「reject + user_feedback」恢复图，让 LLM 根据用户反馈调整功能点
          streamInput = new Command({
            resume: {
              decisions: [
                {
                  type: 'reject',
                  user_feedback: req.message,
                  current_features: existingFeaturePoints,
                },
              ],
            },
          }) as unknown as Parameters<typeof agent.streamEvents>[0];
        } else {
          console.log(`[API] Starting chat stream for session: ${sessionId}`);
          streamInput = { messages: [new HumanMessage(req.message)] };
        }

        const stream = agent.streamEvents(
          streamInput,
          { ...config, version: 'v2' } as Parameters<typeof agent.streamEvents>[1],
        );

        for await (const event of stream) {
          const eventType = event.event as string;

          // 1. 流式输出 token
          if (eventType === 'on_chat_model_stream') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const chunk = (event.data as any)?.chunk;
            const token = chunk?.content;
            if (token) {
              subject.next({
                data: JSON.stringify({ type: 'token', content: token }),
              } as unknown as MessageEvent);
            }
          }

          // 2. 工具调用开始
          else if (eventType === 'on_tool_start') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const toolName = (event.data as any)?.name ?? event.name ?? 'unknown';
            console.log(`[API] Tool start: ${toolName}`);
            subject.next({
              data: JSON.stringify({ type: 'tool_start', tool: toolName }),
            } as unknown as MessageEvent);
          }

          // 3. 工具调用结束
          else if (eventType === 'on_tool_end') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const toolName = (event.data as any)?.name ?? event.name ?? 'unknown';
            console.log(`[API] Tool end: ${toolName}`);
          }

          // 4. HITL 中断检测 - 检查多种可能的事件来源
          else if (eventType === 'on_chain_end') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const output = (event.data as any)?.output;

            // 检查 __interrupt__ 字段
            if (output?.__interrupt__) {
              const interruptList = output.__interrupt__ as Array<{
                value: Record<string, unknown>;
              }>;
              const interruptData = interruptList[0]?.value;
              console.log(
                `[API] HITL interrupt detected via __interrupt__:`,
                interruptData,
              );

              const actionRequests = (
                (interruptData?.action_requests as Array<
                  Record<string, unknown>
                >) ?? []
              );

              if (actionRequests.length > 0) {
                const actionRequest = actionRequests[0];
                const featurePoints = (
                  (actionRequest.args as Record<string, unknown>)
                    ?.feature_points as Record<string, unknown>[]
                ) ?? [];

                subject.next({
                  data: JSON.stringify({
                    type: 'hitl_interrupt',
                    feature_points: featurePoints,
                    allowed_decisions: ['approve', 'edit', 'reject'],
                  }),
                } as unknown as MessageEvent);
              }
            }
          }
          
          // 5. 检查 langgraph_interrupt 事件 (LangGraph v2 新格式)
          else if (eventType === 'on_custom_event' || event.name === '__interrupt__') {
            console.log(`[API] Custom/Interrupt event:`, JSON.stringify(event.data));
          }
        }

        // 流结束后，检查当前图状态是否有中断信息
        try {
          const currentState = await agent.getState(config);
          console.log(`[API] Final state tasks:`, currentState?.tasks);
          
          // 检查状态中的中断信息
          if (currentState?.tasks && currentState.tasks.length > 0) {
            for (const task of currentState.tasks) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const taskAny = task as any;
              if (taskAny.interrupts && taskAny.interrupts.length > 0) {
                const interruptInfo = taskAny.interrupts[0];
                console.log(`[API] Found interrupt in state:`, interruptInfo);
                
                const interruptValue = interruptInfo.value;
                const actionRequests = interruptValue?.action_requests ?? [];
                
                if (actionRequests.length > 0) {
                  const actionRequest = actionRequests[0];
                  const featurePoints = actionRequest?.args?.feature_points ?? [];
                  
                  console.log(`[API] Sending HITL interrupt with ${featurePoints.length} features`);
                  subject.next({
                    data: JSON.stringify({
                      type: 'hitl_interrupt',
                      feature_points: featurePoints,
                      allowed_decisions: ['approve', 'edit', 'reject'],
                    }),
                  } as unknown as MessageEvent);
                }
              }
            }
          }
        } catch (stateError) {
          console.log(`[API] Could not get final state:`, stateError);
        }

        subject.next({
          data: JSON.stringify({ type: 'done' }),
        } as unknown as MessageEvent);
        subject.complete();

        console.log(
          `[API] Chat stream completed for session: ${sessionId}`,
        );
      } catch (e) {
        console.error(`[API] Chat stream error: ${e}`);
        subject.next({
          data: JSON.stringify({ type: 'error', message: String(e) }),
        } as unknown as MessageEvent);
        subject.complete();
      }
    })();

    return subject.asObservable();
  }

  // ==================== Phase 1: Resume HITL ====================

  /**
   * 恢复 HITL 中断的会话
   */
  async resumeHitl(
    sessionId: string,
    req: ResumeRequest,
  ): Promise<{
    status: string;
    message: string;
    session_id: string;
  }> {
    const [agent, config] = await getChatAgent(sessionId);

    let resumeData: Record<string, unknown>;

    if (req.decision === 'approve') {
      resumeData = { decisions: [{ type: 'approve' }] };
    } else if (req.decision === 'edit') {
      resumeData = {
        decisions: [
          {
            type: 'edit',
            args: { feature_points: req.modified_features ?? [] },
          },
        ],
      };
    } else if (req.decision === 'reject') {
      resumeData = { decisions: [{ type: 'reject' }] };
    } else {
      throw new Error('Invalid decision type');
    }

    console.log(
      `[API] Resuming session ${sessionId} with decision: ${req.decision}`,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (agent as any).invoke(
      new Command({ resume: resumeData }),
      config,
    );

    const messages = (result?.messages as Array<{ content: string }>) ?? [];
    const finalMessage = messages.at(-1)?.content ?? '';

    console.log(`[API] Session ${sessionId} resumed successfully`);

    return {
      status: 'resumed',
      message: finalMessage,
      session_id: sessionId,
    };
  }

  // ==================== Phase 2: Generation ====================

  /**
   * 启动并发生成任务
   */
  async startGeneration(req: StartGenerationRequest): Promise<{
    task_id: string;
    status: string;
    total_features: number;
    session_id: string;
  }> {
    const taskId = await this.taskManager.createTask();

    console.log(
      `[API] Starting generation task: ${taskId} for session: ${req.session_id}`,
    );

    // 启动后台任务
    void this._runGenerationTask({
      taskId,
      sessionId: req.session_id,
      featurePoints: req.feature_points,
      requirementContent: req.requirement_content ?? '',
      maxConcurrent: req.max_concurrent ?? 10,
    });

    return {
      task_id: taskId,
      status: 'processing',
      total_features: req.feature_points.length,
      session_id: req.session_id,
    };
  }

  /**
   * 查询任务状态
   */
  async getTaskStatus(taskId: string): Promise<{
    task_id: string;
    status: string;
    progress: number;
    total: number;
    current_feature?: string | null;
    result?: Record<string, unknown> | null;
    error?: string | null;
    created_at: string;
  } | null> {
    const task = await this.taskManager.getTask(taskId);

    if (!task) {
      return null;
    }

    return {
      task_id: task.taskId,
      status: task.status,
      progress: task.progress,
      total: task.total,
      current_feature: task.currentFeature,
      result: task.result,
      error: task.error,
      created_at: task.createdAt.toISOString(),
    };
  }

  /**
   * SSE 实时进度流
   */
  taskStream(taskId: string): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();

    (async () => {
      while (true) {
        const task = await this.taskManager.getTask(taskId);

        if (!task) {
          subject.next({
            data: JSON.stringify({ error: 'Task not found' }),
          } as unknown as MessageEvent);
          break;
        }

        subject.next({
          data: JSON.stringify({
            status: task.status,
            progress: task.progress,
            total: task.total,
            current_feature: task.currentFeature,
          }),
        } as unknown as MessageEvent);

        if (task.status === 'completed' || task.status === 'failed') {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      subject.complete();
    })();

    return subject.asObservable();
  }

  /**
   * 保存测试用例到项目
   */
  async saveToProject(
    taskId: string,
    req: SaveRequest,
  ): Promise<{
    saved: number;
    total: number;
    project_id: number;
  }> {
    const task = await this.taskManager.getTask(taskId);

    if (!task) {
      throw new Error('Task not found');
    }

    if (task.status !== 'completed') {
      throw new Error(
        `Task not completed. Current status: ${task.status}`,
      );
    }

    const testCases =
      (task.result?.test_cases as Record<string, unknown>[]) ?? [];

    // TODO: 调用数据库保存逻辑
    const savedCount = testCases.length;

    console.log(
      `[API] Saved ${savedCount} test cases to project ${req.project_id}`,
    );

    return {
      saved: savedCount,
      total: testCases.length,
      project_id: req.project_id,
    };
  }

  /**
   * 下载测试用例文件
   */
  async downloadTestcases(
    taskId: string,
    format: string,
  ): Promise<{
    task_id: string;
    file_url: string;
    format: string;
  }> {
    const task = await this.taskManager.getTask(taskId);

    if (!task) {
      throw new Error('Task not found');
    }

    if (task.status !== 'completed') {
      throw new Error(
        `Task not completed. Current status: ${task.status}`,
      );
    }

    const fileUrl = task.result?.file_url as string | undefined;
    if (!fileUrl) {
      throw new Error('Export file not found');
    }

    console.log(`[API] Download requested for task ${taskId}: ${fileUrl}`);

    return {
      task_id: taskId,
      file_url: fileUrl,
      format,
    };
  }

  // ==================== Quality Analysis ====================

  /**
   * 获取质量报告
   */
  async getQualityReport(taskId: string): Promise<{
    task_id: string;
    report: Record<string, unknown>;
  }> {
    const task = await this.taskManager.getTask(taskId);

    if (!task) {
      throw new Error('Task not found');
    }

    if (task.status !== 'completed') {
      throw new Error(
        `Task not completed. Current status: ${task.status}`,
      );
    }

    const testCases =
      (task.result?.test_cases as Record<string, unknown>[]) ?? [];
    const featurePoints =
      (task.result?.feature_points as Record<string, unknown>[]) ?? [];

    const report = analyzeQuality(testCases, featurePoints);

    console.log(
      `[API] Quality report generated for task ${taskId}: score=${report.score}`,
    );

    return {
      task_id: taskId,
      report: {
        summary: report.summary,
        coverage: report.coverage.toJSON(),
        priority_distribution: report.priority_distribution.toJSON(),
        type_distribution: report.type_distribution.toJSON(),
        gaps: report.gaps,
        recommendations: report.recommendations,
        score: report.score,
      },
    };
  }

  /**
   * 获取覆盖率统计
   */
  async getCoverageStats(taskId: string): Promise<{
    task_id: string;
    coverage: Record<string, unknown>;
    targets: Record<string, unknown>;
  }> {
    const task = await this.taskManager.getTask(taskId);

    if (!task) {
      throw new Error('Task not found');
    }

    if (task.status !== 'completed') {
      throw new Error(
        `Task not completed. Current status: ${task.status}`,
      );
    }

    const testCases =
      (task.result?.test_cases as Record<string, unknown>[]) ?? [];
    const featurePoints =
      (task.result?.feature_points as Record<string, unknown>[]) ?? [];

    const report = analyzeQuality(testCases, featurePoints);

    return {
      task_id: taskId,
      coverage: report.coverage.toJSON(),
      targets: report.coverage.checkTargets(),
    };
  }

  /**
   * 获取用例分布
   */
  async getDistributionStats(taskId: string): Promise<{
    task_id: string;
    priority_distribution: Record<string, unknown>;
    priority_percentages: Record<string, string>;
    priority_targets: Record<string, unknown>;
    type_distribution: Record<string, unknown>;
  }> {
    const task = await this.taskManager.getTask(taskId);

    if (!task) {
      throw new Error('Task not found');
    }

    if (task.status !== 'completed') {
      throw new Error(
        `Task not completed. Current status: ${task.status}`,
      );
    }

    const testCases =
      (task.result?.test_cases as Record<string, unknown>[]) ?? [];

    const report = analyzeQuality(testCases, []);

    return {
      task_id: taskId,
      priority_distribution: report.priority_distribution.toJSON(),
      priority_percentages: report.priority_distribution.toPercentages(),
      priority_targets: report.priority_distribution.checkTargets(),
      type_distribution: report.type_distribution.toJSON(),
    };
  }

  // ==================== Private: Background Task ====================

  private async _runGenerationTask(options: {
    taskId: string;
    sessionId: string;
    featurePoints: Record<string, unknown>[];
    requirementContent: string;
    maxConcurrent: number;
  }): Promise<void> {
    const { taskId, sessionId, featurePoints, requirementContent } = options;

    try {
      await this.taskManager.updateTask(taskId, {
        status: 'processing',
        total: featurePoints.length,
        progress: 0,
      });

      console.log(`[API] Task ${taskId}: Starting generation`);

      // Phase 1→2: 语境传承
      const sessionManager = getSessionManager();
      const sessionInfo = await sessionManager.getSession(sessionId);

      let globalContext: string;
      if (sessionInfo) {
        globalContext = await getFullContextForGeneration(
          sessionManager.getCheckpointer(),
          sessionId,
          requirementContent,
        );
      } else {
        globalContext = `## 核心需求文档\n\n${requirementContent}`;
      }

      console.log(
        `[API] Task ${taskId}: Context extracted: ${globalContext.length} chars`,
      );

      // 进度回调
      const progressCallback = async (
        completed: number,
        _total: number,
        featureId: string,
      ) => {
        await this.taskManager.updateTask(taskId, {
          progress: completed,
          currentFeature: featureId,
        });
      };

      // 并发生成
      const result = await this.generator.generateParallel(
        featurePoints,
        globalContext,
        progressCallback,
      );

      // 导出文件
      const fileUrl = await exportTestcases(
        result.testCases,
        'excel',
        `testcases_${taskId.slice(0, 8)}`,
      );

      // 更新任务完成状态
      await this.taskManager.updateTask(taskId, {
        status: 'completed',
        progress: featurePoints.length,
        result: {
          test_cases: result.testCases,
          feature_points: featurePoints,
          file_url: fileUrl,
          total_features: result.totalFeatures,
          success_count: result.successCount,
          failure_count: result.failureCount,
          errors: result.errors,
          context_length: globalContext.length,
        },
      });

      console.log(`[API] Task ${taskId}: Generation completed`);
    } catch (e) {
      console.error(`[API] Task ${taskId}: Generation failed - ${e}`);
      await this.taskManager.updateTask(taskId, {
        status: 'failed',
        error: String(e),
      });
    }
  }
}
