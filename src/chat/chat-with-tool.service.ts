import { Injectable, MessageEvent } from '@nestjs/common';
import { Subject } from 'rxjs';
import { useToolAgent } from '../agent-for-langchain-start/use-tool.agent';

/**
 * 工具调用聊天服务 - 处理带工具调用的流式聊天逻辑
 */
@Injectable()
export class ChatWithToolService {
  /**
   * 使用时间工具进行流式聊天
   */
  streamChat(message: string, subject: Subject<MessageEvent>, systemPrompt?: string): void {
    this.handleStreamChat(message, subject, systemPrompt);
  }

  /**
   * 流式聊天处理逻辑（支持工具调用）
   */
  private async handleStreamChat(
    message: string,
    subject: Subject<MessageEvent>,
    systemPrompt?: string,
  ): Promise<void> {
    try {
      // 发送开始事件
      subject.next({
        data: JSON.stringify({ type: 'start', message: '开始生成响应...' }),
      });

      // 创建流式响应（内部处理工具调用循环）
      const stream = await useToolAgent.createStream(message, systemPrompt);

      // 处理流式输出
      for await (const chunk of stream) {
        const content = chunk.content;
        if (typeof content === 'string' && content) {
          subject.next({
            data: JSON.stringify({ type: 'chunk', content }),
          });
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
