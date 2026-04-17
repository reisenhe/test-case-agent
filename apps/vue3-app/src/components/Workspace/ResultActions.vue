<template>
  <div class="result-actions-container">
    <div class="result-header">
      <h2 class="result-title">✨ 生成完成</h2>
      <div class="result-badge">
        <span class="badge-icon">🎉</span>
        <span>成功</span>
      </div>
    </div>

    <div class="result-stats">
      <div class="stat-card">
        <div class="stat-icon">📊</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.totalTestCases }}</div>
          <div class="stat-label">测试用例</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⏱️</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.duration }}</div>
          <div class="stat-label">耗时</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">✅</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.successRate }}%</div>
          <div class="stat-label">成功率</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🎯</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.features }}</div>
          <div class="stat-label">功能点</div>
        </div>
      </div>
    </div>

    <div v-if="testCases && testCases.length > 0" class="test-cases-section">
      <div class="section-header">
        <h3 class="section-title">📝 生成的测试用例</h3>
        <div class="section-actions">
          <input
            v-model="searchKeyword"
            type="text"
            placeholder="搜索用例..."
            class="search-input"
          />
          <select v-model="filterType" class="filter-select">
            <option value="">全部类型</option>
            <option v-for="type in availableTypes" :key="type" :value="type">{{ type }}</option>
          </select>
        </div>
      </div>

      <div class="test-cases-list">
        <div
          v-for="(testCase, index) in filteredTestCases"
          :key="index"
          class="test-case-item"
        >
          <div class="test-case-info">
            <span class="test-case-id">{{ testCase.id }}</span>
            <span class="test-case-title">{{ testCase.title }}</span>
          </div>
          <button @click="openDetail(testCase)" class="detail-btn">
            详情
          </button>
        </div>

        <div v-if="filteredTestCases.length === 0" class="empty-cases">
          <div class="empty-icon">🔍</div>
          <p>没有找到匹配的测试用例</p>
        </div>
      </div>
    </div>

    <div class="result-actions">
      <button
        @click="handleDownload('excel')"
        class="action-btn btn-excel"
      >
        <span class="btn-icon">📥</span>
        <span>下载 Excel</span>
      </button>
      <button
        @click="handleDownload('markdown')"
        class="action-btn btn-markdown"
      >
        <span class="btn-icon">📝</span>
        <span>下载 Markdown</span>
      </button>
      <button
        @click="handleDownload('xmind')"
        class="action-btn btn-xmind"
      >
        <span class="btn-icon">🧠</span>
        <span>下载 XMind</span>
      </button>
      <button
        @click="handleSave"
        class="action-btn btn-save"
      >
        <span class="btn-icon">☁️</span>
        <span>同步至项目库</span>
      </button>
    </div>

    <div class="result-footer">
      <button
        @click="handleNew"
        class="new-task-btn"
      >
        <span class="btn-icon">🚀</span>
        <span>开始新任务</span>
      </button>
    </div>

    <div v-if="showDetailModal" class="modal-overlay" @click="closeDetail">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3 class="modal-title">测试用例详情</h3>
          <button @click="closeDetail" class="close-btn">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>ID</label>
            <input v-model="editingTestCase.id" type="text" class="form-input" />
          </div>
          <div class="form-group">
            <label>用例名称</label>
            <input v-model="editingTestCase.title" type="text" class="form-input" />
          </div>
          <div class="form-group">
            <label>类型</label>
            <select v-model="editingTestCase.type" class="form-input">
              <option value="正向">正向</option>
              <option value="逆向">逆向</option>
              <option value="边界">边界</option>
              <option value="性能">性能</option>
              <option value="安全">安全</option>
            </select>
          </div>
          <div class="form-group">
            <label>优先级</label>
            <select v-model="editingTestCase.priority" class="form-input">
              <option value="P0">P0</option>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
              <option value="P3">P3</option>
            </select>
          </div>
          <div class="form-group">
            <label>测试目的</label>
            <textarea v-model="editingTestCase.purpose" class="form-textarea" rows="3"></textarea>
          </div>
          <div class="form-group">
            <label>功能点ID</label>
            <input v-model="editingTestCase.feature_point_id" type="text" class="form-input" />
          </div>
          <div class="form-group">
            <label>前置条件</label>
            <textarea v-model="preconditionsText" class="form-textarea" rows="3" placeholder="每行一个条件"></textarea>
          </div>
          <div class="form-group">
            <label>测试步骤</label>
            <div class="steps-editor">
              <div v-for="(step, index) in editingTestCase.steps" :key="index" class="step-editor-item">
                <div class="step-number">步骤 {{ step.step_no }}</div>
                <input v-model="step.action" type="text" class="form-input" placeholder="操作描述" />
                <input v-model="step.test_data" type="text" class="form-input" placeholder="测试数据" />
                <input v-model="step.expected_result" type="text" class="form-input" placeholder="预期结果" />
              </div>
            </div>
          </div>
          <div class="form-group">
            <label>后置条件</label>
            <textarea v-model="postconditionsText" class="form-textarea" rows="3" placeholder="每行一个条件"></textarea>
          </div>
          <div class="form-group">
            <label>标签</label>
            <input v-model="tagsText" type="text" class="form-input" placeholder="用逗号分隔多个标签" />
          </div>
        </div>
        <div class="modal-footer">
          <button @click="closeDetail" class="modal-btn btn-cancel">取消</button>
          <button @click="saveDetail" class="modal-btn btn-save">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  stats: {
    type: Object,
    default: () => ({
      totalTestCases: 0,
      duration: '0s',
      successRate: 100,
      features: 0
    })
  },
  testCases: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['download', 'save', 'new', 'update:testCase'])

console.log('ResultActions component created, testCases:', props.testCases)

const searchKeyword = ref('')
const filterType = ref('')
const showDetailModal = ref(false)
const editingTestCase = ref({})
const editingIndex = ref(-1)
const preconditionsText = ref('')
const postconditionsText = ref('')
const tagsText = ref('')

const availableTypes = computed(() => {
  const types = new Set()
  props.testCases.forEach(tc => {
    if (tc.type) types.add(normalizeType(tc.type))
  })
  return Array.from(types)
})

const normalizeType = (type) => {
  const typeMap = {
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
    'security': '安全'
  }
  return typeMap[type] || '正向'
}


const filteredTestCases = computed(() => {
  let result = [...props.testCases]

  if (filterType.value) {
    result = result.filter(tc => normalizeType(tc.type) === filterType.value)
  }

  if (searchKeyword.value.trim()) {
    const keyword = searchKeyword.value.toLowerCase()
    result = result.filter(tc => {
      const searchableFields = [
        tc.id,
        tc.title,
        tc.purpose,
        tc.feature_point_id,
        tc.preconditions?.join(' '),
        tc.steps?.map(s => `${s.action} ${s.test_data} ${s.expected_result}`).join(' '),
        tc.postconditions?.join(' '),
        tc.tags?.join(' ')
      ].join(' ').toLowerCase()
      return searchableFields.includes(keyword)
    })
  }

  return result
})

const handleDownload = (format) => {
  emit('download', format)
}

const handleSave = () => {
  emit('save')
}

const handleNew = () => {
  emit('new')
}

const openDetail = (testCase) => {
  editingTestCase.value = JSON.parse(JSON.stringify(testCase))
  editingIndex.value = props.testCases.findIndex(tc => tc.id === testCase.id)
  preconditionsText.value = testCase.preconditions ? testCase.preconditions.join('\n') : ''
  postconditionsText.value = testCase.postconditions ? testCase.postconditions.join('\n') : ''
  tagsText.value = testCase.tags ? testCase.tags.join(', ') : ''
  showDetailModal.value = true
}

const closeDetail = () => {
  showDetailModal.value = false
  editingTestCase.value = {}
  editingIndex.value = -1
  preconditionsText.value = ''
  postconditionsText.value = ''
  tagsText.value = ''
}

const saveDetail = () => {
  if (editingIndex.value >= 0) {
    const updatedTestCase = {
      ...editingTestCase.value,
      preconditions: preconditionsText.value.split('\n').filter(line => line.trim()),
      postconditions: postconditionsText.value.split('\n').filter(line => line.trim()),
      tags: tagsText.value.split(',').map(tag => tag.trim()).filter(tag => tag)
    }
    emit('update:testCase', { index: editingIndex.value, testCase: updatedTestCase })
  }
  closeDetail()
}
</script>

<style scoped>
.result-actions-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
}

.result-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.result-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
}

.badge-icon {
  font-size: 16px;
}

.result-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  padding: 24px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  transition: all 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.stat-icon {
  font-size: 24px;
}

.stat-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.stat-label {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
}

.result-actions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 20px 24px;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 20px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.action-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.action-btn:active {
  transform: translateY(0);
}

.btn-excel {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
}

.btn-markdown {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
}

.btn-xmind {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
}

.btn-save {
  background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
  color: white;
}

.btn-icon {
  font-size: 18px;
}

.result-footer {
  padding: 20px 24px;
  background: white;
  border-top: 1px solid #e2e8f0;
}

.new-task-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.new-task-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
}

.new-task-btn:active {
  transform: translateY(0);
}

.test-cases-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding: 24px;
  background: #f8fafc;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.section-actions {
  display: flex;
  gap: 12px;
}

.search-input {
  padding: 8px 12px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 13px;
  transition: all 0.2s;
  width: 200px;
}

.search-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.filter-select {
  padding: 8px 12px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 13px;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.test-cases-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 8px;
}

.test-case-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: white;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  transition: all 0.2s;
}

.test-case-item:hover {
  border-color: #667eea;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.1);
}

.test-case-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.test-case-id {
  font-size: 13px;
  font-weight: 600;
  color: #667eea;
  font-family: 'Consolas', 'Monaco', monospace;
  white-space: nowrap;
}

.test-case-title {
  font-size: 14px;
  color: #334155;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-btn {
  padding: 6px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.detail-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(102, 126, 234, 0.3);
}

.empty-cases {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #94a3b8;
}

.empty-cases .empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-cases p {
  margin: 0;
  font-size: 14px;
}

.modal-overlay {
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
  padding: 20px;
}

.modal-content {
  background: white;
  border-radius: 16px;
  max-width: 800px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e2e8f0;
}

.modal-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: #f1f5f9;
  border-radius: 8px;
  font-size: 20px;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: #e2e8f0;
  color: #334155;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}

.form-input {
  padding: 10px 12px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  transition: all 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-textarea {
  padding: 10px 12px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  transition: all 0.2s;
}

.form-textarea:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.steps-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.step-editor-item {
  padding: 16px;
  background: #f8fafc;
  border-radius: 8px;
  border-left: 3px solid #667eea;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.step-editor-item .step-number {
  font-size: 13px;
  font-weight: 600;
  color: #667eea;
}

.step-editor-item .form-input {
  font-size: 13px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid #e2e8f0;
}

.modal-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.modal-btn.btn-cancel {
  background: #f1f5f9;
  color: #64748b;
}

.modal-btn.btn-cancel:hover {
  background: #e2e8f0;
  color: #334155;
}

.modal-btn.btn-save {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.modal-btn.btn-save:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}
</style>
