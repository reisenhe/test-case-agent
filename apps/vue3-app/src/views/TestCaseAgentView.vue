<template>
  <div class="agent-layout">
    <div class="layout-header">
      <div class="header-left">
        <h1 class="app-title">🤖 测试用例智能生成器</h1>
        <p class="app-subtitle">AI 驱动的测试用例生成指挥舱</p>
      </div>
      <div class="header-right">
        <div v-if="sessionId" class="session-info">
          <span class="info-label">会话 ID:</span>
          <span class="info-value">{{ sessionId.substring(0, 8) }}...</span>
        </div>
        <button
          @click="showSessionHistory = true"
          class="header-btn"
          title="会话历史"
        >
          📋
        </button>
      </div>
    </div>

    <div class="layout-body">
      <div class="chat-panel">
        <div class="panel-header">
          <h2 class="panel-title">💬 AI 交互舱</h2>
          <div class="panel-status" :class="phaseClass">
            {{ phaseText }}
          </div>
        </div>

        <div v-if="!sessionId" class="welcome-section">
          <div class="welcome-content">
            <div class="welcome-icon">🚀</div>
            <h3 class="welcome-title">欢迎使用 AI 测试用例生成器</h3>
            <p class="welcome-desc">粘贴您的需求文档，我将自动提取功能点并生成测试用例</p>
            <textarea
              v-model="requirementContent"
              placeholder="# 用户登录模块

## 功能需求
1. 用户可以使用用户名和密码登录系统
2. 支持记住密码功能
3. 登录失败时显示错误提示

## 非功能需求
- 登录响应时间 < 2秒
- 密码必须加密存储"
              class="requirement-input"
              rows="10"
            ></textarea>
            <button
              @click="startSession"
              :disabled="!requirementContent.trim() || isProcessing"
              class="start-button"
            >
              <span class="btn-icon">⚡</span>
              <span>开始分析</span>
            </button>
          </div>
        </div>

        <template v-else>
          <ChatMessageList
            :messages="messages"
            :currentToken="currentToken"
          />

          <ChatInput
            @send="handleSendMessage"
            :loading="isChatting"
          />
        </template>
      </div>

      <div class="workspace-panel">
        <FeatureTable
          v-if="currentPhase === 'extracting'"
          :data="featurePoints"
          @generate="startGeneration"
          @update="handleFeatureUpdate"
        />

        <GenerationProgress
          v-else-if="currentPhase === 'generating'"
          :progress="generationProgress"
          :total="generationTotal"
          :currentTask="currentTaskName"
          :status="generationStatus"
          :logs="generationLogs"
        />

        <ResultActions
          v-else-if="currentPhase === 'completed'"
          :stats="resultStats"
          :distribution="resultDistribution"
          :testCases="testCases"
          @download="handleDownload"
          @save="handleSave"
          @new="handleNewTask"
        />

        <div v-else class="workspace-placeholder">
          <div class="placeholder-content">
            <div class="placeholder-icon">⏳</div>
            <h3 class="placeholder-title">等待开始</h3>
            <p class="placeholder-desc">在左侧输入需求文档开始生成测试用例</p>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showSessionHistory" class="dialog-overlay" @click.self="showSessionHistory = false">
      <div class="session-history-dialog">
        <div class="dialog-header">
          <h2>会话历史</h2>
          <button @click="showSessionHistory = false" class="btn-close">✕</button>
        </div>
        <div class="dialog-body">
          <div v-if="sessionHistory.length === 0" class="empty-state">
            <p>暂无会话历史</p>
          </div>
          <div v-else class="session-list">
            <div
              v-for="session in sessionHistory"
              :key="session.session_id"
              class="session-item"
              :class="{ 'active': session.session_id === sessionId }"
              @click="switchSession(session)"
            >
              <div class="session-item-header">
                <span class="session-id">{{ session.session_id.substring(0, 8) }}...</span>
                <span class="session-status" :class="'status-' + session.status">{{ getStatusText(session.status) }}</span>
                <button
                  @click.stop="deleteSession(session.session_id)"
                  class="btn-delete-session"
                  title="删除会话"
                >
                  🗑️
                </button>
              </div>
              <div class="session-item-details">
                <p><strong>创建时间:</strong> {{ new Date(session.created_at).toLocaleString('zh-CN') }}</p>
                <p v-if="session.last_active"><strong>最后活跃:</strong> {{ new Date(session.last_active).toLocaleString('zh-CN') }}</p>
                <p v-if="session.project_id"><strong>项目 ID:</strong> {{ session.project_id }}</p>
              </div>
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button @click="loadSessionHistory" class="btn-refresh" :disabled="isLoadingSessions">
            🔄 刷新
          </button>
          <button @click="showSessionHistory = false" class="btn-close-modal">
            关闭
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue';
import testCaseAgentSDK, { type FeaturePoint, type ChatEventData, type TaskStatus, type TestCase } from '../api/testCaseAgentSDK';
import ChatMessageList from '../components/Chat/ChatMessageList.vue';
import ChatInput from '../components/Chat/ChatInput.vue';
import FeatureTable from '../components/Workspace/FeatureTable.vue';
import GenerationProgress from '../components/Workspace/GenerationProgress.vue';
import ResultActions from '../components/Workspace/ResultActions.vue';

// ==================== Types ====================

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  time: string;
}

interface LogEntry {
  time: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
  icon: string;
}

interface ResultStats {
  totalTestCases: number;
  duration: string;
  successRate: number;
  features: number;
}

interface DistributionItem {
  label: string;
  count: number;
  color: string;
}

interface SessionHistory {
  session_id: string;
  project_id?: string;
  created_at: string;
  last_active?: string;
  status: string;
}

// ==================== State ====================

const sessionId = ref<string>('');
const currentPhase = ref<'initial' | 'extracting' | 'generating' | 'completed'>('initial');
const isProcessing = ref<boolean>(false);
const isChatting = ref<boolean>(false);

const requirementContent = ref<string>('');
const messages = ref<ChatMessage[]>([]);
const currentToken = ref<string>('');
const featurePoints = ref<FeaturePoint[]>([]);

const generationProgress = ref<number>(0);
const generationTotal = ref<number>(0);
const currentTaskName = ref<string>('');
const generationStatus = ref<'processing' | 'completed' | 'failed'>('processing');
const generationLogs = ref<LogEntry[]>([]);

const taskId = ref<string>('');
const testCases = ref<TestCase[]>([]);

const resultStats = ref<ResultStats>({
  totalTestCases: 0,
  duration: '0s',
  successRate: 100,
  features: 0,
});

const resultDistribution = ref<DistributionItem[]>([]);

const chatAbortController = ref<AbortController | null>(null);
const startTime = ref<number>(0);

const sessionHistory = ref<SessionHistory[]>([]);
const showSessionHistory = ref<boolean>(false);
const isLoadingSessions = ref<boolean>(false);

// ==================== Computed ====================

const phaseText = computed<string>(() => {
  const phaseMap: Record<string, string> = {
    initial: '初始',
    extracting: '功能点提取',
    generating: '生成中',
    completed: '完成',
  };
  return phaseMap[currentPhase.value] || '初始';
});

const phaseClass = computed<string>(() => {
  return `phase-${currentPhase.value}`;
});

// ==================== Helper Functions ====================

const addLog = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info', icon: string = 'ℹ️'): void => {
  const log: LogEntry = {
    time: new Date().toISOString(),
    message,
    type,
    icon,
  };
  generationLogs.value.push(log);
};

// ==================== Session Functions ====================

const startSession = async (): Promise<void> => {
  isProcessing.value = true;
  addLog('开始创建会话...', 'info', '🔧');

  try {
    const response = await testCaseAgentSDK.startSession(null, requirementContent.value);
    sessionId.value = response.session_id;
    currentPhase.value = 'extracting';
    addLog('会话创建成功', 'success', '✅');

    await loadSessionHistory();

    const message = `请分析以下需求文档并提取功能点：\n\n${requirementContent.value}`;
    messages.value.push({ role: 'user', content: message, time: new Date().toISOString() });

    await streamChat(message);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    addLog(`创建会话失败: ${errMsg}`, 'error', '❌');
  } finally {
    isProcessing.value = false;
  }
};

const streamChat = async (message: string): Promise<void> => {
  isChatting.value = true;
  currentToken.value = '';

  addLog('开始分析需求文档...', 'info', '🔍');

  try {
    chatAbortController.value = testCaseAgentSDK.chat(
      sessionId.value,
      message,
      null,
      (event: ChatEventData) => {
        if (event.type === 'token' && event.content) {
          currentToken.value += event.content;
        } else if (event.type === 'tool_start') {
          addLog(`工具调用: ${event.tool}`, 'info', '🔧');
        } else if (event.type === 'hitl_interrupt') {
          handleHitlInterrupt(event);
        }
      },
      (error: Error) => {
        addLog(`连接错误: ${error.message}`, 'error', '❌');
      },
      () => {
        if (currentToken.value) {
          messages.value.push({
            role: 'assistant',
            content: currentToken.value,
            time: new Date().toISOString(),
          });
          currentToken.value = '';
        }
        isChatting.value = false;
        chatAbortController.value = null;
      }
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    addLog(`发送消息失败: ${errMsg}`, 'error', '❌');
    isChatting.value = false;
  }
};

const handleHitlInterrupt = (event: ChatEventData): void => {
  addLog('收到功能点数据', 'success', '📋');
  console.log('Received feature points from HITL:', event.feature_points);

  if (event.feature_points && event.feature_points.length > 0) {
    const newFeaturePoints = event.feature_points.map((newFp: FeaturePoint) => {
      const existingFp = featurePoints.value.find((fp) => fp.id === newFp.id);
      return {
        ...newFp,
        selected: existingFp ? existingFp.selected : true,
        name: newFp.name || existingFp?.name || '',
        category: newFp.category || existingFp?.category || '',
        priority: newFp.priority || existingFp?.priority || 'P1',
        description: newFp.description || existingFp?.description || '',
      };
    });

    featurePoints.value = newFeaturePoints;
    currentPhase.value = 'extracting';
    addLog(`提取了 ${featurePoints.value.length} 个功能点`, 'success', '✨');
    console.log('Updated feature points:', featurePoints.value);
  }
};

const handleSendMessage = async (message: string): Promise<void> => {
  messages.value.push({ role: 'user', content: message, time: new Date().toISOString() });
  await streamChat(message);
};

// ==================== Generation Functions ====================

const startGeneration = async (confirmedFeatures: FeaturePoint[]): Promise<void> => {
  currentPhase.value = 'generating';
  startTime.value = Date.now();
  generationLogs.value = [];
  addLog('开始生成测试用例...', 'info', '🚀');

  try {
    await testCaseAgentSDK.resumeHitl(sessionId.value, 'approve');
    addLog('功能点确认成功', 'success', '✅');

    const response = await testCaseAgentSDK.startGeneration(
      sessionId.value,
      confirmedFeatures,
      requirementContent.value,
      10
    );

    taskId.value = response.task_id;
    generationTotal.value = response.total_features || confirmedFeatures.length;
    addLog(`任务已启动: ${response.task_id.substring(0, 8)}...`, 'success', '🎯');

    await pollGenerationProgress();
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    addLog(`生成失败: ${errMsg}`, 'error', '❌');
    generationStatus.value = 'failed';
  }
};

const pollGenerationProgress = async (): Promise<void> => {
  try {
    await testCaseAgentSDK.pollUntilComplete(
      taskId.value,
      (status: TaskStatus) => {
        console.log('Task status update:', status);

        if (status.progress !== undefined && status.total) {
          generationProgress.value = Math.round((status.progress / status.total) * 100);
          currentTaskName.value = status.current_feature || `功能点 ${status.progress}`;
        }

        if (status.status === 'completed') {
          console.log('Task completed, result:', status.result);
          if (status.result) {
            handleGenerationComplete(status.result);
          } else {
            console.warn('Task completed but no result found');
            generationStatus.value = 'completed';
            currentPhase.value = 'completed';
          }
        }
      }
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    addLog(`任务失败: ${errMsg}`, 'error', '❌');
    generationStatus.value = 'failed';
  }
};

const handleGenerationComplete = (result: { test_cases: TestCase[] }): void => {
  console.log('handleGenerationComplete called with:', result);

  generationStatus.value = 'completed';

  const duration = Math.round((Date.now() - startTime.value) / 1000);

  if (result.test_cases && result.test_cases.length > 0) {
    console.log('Setting testCases:', result.test_cases);
    testCases.value = result.test_cases;
    resultStats.value.totalTestCases = testCases.value.length;
    resultStats.value.duration = duration + 's';
    resultStats.value.features = generationTotal.value;
    resultStats.value.successRate = 100;

    resultDistribution.value = calculateDistribution(testCases.value);
    console.log('Result distribution:', resultDistribution.value);
  } else {
    console.warn('No test_cases found in result');
    resultStats.value.totalTestCases = 0;
    resultStats.value.duration = duration + 's';
    resultStats.value.features = generationTotal.value;
    resultStats.value.successRate = 0;
  }

  addLog('测试用例生成完成', 'success', '🎉');
  currentPhase.value = 'completed';
};

const calculateDistribution = (testCaseList: TestCase[]): DistributionItem[] => {
  const distribution: Record<string, number> = {};
  const typeMap: Record<string, string> = {
    '正向': '正向',
    '异常': '逆向',
    '逆向': '逆向',
    '边界': '边界',
    '性能': '性能',
    '安全': '安全',
    'normal': '正向',
    'abnormal': '逆向',
    'edge': '边界',
    'performance': '性能',
    'security': '安全',
  };

  testCaseList.forEach((tc) => {
    const originalType = tc.type || '正向';
    const normalizedType = typeMap[originalType] || '正向';
    distribution[normalizedType] = (distribution[normalizedType] || 0) + 1;
  });

  const colors: Record<string, string> = {
    '正向': '#10b981',
    '逆向': '#ef4444',
    '边界': '#f59e0b',
    '性能': '#3b82f6',
    '安全': '#8b5cf6',
  };

  return Object.entries(distribution).map(([label, count]) => ({
    label,
    count,
    color: colors[label] || '#6b7280',
  }));
};

const handleFeatureUpdate = (updatedFeatures: FeaturePoint[]): void => {
  console.log('Feature update received:', updatedFeatures);
  featurePoints.value = updatedFeatures;
};

// ==================== Result Actions ====================

const handleDownload = async (format: string): Promise<void> => {
  addLog(`正在导出 ${format} 格式...`, 'info', '📥');

  try {
    await testCaseAgentSDK.downloadResult(taskId.value, format);
    addLog(`导出成功: ${format}`, 'success', '✅');
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    addLog(`导出失败: ${errMsg}`, 'error', '❌');
  }
};

const handleSave = async (): Promise<void> => {
  addLog('正在同步至项目库...', 'info', '☁️');

  try {
    await testCaseAgentSDK.saveToProject(taskId.value, '1');
    addLog('同步成功', 'success', '✅');
    alert('已成功同步到项目库！');
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    addLog(`同步失败: ${errMsg}`, 'error', '❌');
  }
};

const handleNewTask = (): void => {
  reset();
};

// ==================== Session History ====================

const loadSessionHistory = async (): Promise<void> => {
  isLoadingSessions.value = true;
  try {
    const sessions = await testCaseAgentSDK.getSessionHistory();
    sessionHistory.value = sessions.map((s) => ({
      session_id: s.session_id,
      project_id: s.project_id,
      created_at: s.created_at,
      last_active: s.last_active,
      status: s.status || 'active',
    }));
    console.log('Loaded session history:', sessionHistory.value.length, 'sessions');
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('加载会话历史失败:', error);
    addLog(`加载会话历史失败: ${errMsg}`, 'error');
  } finally {
    isLoadingSessions.value = false;
  }
};

const switchSession = async (session: SessionHistory): Promise<void> => {
  if (!confirm(`切换到会话 ${session.session_id.substring(0, 8)}...? 当前进度将丢失。`)) return;

  reset();
  sessionId.value = session.session_id;
  currentPhase.value = 'extracting';
  showSessionHistory.value = false;
  addLog(`切换到会话: ${session.session_id.substring(0, 8)}...`, 'info');

  try {
    const detail = await testCaseAgentSDK.getSessionDetail(sessionId.value);
    if (detail && detail.messages) {
      messages.value = detail.messages.map((m) => ({
        role: m.role === 'ai' ? 'assistant' : (m.role as 'user' | 'assistant'),
        content: m.content,
        time: new Date().toISOString(),
      }));
      addLog(`已加载 ${messages.value.length} 条历史消息`, 'info');
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('加载会话详情失败:', error);
    addLog(`加载会话详情失败: ${errMsg}`, 'error');
  }
};

const deleteSession = async (sessionIdToDelete: string): Promise<void> => {
  if (!confirm('确定要删除这个会话吗？删除后将无法恢复。')) return;

  try {
    await testCaseAgentSDK.deleteSession(sessionIdToDelete);
    addLog(`会话 ${sessionIdToDelete.substring(0, 8)}... 已删除`, 'success');

    if (sessionId.value === sessionIdToDelete) {
      reset();
    }

    await loadSessionHistory();
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('删除会话失败:', error);
    addLog(`删除会话失败: ${errMsg}`, 'error');
  }
};

const getStatusText = (status: string): string => {
  const statusMap: Record<string, string> = {
    'active': '活跃',
    'completed': '已完成',
    'failed': '失败',
  };
  return statusMap[status] || status;
};

// ==================== Reset ====================

const reset = (): void => {
  if (chatAbortController.value) {
    chatAbortController.value.abort();
    chatAbortController.value = null;
  }

  sessionId.value = '';
  currentPhase.value = 'initial';
  requirementContent.value = '';
  messages.value = [];
  currentToken.value = '';
  featurePoints.value = [];

  generationProgress.value = 0;
  generationTotal.value = 0;
  currentTaskName.value = '';
  generationStatus.value = 'processing';
  generationLogs.value = [];

  taskId.value = '';
  testCases.value = [];

  resultStats.value = {
    totalTestCases: 0,
    duration: '0s',
    successRate: 100,
    features: 0,
  };
  resultDistribution.value = [];

  isProcessing.value = false;
  isChatting.value = false;
};

// ==================== Lifecycle ====================

onBeforeUnmount(() => {
  if (chatAbortController.value) {
    chatAbortController.value.abort();
  }
});
</script>

<style scoped>
.agent-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: linear-gradient(135deg, #667eea11 0%, #764ba211 100%);
}

.layout-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.app-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.app-subtitle {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.session-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: #f8fafc;
  border-radius: 8px;
  font-size: 13px;
}

.info-label {
  color: #64748b;
}

.info-value {
  color: #1e293b;
  font-weight: 600;
  font-family: 'Consolas', 'Monaco', monospace;
}

.header-btn {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: #f8fafc;
  cursor: pointer;
  font-size: 18px;
  transition: all 0.2s;
}

.header-btn:hover {
  background: #e2e8f0;
  transform: scale(1.1);
}

.layout-body {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 16px;
  padding: 16px;
  overflow: hidden;
}

.chat-panel,
.workspace-panel {
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.chat-panel {
  height: 100%;
}

.chat-panel .chat-message-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.chat-panel .chat-input-container {
  flex-shrink: 0;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.panel-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.panel-status {
  padding: 4px 12px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.phase-extracting {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.welcome-section {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
}

.welcome-content {
  max-width: 600px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.welcome-icon {
  font-size: 48px;
  text-align: center;
}

.welcome-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: #1e293b;
  text-align: center;
}

.welcome-desc {
  margin: 0;
  font-size: 14px;
  color: #64748b;
  text-align: center;
}

.requirement-input {
  width: 100%;
  padding: 16px;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  resize: none;
  transition: all 0.2s;
}

.requirement-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.start-button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.start-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
}

.start-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.workspace-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
}

.placeholder-content {
  text-align: center;
}

.placeholder-icon {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.placeholder-title {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 600;
  color: #1e293b;
}

.placeholder-desc {
  margin: 0;
  font-size: 14px;
  color: #64748b;
}

.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.session-history-dialog {
  background: white;
  border-radius: 16px;
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e2e8f0;
}

.dialog-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
}

.btn-close {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: #f1f5f9;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.2s;
}

.btn-close:hover {
  background: #e2e8f0;
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.empty-state {
  text-align: center;
  padding: 40px 0;
  color: #94a3b8;
}

.session-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.session-item {
  padding: 16px;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.session-item:hover {
  border-color: #667eea;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.1);
}

.session-item.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #f0f4ff 0%, #f5f3ff 100%);
}

.session-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  gap: 8px;
}

.session-id {
  font-family: 'Consolas', 'Monaco', monospace;
  font-weight: 600;
  color: #1e293b;
  flex: 1;
}

.session-status {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  white-space: nowrap;
}

.session-status.status-active {
  background: #dcfce7;
  color: #16a34a;
}

.session-status.status-completed {
  background: #dbeafe;
  color: #2563eb;
}

.session-status.status-failed {
  background: #fee2e2;
  color: #dc2626;
}

.btn-delete-session {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: #f1f5f9;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
}

.btn-delete-session:hover {
  background: #fee2e2;
  opacity: 1;
  transform: scale(1.1);
}

.session-item-details {
  font-size: 13px;
  color: #64748b;
}

.session-item-details p {
  margin: 4px 0;
  display: flex;
  gap: 8px;
}

.session-item-details strong {
  min-width: 70px;
  color: #475569;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid #e2e8f0;
}

.btn-refresh {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: #f8fafc;
  color: #64748b;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-refresh:hover:not(:disabled) {
  background: #e2e8f0;
  color: #334155;
}

.btn-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-close-modal {
  padding: 8px 20px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-close-modal:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(102, 126, 234, 0.3);
}
</style>
