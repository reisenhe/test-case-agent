import { Injectable, MessageEvent } from '@nestjs/common';
import { Subject } from 'rxjs';
import { memoryChatAgent } from '../agent-for-langchain-start/memory-chat.agent';

/**
 * 记忆聊天服务 - 支持短期上下文记忆的流式聊天
 * 同一个 threadId 内的对话会保持上下文记忆
 */
@Injectable()
export class MemoryChatService {
  /**
   * 流式聊天 - 支持会话记忆
   * @param message 用户消息
   * @param subject SSE 响应主题
   * @param threadId 会话线程 ID（用于区分不同会话）
   * @param systemPrompt 系统提示词
   */
  async streamChat(
    message: string,
    subject: Subject<MessageEvent>,
    threadId: string = 'default',
  ): Promise<void> {
    try {
      // 发送开始事件
      subject.next({
        data: JSON.stringify({ type: 'start', message: '开始生成响应...' }),
      });

      // 创建流式响应（带记忆）- 返回 [AIMessageChunk, metadata] tuple 流
      const stream = await memoryChatAgent.createStream(message, threadId);

      // 处理流式输出 - 解析 streamMode: "messages" 格式
      for await (const chunk of stream) {
        // streamMode: "messages" 返回 [AIMessageChunk, metadata] 格式
        if (Array.isArray(chunk) && chunk.length >= 1) {
          const messageChunk = chunk[0];
          if (messageChunk && typeof messageChunk.content === 'string' && messageChunk.content) {
            subject.next({
              data: JSON.stringify({ type: 'chunk', content: messageChunk.content }),
            });
          }
        }
      }

      // 发送完成事件
      subject.next({
        data: JSON.stringify({ type: 'end', message: '响应完成' }),
      });

      // 关闭流
      subject.complete();
    } catch (error) {
      // 发送错误事件
      subject.next({
        data: JSON.stringify({
          type: 'error',
          message: error instanceof Error ? error.message : '未知错误',
        }),
      });
      subject.complete();
    }
  }
}
