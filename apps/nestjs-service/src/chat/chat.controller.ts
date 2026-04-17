import { Controller, Post, Body, Sse, Query, MessageEvent, Delete, Param } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { ChatService } from './chat.service';
import { OpenAIChatService } from './openai-chat.service';
import { ChatWithToolService } from './chat-with-tool.service';
import { MemoryChatService } from './memory-chat.service';

/**
 * SSE 聊天控制器
 * 提供流式聊天接口
 */
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly openAIChatService: OpenAIChatService,
    private readonly chatWithToolService: ChatWithToolService,
    private readonly memoryChatService: MemoryChatService,
  ) {}

  // ==================== LangChain ChatOpenAI 接口 ====================

  /**
   * SSE 流式聊天接口
   * GET /chat/stream?message=xxx
   */
  @Sse('stream')
  streamChat(@Query('message') message: string): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    this.chatService.streamChat(message, subject);
    return subject.asObservable();
  }

  /**
   * POST 方式的 SSE 流式聊天接口
   * POST /chat/stream
   */
  @Post('stream')
  @Sse()
  streamChatPost(@Body() body: { message: string; systemPrompt?: string }): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    this.chatService.streamChat(body.message, subject, body.systemPrompt);
    return subject.asObservable();
  }

  // ==================== LangChain DashScope 原生接口 ====================

  /**
   * DashScope 原生版 SSE 流式聊天接口
   * GET /chat/dashscope/stream?message=xxx
   */
  @Sse('dashscope/stream')
  dashscopeStreamChat(@Query('message') message: string): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    this.chatService.streamDashScopeChat(message, subject);
    return subject.asObservable();
  }

  /**
   * DashScope 原生版 POST 方式的 SSE 流式聊天接口
   * POST /chat/dashscope/stream
   */
  @Post('dashscope/stream')
  @Sse()
  dashscopeStreamChatPost(@Body() body: { message: string; systemPrompt?: string }): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    this.chatService.streamDashScopeChat(body.message, subject, body.systemPrompt);
    return subject.asObservable();
  }

  // ==================== OpenAI SDK 接口 (非 LangChain) ====================

  /**
   * OpenAI SDK 版 SSE 流式聊天接口
   * GET /chat/openai/stream?message=xxx
   */
  @Sse('openai/stream')
  openaiStreamChat(@Query('message') message: string): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    this.openAIChatService.streamChat(message, subject);
    return subject.asObservable();
  }

  /**
   * OpenAI SDK 版 POST 方式的 SSE 流式聊天接口
   * POST /chat/openai/stream
   */
  @Post('openai/stream')
  @Sse()
  openaiStreamChatPost(@Body() body: { message: string; systemPrompt?: string }): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    this.openAIChatService.streamChat(body.message, subject, body.systemPrompt);
    return subject.asObservable();
  }

  // ==================== 工具调用接口 ====================

  /**
   * 工具调用版 SSE 流式聊天接口
   * GET /chat/tool/stream?message=xxx
   */
  @Sse('tool/stream')
  toolStreamChat(@Query('message') message: string): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    this.chatWithToolService.streamChat(message, subject);
    return subject.asObservable();
  }

  /**
   * 工具调用版 POST 方式的 SSE 流式聊天接口
   * POST /chat/tool/stream
   */
  @Post('tool/stream')
  @Sse()
  toolStreamChatPost(@Body() body: { message: string; systemPrompt?: string }): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    this.chatWithToolService.streamChat(body.message, subject, body.systemPrompt);
    return subject.asObservable();
  }

  // ==================== 记忆聊天接口 ====================

  /**
   * 记忆聊天版 SSE 流式聊天接口
   * GET /chat/memory/stream?message=xxx&threadId=xxx
   */
  @Sse('memory/stream')
  memoryStreamChat(
    @Query('message') message: string,
    @Query('threadId') threadId?: string,
  ): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    this.memoryChatService.streamChat(message, subject, threadId);
    return subject.asObservable();
  }

  /**
   * 记忆聊天版 POST 方式的 SSE 流式聊天接口
   * POST /chat/memory/stream
   */
  @Post('memory/stream')
  @Sse()
  memoryStreamChatPost(
    @Body() body: { message: string; threadId?: string; },
  ): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    this.memoryChatService.streamChat(body.message, subject, body.threadId);
    return subject.asObservable();
  }

}
