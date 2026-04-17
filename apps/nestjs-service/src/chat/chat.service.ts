import { Injectable, MessageEvent } from '@nestjs/common';
import { Subject } from 'rxjs';
import { HumanMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { chatAgent } from '../agent-for-langchain-start/chat.agent';
import { dashScopeChatAgent } from '../agent-for-langchain-start/dashscope-chat.agent';

/**
 * 聊天服务 - 处理 LangChain 相关的流式聊天逻辑
 */
@Injectable()
export class ChatService {
  private defaultSystemPrompt = '你是一个有帮助的 AI 助手。';

  /**
   * 使用 ChatOpenAI (兼容模式) 进行流式聊天
   */
  streamChat(message: string, subject: Subject<MessageEvent>, systemPrompt?: string): void {
    this.handleStreamChat(chatAgent.llm, message, subject, systemPrompt);
  }

  /**
   * 使用 DashScope 原生 SDK 进行流式聊天
   */
  streamDashScopeChat(message: string, subject: Subject<MessageEvent>, systemPrompt?: string): void {
    this.handleStreamChat(dashScopeChatAgent.llm, message, subject, systemPrompt);
  }

  /**
   * 构建消息数组
   */
  private buildMessages(message: string, systemPrompt?: string): BaseMessage[] {
    return [
      new SystemMessage(systemPrompt ?? this.defaultSystemPrompt),
      new HumanMessage(message),
    ];
  }

  /**
   * 通用流式聊天处理逻辑
   */
  private async handleStreamChat(
    llm: BaseChatModel,
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
      const stream = await llm.stream(this.buildMessages(message, systemPrompt));

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
