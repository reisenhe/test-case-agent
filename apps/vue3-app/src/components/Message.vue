<template>
  <div class="message" :class="{ 'user-message': isUserMessage, 'ai-message': isAIMessage }">
    <div class="message-bubble">
      <div class="message-content" v-html="renderedContent"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { MessageRoleEnum } from '../enums/message.enum';
import { useMarkdownRenderer } from '../utils/markdown.util';

interface Props {
  content: string;
  role: MessageRoleEnum;
}

const props = defineProps<Props>();

const { renderMarkdown } = useMarkdownRenderer();

const isUserMessage = computed(() => props.role === MessageRoleEnum.USER);
const isAIMessage = computed(() => props.role === MessageRoleEnum.ASSISTANT);

const renderedContent = computed(() => {
  return renderMarkdown(props.content);
});
</script>

<style scoped>
.message {
  display: flex;
  margin-bottom: 20px;
  animation: fadeIn 0.3s ease-out;
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

.user-message {
  justify-content: flex-end;
  align-self: flex-end;
}

.ai-message {
  justify-content: flex-start;
  align-self: flex-start;
}

.message-bubble {
  max-width: 75%;
  padding: 14px 18px;
  border-radius: 20px;
  word-wrap: break-word;
  transition: transform 0.2s ease;
}

.message-bubble:hover {
  transform: scale(1.01);
}

.user-message .message-bubble {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: white;
  border-bottom-right-radius: 6px;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.3);
}

.ai-message .message-bubble {
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  color: #374151;
  border-bottom-left-radius: 6px;
  box-shadow: 
    0 4px 14px rgba(0, 0, 0, 0.08),
    0 1px 3px rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.04);
}

.message-content {
  line-height: 1.6;
  font-size: 15px;
  text-align: left;
}

/* 确保 Markdown 内容正确显示 */
.message-content :deep(p) {
  margin: 0 0 8px 0;
}

.message-content :deep(p:last-child) {
  margin-bottom: 0;
}

.message-content :deep(ul),
.message-content :deep(ol) {
  margin: 10px 0;
  padding-left: 22px;
}

.message-content :deep(li) {
  margin-bottom: 4px;
}

.message-content :deep(code) {
  padding: 3px 6px;
  border-radius: 6px;
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 13px;
}

.user-message .message-content :deep(code) {
  background-color: rgba(255, 255, 255, 0.2);
}

.ai-message .message-content :deep(code) {
  background-color: rgba(99, 102, 241, 0.1);
  color: #6366f1;
}

.message-content :deep(pre) {
  margin: 12px 0;
  padding: 14px;
  border-radius: 10px;
  overflow-x: auto;
}

.user-message .message-content :deep(pre) {
  background-color: rgba(0, 0, 0, 0.15);
}

.ai-message .message-content :deep(pre) {
  background-color: #1e1e2e;
  color: #cdd6f4;
}

.ai-message .message-content :deep(pre code) {
  background: transparent;
  color: inherit;
  padding: 0;
}

.message-content :deep(a) {
  text-decoration: none;
  border-bottom: 1px solid currentColor;
  transition: opacity 0.2s;
}

.user-message .message-content :deep(a) {
  color: #e0e7ff;
}

.ai-message .message-content :deep(a) {
  color: #6366f1;
}

.message-content :deep(a:hover) {
  opacity: 0.8;
}

.message-content :deep(blockquote) {
  margin: 10px 0;
  padding: 10px 16px;
  border-radius: 8px;
}

.user-message .message-content :deep(blockquote) {
  background-color: rgba(255, 255, 255, 0.15);
  border-left: 3px solid rgba(255, 255, 255, 0.5);
}

.ai-message .message-content :deep(blockquote) {
  background-color: rgba(99, 102, 241, 0.08);
  border-left: 3px solid #6366f1;
}
</style>
