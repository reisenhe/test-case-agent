/**
 * Configuration for TestCase Generator Agent (TypeScript port of config.py).
 */

export interface AgentConfig {
  model: string;
  temperature: number;
  maxIterations: number;
  recursionLimit: number;
}

export interface ServerConfig {
  host: string;
  port: number;
  reload: boolean;
}

export interface StorageConfig {
  checkpointDb: string;
  exportsDir: string;
}

export type Phase =
  | 'initialized'
  | 'requirement_input'
  | 'features_extracted'
  | 'features_confirmed'
  | 'testcases_generated'
  | 'testcases_confirmed'
  | 'exported'
  | 'completed';

export const PHASE_TRANSITIONS: Record<Phase, Phase[]> = {
  initialized: ['requirement_input'],
  requirement_input: ['features_extracted'],
  features_extracted: ['features_confirmed'],
  features_confirmed: ['testcases_generated'],
  testcases_generated: ['testcases_confirmed'],
  testcases_confirmed: ['exported'],
  exported: ['completed'],
  completed: [],
};

export const agentConfig: AgentConfig = {
  model:
    process.env.TESTCASE_LLM_MODEL ||
    process.env.DASHSCOPE_LLM_MODEL ||
    'qwen-plus',
  temperature: parseFloat(process.env.TESTCASE_TEMPERATURE ?? '0.7'),
  maxIterations: 100,
  recursionLimit: 1000,
};

export const serverConfig: ServerConfig = {
  host: process.env.TESTCASE_HOST || '0.0.0.0',
  port: parseInt(process.env.TESTCASE_PORT ?? '8001', 10),
  reload: process.env.TESTCASE_RELOAD?.toLowerCase() === 'true',
};

export const storageConfig: StorageConfig = {
  checkpointDb:
    process.env.TESTCASE_CHECKPOINT_DB || 'testcase_checkpoints.db',
  exportsDir: process.env.TESTCASE_EXPORTS_DIR || 'exports',
};
