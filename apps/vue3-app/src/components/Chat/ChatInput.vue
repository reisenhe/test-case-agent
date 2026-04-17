<template>
  <div class="chat-input-container">
    <div class="input-wrapper">
      <textarea
        ref="inputRef"
        v-model="inputMessage"
        :placeholder="placeholder"
        @keyup.enter.exact="handleSend"
        @keyup.shift.enter="handleNewLine"
        :disabled="loading"
        rows="1"
      ></textarea>
      <button
        @click="handleSend"
        :disabled="!inputMessage.trim() || loading"
        class="send-button"
      >
        <span v-if="loading" class="loading-spinner"></span>
        <span v-else>发送</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

interface Props {
  loading?: boolean;
  placeholder?: string;
}

interface Emits {
  (e: 'send', message: string): void;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  placeholder: '输入你的问题...',
});

const emit = defineEmits<Emits>();

const inputMessage = ref('');
const inputRef = ref<HTMLTextAreaElement | null>(null);

function handleSend() {
  const message = inputMessage.value.trim();
  if (!message || props.loading) return;

  emit('send', message);
  inputMessage.value = '';

  // Auto resize back to 1 row
  if (inputRef.value) {
    inputRef.value.style.height = 'auto';
  }
}

function handleNewLine() {
  // Shift+Enter just adds newline, no need to do anything special
  // Auto resize textarea
  if (inputRef.value) {
    inputRef.value.style.height = 'auto';
    inputRef.value.style.height = inputRef.value.scrollHeight + 'px';
  }
}
</script>

<style scoped>
.chat-input-container {
  padding: 16px 20px;
  background: #fff;
  border-top: 1px solid #e2e8f0;
}

.input-wrapper {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

textarea {
  flex: 1;
  padding: 12px 16px;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  resize: none;
  min-height: 44px;
  max-height: 150px;
  font-size: 14px;
  font-family: inherit;
  background: #f8fafc;
  color: #1e293b;
  transition: all 0.2s;
  line-height: 1.5;
}

textarea:focus {
  outline: none;
  border-color: #667eea;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

textarea:disabled {
  background: #f1f5f9;
  cursor: not-allowed;
  opacity: 0.7;
}

textarea::placeholder {
  color: #94a3b8;
}

.send-button {
  padding: 12px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  min-width: 80px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.send-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
}

.send-button:active:not(:disabled) {
  transform: translateY(0);
}

.send-button:disabled {
  background: linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%);
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
