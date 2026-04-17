/**
 * TestCase Agent v5.3 - Enterprise-grade Test Case Generator
 * (TypeScript port of __init__.py)
 *
 * Hybrid architecture:
 *  - Phase 1: Requirement clarification with LangGraph ReAct Agent + HITL
 *  - Phase 2: Parallel generation with engineering-grade concurrency control
 */

export const VERSION = '5.3.0';

// Phase 1: 需求澄清
export {
  createChatAgent,
  getChatAgent,
  getFullContextForGeneration,
  extractDeltaContext,
  confirmFeaturesTool,
  SessionManager,
  getSessionManager,
  initSessionManager,
  closeSessionManager,
} from './phase1';

// Phase 2: 并发生成
export {
  TestCaseGenerator,
  TaskManager,
  MemoryPool,
  analyzeQuality,
} from './phase2';

// API (NestJS Module + Controller)
export { TestcaseAgentController, TestcaseAgentModule } from './testcase-agent-module';

// Shared models
export * from './shared/models';

// Config
export * from './config';
