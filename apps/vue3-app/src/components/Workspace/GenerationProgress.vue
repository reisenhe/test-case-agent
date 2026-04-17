<template>
  <div class="generation-progress-container">
    <div class="progress-header">
      <h2 class="progress-title">⚡ 正在生成测试用例</h2>
      <div class="progress-status" :class="statusClass">
        {{ statusText }}
      </div>
    </div>

    <div class="progress-main">
      <div class="progress-visual">
        <div class="progress-circle">
          <svg class="progress-ring" :width="200" :height="200">
            <circle
              class="progress-ring-bg"
              cx="100"
              cy="100"
              r="80"
              fill="none"
              stroke="#e2e8f0"
              stroke-width="12"
            />
            <circle
              class="progress-ring-fill"
              cx="100"
              cy="100"
              r="80"
              fill="none"
              stroke="url(#gradient)"
              stroke-width="12"
              stroke-linecap="round"
              :stroke-dasharray="circumference"
              :stroke-dashoffset="dashOffset"
              :style="{ transform: 'rotate(-90deg)' }"
            />
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style="stop-color:#667eea" />
                <stop offset="100%" style="stop-color:#764ba2" />
              </linearGradient>
            </defs>
          </svg>
          <div class="progress-percentage">
            <span class="percentage-value">{{ progress }}%</span>
            <span class="percentage-label">完成度</span>
          </div>
        </div>
      </div>

      <div class="progress-details">
        <div class="detail-item">
          <span class="detail-label">当前任务</span>
          <span class="detail-value">{{ currentTask || '准备中...' }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">进度</span>
          <span class="detail-value">{{ completed }} / {{ total }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">预计剩余</span>
          <span class="detail-value">{{ estimatedTime }}</span>
        </div>
      </div>
    </div>

    <div class="progress-bar-linear">
      <div class="progress-bar-fill" :style="{ width: progress + '%' }"></div>
    </div>

    <div class="progress-log">
      <div class="log-header">
        <span class="log-title">📋 生成日志</span>
        <span class="log-count">{{ logs.length }} 条记录</span>
      </div>
      <div class="log-list" ref="logContainer">
        <div
          v-for="(log, index) in logs"
          :key="index"
          class="log-item"
          :class="log.type"
        >
          <span class="log-time">{{ formatTime(log.time) }}</span>
          <span class="log-icon">{{ log.icon }}</span>
          <span class="log-message">{{ log.message }}</span>
        </div>
        <div v-if="logs.length === 0" class="log-empty">
          <span class="empty-icon">⏳</span>
          <span>等待开始...</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps({
  progress: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    default: 0
  },
  currentTask: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    default: 'processing'
  },
  logs: {
    type: Array,
    default: () => []
  }
})

const logContainer = ref(null)

const circumference = 2 * Math.PI * 80

const dashOffset = computed(() => {
  return circumference - (props.progress / 100) * circumference
})

const completed = computed(() => {
  return Math.round((props.progress / 100) * props.total)
})

const statusClass = computed(() => {
  return `status-${props.status}`
})

const statusText = computed(() => {
  const statusMap = {
    processing: '处理中',
    completed: '已完成',
    failed: '失败'
  }
  return statusMap[props.status] || '处理中'
})

const estimatedTime = computed(() => {
  if (props.progress >= 100) return '0秒'
  if (props.progress === 0) return '计算中...'
  
  const remaining = 100 - props.progress
  const seconds = Math.ceil(remaining / (props.progress / 10))
  
  if (seconds < 60) return `${seconds}秒`
  const minutes = Math.ceil(seconds / 60)
  return `${minutes}分钟`
})

const formatTime = (time) => {
  if (!time) return ''
  const date = new Date(time)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

watch(() => props.logs.length, () => {
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight
    }
  })
})
</script>

<style scoped>
.generation-progress-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.progress-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.progress-status {
  padding: 6px 16px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
}

.status-processing {
  animation: pulse 2s infinite;
}

.status-completed {
  background: rgba(16, 185, 129, 0.3);
}

.status-failed {
  background: rgba(239, 68, 68, 0.3);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.progress-main {
  display: flex;
  padding: 32px 24px;
  gap: 40px;
}

.progress-visual {
  flex-shrink: 0;
}

.progress-circle {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.progress-ring {
  transform: rotate(-90deg);
}

.progress-ring-fill {
  transition: stroke-dashoffset 0.3s ease;
}

.progress-percentage {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.percentage-value {
  font-size: 32px;
  font-weight: 700;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.percentage-label {
  font-size: 12px;
  color: #64748b;
}

.progress-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 20px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-label {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-value {
  font-size: 16px;
  color: #1e293b;
  font-weight: 600;
}

.progress-bar-linear {
  height: 8px;
  background: #e2e8f0;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  transition: width 0.3s ease;
}

.progress-log {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-top: 1px solid #e2e8f0;
  min-height: 0;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.log-title {
  font-size: 14px;
  font-weight: 600;
  color: #475569;
}

.log-count {
  padding: 2px 8px;
  background: #e2e8f0;
  border-radius: 10px;
  font-size: 11px;
  color: #64748b;
}

.log-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 24px;
  max-height: 300px;
}

.log-item {
  display: flex;
  gap: 12px;
  padding: 8px 0;
  font-size: 13px;
  border-bottom: 1px solid #f1f5f9;
}

.log-item:last-child {
  border-bottom: none;
}

.log-time {
  min-width: 70px;
  color: #94a3b8;
  font-family: 'Consolas', 'Monaco', monospace;
}

.log-icon {
  min-width: 20px;
  font-size: 14px;
}

.log-item.info .log-icon {
  color: #3b82f6;
}

.log-item.success .log-icon {
  color: #10b981;
}

.log-item.warning .log-icon {
  color: #f59e0b;
}

.log-item.error .log-icon {
  color: #ef4444;
}

.log-message {
  flex: 1;
  color: #475569;
  line-height: 1.5;
}

.log-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  color: #94a3b8;
  gap: 8px;
}

.empty-icon {
  font-size: 32px;
  opacity: 0.5;
}
</style>
