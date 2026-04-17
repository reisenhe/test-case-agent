/**
 * Phase 1 Tools for TestCase Agent (TypeScript port of phase1/tools.py).
 *
 * Defines the confirm_features tool used in Phase 1 (requirement clarification).
 * Calling this tool triggers a HITL (Human-in-the-Loop) interrupt.
 */

import { tool } from '@langchain/core/tools';
import { interrupt } from '@langchain/langgraph';
import { z } from 'zod';

/**
 * confirm_features tool
 *
 * When called by the agent, this tool interrupts graph execution and waits
 * for human input. The human can:
 *   - approve: accept the extracted feature points as-is
 *   - edit:    provide a modified version of the feature points
 *   - reject:  reject and request re-extraction
 *
 * Note: The function body triggers the HITL interrupt mechanism.
 *       Execution resumes when the caller provides a Command({ resume: ... }).
 */
export const confirmFeaturesTool = tool(
  async (input: { feature_points: Record<string, unknown>[] }) => {
    // Trigger HITL interrupt – graph execution pauses here until resumed
    const decision = interrupt({
      action_requests: [
        {
          action: 'confirm_features',
          args: { feature_points: input.feature_points },
        },
      ],
    });

    return JSON.stringify({
      feature_points: input.feature_points,
      decision,
      status: 'pending_review',
    });
  },
  {
    name: 'confirm_features',
    description: `确认提取的功能点列表。

调用此工具会触发人工审核流程（HITL - Human-in-the-Loop）。
用户可以：
- approve: 批准功能点列表
- edit: 修改功能点后批准
- reject: 拒绝并要求重新提取

此函数体不会真正完成执行，HITL 机制会中断并返回用户决策。`,
    schema: z.object({
      feature_points: z
        .array(z.record(z.string(), z.unknown()))
        .describe('提取的功能点列表'),
    }),
  },
);
