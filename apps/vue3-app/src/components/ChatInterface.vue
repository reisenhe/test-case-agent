<template>
  <div class="chat-interface">
    <div class="chat-header">
      <h1>AI 对话工具</h1>
    </div>
    
    <div class="chat-messages" ref="messagesContainer">
      <Message 
        v-for="(message, index) in messages" 
        :key="index"
        :content="message.content"
        :role="message.role"
      />
      <div v-if="isLoading" class="loading-indicator">
        <span>AI 正在思考...</span>
      </div>
    </div>
    
    <div class="api-selector">
      <label>接口选择：</label>
      <select v-model="selectedApiIndex" :disabled="isLoading">
        <option v-for="(api, index) in apiOptions" :key="index" :value="index">
          {{ api.label }}
        </option>
      </select>
      <span class="api-hint">{{ currentApiHint }}</span>
    </div>
    
    <div class="chat-input">
      <textarea
        v-model="inputMessage"
        placeholder="输入你的问题..."
        @keyup.enter.exact="sendMessage"
        @keyup.enter.shift="inputMessage += '\n'"
        :disabled="isLoading"
      ></textarea>
      <button 
        @click="sendMessage"
        :disabled="!inputMessage.trim() || isLoading"
      >
        发送
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, computed } from 'vue';
import Message from './Message.vue';
import { MessageRoleEnum } from '../enums/message.enum';
import { createEventStream } from '../controllers/sse.controller';

interface Message {
  content: string;
  role: MessageRoleEnum;
}

interface ApiOption {
  value: string;
  label: string;
  hint: string;
  threadId?: string;
}

const messages = ref<Message[]>([
  {
    content: '你好！我是一个 AI 助手，有什么我可以帮助你的吗？',
    role: MessageRoleEnum.ASSISTANT
  }
]);

const inputMessage = ref('');
const isLoading = ref(false);
const messagesContainer = ref<HTMLElement | null>(null);

// 可用的 API 接口列表
const apiOptions: ApiOption[] = [
  { 
    value: '/api/chat/stream', 
    label: '基础聊天 (ChatOpenAI)', 
    hint: '使用 ChatOpenAI 兼容模式，无工具调用',
  },
  { 
    value: '/api/chat/dashscope/stream', 
    label: '基础聊天 (DashScope)', 
    hint: '使用 ChatAlibabaTongyi 原生 SDK，无工具调用',
  },
  { 
    value: '/api/chat/tool/stream', 
    label: '工具调用 (时间工具)', 
    hint: '支持时间查询、日期计算等工具调用',
  },
  { 
    value: '/api/chat/memory/stream', 
    label: '记忆聊天 A (Thread-A)', 
    hint: '短期记忆 - 会话 A，与 B 独立',
    threadId: 'thread-a',
  },
  { 
    value: '/api/chat/memory/stream', 
    label: '记忆聊天 B (Thread-B)', 
    hint: '短期记忆 - 会话 B，与 A 独立',
    threadId: 'thread-b',
  },
];

const selectedApiIndex = ref(2); // 默认选择工具调用接口

// 基于索引计算当前选中的 API 配置
const currentApi = computed(() => apiOptions[selectedApiIndex.value]);
const currentApiHint = computed(() => currentApi.value?.hint || '');
const currentThreadId = computed(() => currentApi.value?.threadId);

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
}

function sendMessage() {
  const message = inputMessage.value.trim();
  if (!message || isLoading.value) return;

  // 添加用户消息
  messages.value.push({
    content: message,
    role: MessageRoleEnum.USER
  });

  inputMessage.value = '';
  isLoading.value = true;

  scrollToBottom();

  // 添加 AI 回复占位
  const aiMessageIndex = messages.value.length;
  messages.value.push({
    content: '',
    role: MessageRoleEnum.ASSISTANT
  });

  // 构建请求体，如果有 threadId 则添加
  const requestBody: { message: string; threadId?: string } = { message };
  if (currentThreadId.value) {
    requestBody.threadId = currentThreadId.value;
  }

  // 使用 createEventStream 与后端进行流式通信
  createEventStream(
    currentApi.value.value,
    requestBody,
    {
      onopen: async (response) => {
        if (!response.ok) {
          console.error('连接失败:', response.status);
          messages.value[aiMessageIndex].content = '连接失败，请重试';
          isLoading.value = false;
        }
      },
      onmessage: (msg) => {
        try {
          const parsedData = JSON.parse(msg.data);
          
          if (parsedData.type === 'chunk' && parsedData.content) {
            // 流式追加内容
            messages.value[aiMessageIndex].content += parsedData.content;
            scrollToBottom();
          } else if (parsedData.type === 'end') {
            isLoading.value = false;
            scrollToBottom();
          } else if (parsedData.type === 'error') {
            messages.value[aiMessageIndex].content = `错误: ${parsedData.message}`;
            isLoading.value = false;
          }
        } catch (error) {
          console.error('解析消息失败:', error);
        }
      },
      onclose: () => {
        isLoading.value = false;
      },
      onerror: (err) => {
        console.error('发生错误:', err);
        if (!messages.value[aiMessageIndex].content) {
          messages.value[aiMessageIndex].content = '连接出错，请重试';
        }
        isLoading.value = false;
      }
    }
  );
}

onMounted(() => {
  scrollToBottom();
});
</script>

<style scoped>
.chat-interface {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 900px;
  margin: 0 auto;
  padding: 24px 32px;
  box-sizing: border-box;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%);
}

.chat-header {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.chat-header h1 {
  font-size: 26px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0;
  letter-spacing: -0.5px;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  margin-bottom: 20px;
  box-shadow: 
    0 4px 24px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.04);
}

.chat-input {
  display: flex;
  gap: 14px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 16px;
  box-shadow: 
    0 4px 20px rgba(0, 0, 0, 0.08),
    0 1px 3px rgba(0, 0, 0, 0.04);
}

.chat-input textarea {
  flex: 1;
  padding: 14px 18px;
  border: 2px solid #e8e8e8;
  border-radius: 12px;
  resize: none;
  height: 80px;
  font-size: 15px;
  font-family: inherit;
  background: #fafafa;
  color: #333;
  transition: all 0.25s ease;
}

.chat-input textarea:focus {
  outline: none;
  border-color: #6366f1;
  background: #fff;
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
}

.chat-input textarea::placeholder {
  color: #9ca3af;
}

.chat-input button {
  padding: 0 28px;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: white;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 500;
  transition: all 0.25s ease;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
}

.chat-input button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.45);
}

.chat-input button:active:not(:disabled) {
  transform: translateY(0);
}

.chat-input button:disabled {
  background: linear-gradient(135deg, #d1d5db 0%, #c4c7cc 100%);
  cursor: not-allowed;
  box-shadow: none;
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

/* 滚动条样式 */
.chat-messages::-webkit-scrollbar {
  width: 6px;
}

.chat-messages::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 3px;
}

.chat-messages::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 3px;
  transition: background 0.2s;
}

.chat-messages::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.25);
}

.api-selector {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 12px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.api-selector label {
  font-size: 14px;
  font-weight: 500;
  color: #4b5563;
  white-space: nowrap;
}

.api-selector select {
  padding: 8px 12px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  background: #fff;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 200px;
}

.api-selector select:hover:not(:disabled) {
  border-color: #6366f1;
}

.api-selector select:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.api-selector select:disabled {
  background: #f3f4f6;
  cursor: not-allowed;
  opacity: 0.7;
}

.api-hint {
  font-size: 12px;
  color: #9ca3af;
  flex: 1;
}
</style>
