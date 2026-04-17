/**
 * TestCase Agent Controller
 * Route declarations for TestCase Agent v5.3
 *
 * Follows NestJS architecture: Controller only declares routes,
 * all business logic is delegated to TestcaseAgentService.
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';

import { TestcaseAgentService } from './testcase-agent.service';
import type {
  StartSessionRequest,
  ChatRequest,
  ResumeRequest,
  StartGenerationRequest,
  SaveRequest,
} from './shared/models';

@Controller('v1/testcase-agent')
export class TestcaseAgentController {
  constructor(private readonly testcaseAgentService: TestcaseAgentService) {}

  // ==================== Phase 1: Session Management ====================

  /**
   * POST /v1/testcase-agent/sessions
   * 启动 Phase 1 需求澄清会话
   */
  @Post('sessions')
  async startSession(@Body() req: StartSessionRequest) {
    return this.testcaseAgentService.startSession(req);
  }

  /**
   * GET /v1/testcase-agent/sessions
   * 获取所有活跃会话列表
   */
  @Get('sessions')
  async listSessions() {
    return this.testcaseAgentService.listSessions();
  }

  /**
   * GET /v1/testcase-agent/sessions/:sessionId
   * 获取会话详细信息（包括历史消息）
   */
  @Get('sessions/:sessionId')
  async getSessionDetail(@Param('sessionId') sessionId: string) {
    const session = await this.testcaseAgentService.getSessionDetail(sessionId);

    if (!session) {
      throw new HttpException('Session not found', HttpStatus.NOT_FOUND);
    }

    return session;
  }

  /**
   * DELETE /v1/testcase-agent/sessions/:sessionId
   * 删除指定会话
   */
  @Delete('sessions/:sessionId')
  async deleteSession(@Param('sessionId') sessionId: string) {
    const exists = await this.testcaseAgentService.sessionExists(sessionId);

    if (!exists) {
      throw new HttpException('Session not found', HttpStatus.NOT_FOUND);
    }

    return this.testcaseAgentService.deleteSession(sessionId);
  }

  // ==================== Phase 1: SSE Chat Stream ====================

  /**
   * POST /v1/testcase-agent/sessions/:sessionId/chat
   * SSE 流式对话（支持 HITL 中断）
   */
  @Post('sessions/:sessionId/chat')
  @Sse()
  chatStream(
    @Param('sessionId') sessionId: string,
    @Body() req: ChatRequest,
  ): Observable<MessageEvent> {
    return this.testcaseAgentService.chatStream(sessionId, req);
  }

  // ==================== Phase 1: Resume HITL ====================

  /**
   * POST /v1/testcase-agent/sessions/:sessionId/resume
   * 恢复 HITL 中断的会话
   */
  @Post('sessions/:sessionId/resume')
  async resumeHitl(
    @Param('sessionId') sessionId: string,
    @Body() req: ResumeRequest,
  ) {
    if (req.decision === 'edit' && (!req.modified_features || req.modified_features.length === 0)) {
      throw new HttpException(
        'Modified features required for edit decision',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!['approve', 'edit', 'reject'].includes(req.decision)) {
      throw new HttpException('Invalid decision type', HttpStatus.BAD_REQUEST);
    }

    return this.testcaseAgentService.resumeHitl(sessionId, req);
  }

  // ==================== Phase 2: Generation ====================

  /**
   * POST /v1/testcase-agent/generate
   * 启动并发生成任务（立即返回 task_id，前端轮询 /tasks/{id}）
   */
  @Post('generate')
  async startGeneration(@Body() req: StartGenerationRequest) {
    return this.testcaseAgentService.startGeneration(req);
  }

  /**
   * GET /v1/testcase-agent/tasks/:taskId
   * 查询任务状态
   */
  @Get('tasks/:taskId')
  async getTaskStatus(@Param('taskId') taskId: string) {
    const task = await this.testcaseAgentService.getTaskStatus(taskId);

    if (!task) {
      throw new HttpException('Task not found', HttpStatus.NOT_FOUND);
    }

    return task;
  }

  /**
   * GET /v1/testcase-agent/tasks/:taskId/stream
   * SSE 实时进度流
   */
  @Get('tasks/:taskId/stream')
  @Sse()
  taskStream(@Param('taskId') taskId: string): Observable<MessageEvent> {
    return this.testcaseAgentService.taskStream(taskId);
  }

  /**
   * POST /v1/testcase-agent/tasks/:taskId/save
   * 保存测试用例到项目（仅在任务完成后调用）
   */
  @Post('tasks/:taskId/save')
  async saveToProject(
    @Param('taskId') taskId: string,
    @Body() req: SaveRequest,
  ) {
    try {
      return await this.testcaseAgentService.saveToProject(taskId, req);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('Task not found')) {
        throw new HttpException('Task not found', HttpStatus.NOT_FOUND);
      }
      if (message.includes('Task not completed')) {
        throw new HttpException(message, HttpStatus.BAD_REQUEST);
      }
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * GET /v1/testcase-agent/tasks/:taskId/download
   * 下载测试用例文件
   */
  @Get('tasks/:taskId/download')
  async downloadTestcases(
    @Param('taskId') taskId: string,
    @Query('format') format: string = 'excel',
  ) {
    try {
      return await this.testcaseAgentService.downloadTestcases(taskId, format);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('Task not found')) {
        throw new HttpException('Task not found', HttpStatus.NOT_FOUND);
      }
      if (message.includes('Task not completed') || message.includes('Export file not found')) {
        throw new HttpException(message, HttpStatus.BAD_REQUEST);
      }
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ==================== Quality Analysis ====================

  /**
   * GET /v1/testcase-agent/tasks/:taskId/quality-report
   * 获取质量报告
   */
  @Get('tasks/:taskId/quality-report')
  async getQualityReport(@Param('taskId') taskId: string) {
    try {
      return await this.testcaseAgentService.getQualityReport(taskId);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('Task not found')) {
        throw new HttpException('Task not found', HttpStatus.NOT_FOUND);
      }
      if (message.includes('Task not completed')) {
        throw new HttpException(message, HttpStatus.BAD_REQUEST);
      }
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * GET /v1/testcase-agent/tasks/:taskId/coverage
   * 获取覆盖率统计
   */
  @Get('tasks/:taskId/coverage')
  async getCoverageStats(@Param('taskId') taskId: string) {
    try {
      return await this.testcaseAgentService.getCoverageStats(taskId);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('Task not found')) {
        throw new HttpException('Task not found', HttpStatus.NOT_FOUND);
      }
      if (message.includes('Task not completed')) {
        throw new HttpException(message, HttpStatus.BAD_REQUEST);
      }
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * GET /v1/testcase-agent/tasks/:taskId/distribution
   * 获取用例分布
   */
  @Get('tasks/:taskId/distribution')
  async getDistributionStats(@Param('taskId') taskId: string) {
    try {
      return await this.testcaseAgentService.getDistributionStats(taskId);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('Task not found')) {
        throw new HttpException('Task not found', HttpStatus.NOT_FOUND);
      }
      if (message.includes('Task not completed')) {
        throw new HttpException(message, HttpStatus.BAD_REQUEST);
      }
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
