import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChatController } from './chat/chat.controller';
import { ChatService } from './chat/chat.service';
import { OpenAIChatService } from './chat/openai-chat.service';
import { ChatWithToolService } from './chat/chat-with-tool.service';
import { MemoryChatService } from './chat/memory-chat.service';
import { TestcaseAgentModule } from './agent-for-test-case/testcase/testcase-agent-module';

@Module({
  imports: [TestcaseAgentModule],
  controllers: [AppController, ChatController],
  providers: [
    AppService,
    ChatService,
    OpenAIChatService,
    ChatWithToolService,
    MemoryChatService,
  ],
})
export class AppModule {}
