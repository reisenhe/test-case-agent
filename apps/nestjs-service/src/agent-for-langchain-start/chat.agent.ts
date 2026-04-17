import { ChatOpenAI } from '@langchain/openai';

/**
 * ChatAgent - 基于 ChatOpenAI（兼容 DashScope API）
 * 只负责 LLM 初始化，暴露 llm 实例供 Service 使用
 */
export class ChatAgent {
  public readonly llm: ChatOpenAI;

  constructor() {
    this.llm = new ChatOpenAI({
      model: 'qwen-plus',
      apiKey: process.env.DASHSCOPE_API_KEY,
      streaming: true,
      configuration: {
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      },
    });
  }
}

// 导出单例实例
export const chatAgent = new ChatAgent();
