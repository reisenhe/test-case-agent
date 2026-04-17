import { ChatAlibabaTongyi } from '@langchain/community/chat_models/alibaba_tongyi';

/**
 * DashScope ChatAgent - 基于 ChatAlibabaTongyi 原生 SDK
 * 只负责 LLM 初始化，暴露 llm 实例供 Service 使用
 */
export class DashScopeChatAgent {
  public readonly llm: ChatAlibabaTongyi;

  constructor() {
    this.llm = new ChatAlibabaTongyi({
      model: 'qwen-plus',
      temperature: 0.7,
      alibabaApiKey: process.env.DASHSCOPE_API_KEY,
      streaming: true,
    });
  }
}

// 导出单例实例
export const dashScopeChatAgent = new DashScopeChatAgent();
