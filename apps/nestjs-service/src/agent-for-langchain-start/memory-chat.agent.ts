import { createAgent, ReactAgent } from "langchain";
import { ChatOpenAI } from '@langchain/openai';
import { MemorySaver } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';

/**
 * MemoryChatAgent - 使用 LangGraph MemorySaver 实现短期记忆
 * 通过 thread_id 管理不同会话的上下文
 */
export class MemoryChatAgent {
  private agent: ReactAgent;
  private checkpointer: MemorySaver;

  private defaultSystemPrompt = `你是一个有帮助的 AI 助手，具备记忆能力。
    你会自称 Cortana
`;

  constructor() {
    const llm = new ChatOpenAI({
      model: 'qwen-plus',
      apiKey: process.env.DASHSCOPE_API_KEY,
      streaming: true,
      configuration: {
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      },
    });

    // 使用 MemorySaver 作为 checkpointer
    this.checkpointer = new MemorySaver();

    // 使用 createAgent 创建带记忆的 agent
    this.agent = createAgent({
      model: llm,
      tools: [],
      systemPrompt: this.defaultSystemPrompt,
      checkpointer: this.checkpointer,
    });
  }

  /**
   * 创建流式响应 - 使用 thread_id 管理会话记忆
   * @param message 用户消息
   * @param threadId 会话线程 ID（LangGraph 自动管理不同 thread 的记忆）
   * @returns 消息流，格式为 [AIMessageChunk, metadata] tuple
   */
  async createStream(
    message: string,
    threadId: string = 'default',
  ) {
    const config = {
      configurable: {
        thread_id: threadId,  // LangGraph 通过这个 key 自动管理记忆
      },
    };

    // 使用 streamMode: "messages" 获取消息流
    // 返回格式: [AIMessageChunk, metadata] tuple
    // Service 层负责迭代和提取内容
    return this.agent.stream(
      { messages: [new HumanMessage(message)] },
      { ...config, streamMode: 'messages' }
    );
  }
}

// 导出单例实例
export const memoryChatAgent = new MemoryChatAgent();