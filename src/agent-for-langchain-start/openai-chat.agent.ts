import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

/**
 * ChatAgent - 基于 OpenAI SDK 的聊天代理（兼容通义千问 DashScope API）
 */
export class ChatAgent {
  private client: OpenAI;
  private model: string;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.DASHSCOPE_API_KEY,
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });
    this.model = 'qwen-plus';
  }

  /**
   * 创建流式响应 - 返回 OpenAI Stream 对象
   * @param message 用户消息
   * @param systemPrompt 系统提示词
   */
  async createStream(message: string, systemPrompt = '你是一个有帮助的 AI 助手。') {
    return this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ] as ChatCompletionMessageParam[],
      stream: true,
      stream_options: { include_usage: true },
    });
  }

  /**
   * 非流式聊天 - 返回完整响应
   * @param message 用户消息
   * @param systemPrompt 系统提示词
   */
  async chat(
    message: string,
    systemPrompt = '你是一个有帮助的 AI 助手。',
  ): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ] as ChatCompletionMessageParam[],
    });

    return response.choices[0]?.message?.content || '';
  }
}

// 导出单例实例
export const chatAgent = new ChatAgent();
