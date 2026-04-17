<template>
  <div class="chat-message-list" ref="containerRef">
    <Message
      v-for="(message, index) in messages"
      :key="index"
      :content="message.content"
      :role="normalizeRole(message.role)"
    />
    <!-- Streaming token display -->
    <div v-if="currentToken" class="message ai-message streaming-message">
      <div class="message-bubble">
        <div class="message-content" v-html="renderedToken"></div>
        <span class="typing-cursor">|</span>
      </div>
    </div>
    <!-- Loading indicator -->
    <div v-if="isLoading && !currentToken" class="loading-indicator">
      <span>AI 正在思考...</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue';
import Message from '../Message.vue';
import { MessageRoleEnum } from '../../enums/message.enum';
import { useMarkdownRenderer } from '../../utils/markdown.util';

interface ChatMessage {
  role: MessageRoleEnum | 'user' | 'assistant';
  content: string;
  time?: string;
}

interface Props {
  messages: ChatMessage[];
  currentToken?: string;
  isLoading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  currentToken: '',
  isLoading: false,
});

// Normalize role to MessageRoleEnum
function normalizeRole(role: MessageRoleEnum | 'user' | 'assistant'): MessageRoleEnum {
  if (role === 'user') return MessageRoleEnum.USER;
  if (role === 'assistant') return MessageRoleEnum.ASSISTANT;
  return role;
}

const containerRef = ref<HTMLElement | null>(null);
const { renderMarkdown } = useMarkdownRenderer();

const renderedToken = computed(() => {
  return renderMarkdown(props.currentToken);
});

function scrollToBottom() {
  nextTick(() => {
    if (containerRef.value) {
      containerRef.value.scrollTop = containerRef.value.scrollHeight;
    }
  });
}

// Auto scroll when messages or token changes
watch(() => props.messages.length, scrollToBottom);
watch(() => props.currentToken, scrollToBottom);
</script>

<style scoped>
.chat-message-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.streaming-message {
  display: flex;
  justify-content: flex-start;
  animation: fadeIn 0.3s ease-out;
}

.streaming-message .message-bubble {
  max-width: 75%;
  padding: 14px 18px;
  border-radius: 20px;
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  color: #374151;
  border-bottom-left-radius: 6px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.04);
}

.streaming-message .message-content {
  display: inline;
  line-height: 1.6;
  font-size: 15px;
}

.typing-cursor {
  display: inline-block;
  animation: blink 1s infinite;
  color: #667eea;
  font-weight: bold;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.loading-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border-radius: 12px;
  color: #92400e;
  font-size: 14px;
  font-weight: 500;
}

.loading-indicator::before {
  content: '';
  width: 8px;
  height: 8px;
  background: #f59e0b;
  border-radius: 50%;
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.8); }
}

/* Scrollbar styling */
.chat-message-list::-webkit-scrollbar {
  width: 6px;
}

.chat-message-list::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 3px;
}

.chat-message-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 3px;
}

.chat-message-list::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.25);
}
</style>
