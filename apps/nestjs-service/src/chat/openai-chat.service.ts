import { Injectable, MessageEvent } from '@nestjs/common';
import { Subject } from 'rxjs';
import { chatAgent } from '../agent-for-langchain-start/openai-chat.agent';

/**
 * OpenAI 聊天服务 - 处理 OpenAI SDK 相关的流式聊天逻辑
 */
@Injectable()
export class OpenAIChatService {
  /**
   * 使用 OpenAI SDK 进行流式聊天
   */
  streamChat(message: string, subject: Subject<MessageEvent>, systemPrompt?: string): void {
    this.handleStreamChat(message, subject, systemPrompt);
  }

  /**
   * 流式聊天处理逻辑
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

      // 创建流式响应
      const stream = await chatAgent.createStream(message, systemPrompt);

      // 处理流式输出
      for await (const chunk of stream) {
        // 最后一个 chunk 不包含 choices，但包含 usage 信息
        if (chunk.choices && chunk.choices.length > 0) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            subject.next({
              data: JSON.stringify({ type: 'chunk', content }),
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
