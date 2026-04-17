import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, BaseMessage, ToolMessage, AIMessage } from '@langchain/core/messages';
import { IterableReadableStream } from '@langchain/core/utils/stream';
import { timeTools } from '../tools/time.tools';

/**
 * UseToolAgent - 支持工具调用的 ChatAgent
 * 使用 bindTools 绑定工具，处理工具调用循环
 */
export class UseToolAgent {
  private llm: ChatOpenAI;
  private llmWithTools: ReturnType<ChatOpenAI['bindTools']>;
  private defaultSystemPrompt = `你是一个有帮助的 AI 助手，可以使用时间工具来回答与时间、日期相关的问题。

重要规则：
1. 任何涉及相对时间的问题，必须先调用 get_current_time 获取当前精确时间作为参照基准
2. 相对时间表述包括但不限于：
   - 今天、明天、昨天、后天、前天
   - 今年、去年、明年、前年、后年
   - 这个月、上个月、下个月
   - 本周、上周、下周
   - 最近、刚刚、过去、之前、之后
   - X天前、X天后、X个月前、X年前等
3. 不要依赖训练数据假设当前日期，始终用工具获取实时信息
4. 先确定时间基准点，再进行日期计算
`;

  constructor() {
    this.llm = new ChatOpenAI({
      model: 'qwen-plus',
      apiKey: process.env.DASHSCOPE_API_KEY,
      streaming: true,
      configuration: {
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      },
    });

    // 绑定时间工具
    this.llmWithTools = this.llm.bindTools(timeTools);
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
   * 执行工具调用并返回工具消息
   */
  private async executeToolCalls(aiMessage: AIMessage): Promise<ToolMessage[]> {
    const toolMessages: ToolMessage[] = [];

    if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      for (const toolCall of aiMessage.tool_calls) {
        // 查找对应的工具
        const tool = timeTools.find(t => t.name === toolCall.name);
        if (tool) {
          // 执行工具
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await (tool as any).invoke(toolCall.args);
          toolMessages.push(
            new ToolMessage({
              content: typeof result === 'string' ? result : JSON.stringify(result),
              tool_call_id: toolCall.id!,
            })
          );
        }
      }
    }

    return toolMessages;
  }

  /**
   * 创建流式响应 - 支持多轮工具调用循环
   * @param message 用户消息
   * @param systemPrompt 系统提示词
   */
  async createStream(message: string, systemPrompt?: string): Promise<IterableReadableStream<AIMessage>> {
    const messages = this.buildMessages(message, systemPrompt);

    // 工具调用循环，直到 LLM 不再请求工具
    let response = await this.llmWithTools.invoke(messages);
    
    while (response.tool_calls && response.tool_calls.length > 0) {
      // 将 AI 响应添加到消息历史
      messages.push(response);

      // 执行所有工具调用
      const toolMessages = await this.executeToolCalls(response);
      messages.push(...toolMessages);

      // 再次调用 LLM，检查是否还需要更多工具
      response = await this.llmWithTools.invoke(messages);
    }

    // 没有更多工具调用，返回最终流式响应
    return this.llmWithTools.stream(messages);
  }
}

// 导出单例实例
export const useToolAgent = new UseToolAgent();
