/**
 * TestCase Agent Module
 * Barrel export for TestCase Agent v5.3
 *
 * Re-exports Controller, Service, and Module for convenient imports.
 */

export { TestcaseAgentController } from './testcase-agent.controller';
export { TestcaseAgentService } from './testcase-agent.service';

import { Module } from '@nestjs/common';
import { TestcaseAgentController } from './testcase-agent.controller';
import { TestcaseAgentService } from './testcase-agent.service';

@Module({
  controllers: [TestcaseAgentController],
  providers: [TestcaseAgentService],
})
export class TestcaseAgentModule {}
