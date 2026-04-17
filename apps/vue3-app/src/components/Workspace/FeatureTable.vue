<template>
  <div class="feature-table-container">
    <div class="table-header">
      <h2 class="table-title">📋 功能点确认</h2>
      <div class="table-stats">
        <span class="stat-item">总计: {{ data.length }}</span>
        <span class="stat-item selected">已选: {{ selectedCount }}</span>
      </div>
    </div>

    <div class="filter-bar">
      <select v-model="filterCategory" class="filter-select">
        <option value="">所有分类</option>
        <option value="正向功能">正向功能</option>
        <option value="边界条件">边界条件</option>
        <option value="异常处理">异常处理</option>
        <option value="性能">性能</option>
        <option value="安全">安全</option>
      </select>
      <select v-model="filterPriority" class="filter-select">
        <option value="">所有优先级</option>
        <option value="P0">P0</option>
        <option value="P1">P1</option>
        <option value="P2">P2</option>
        <option value="P3">P3</option>
      </select>
      <button @click="selectAll(true)" class="btn btn-sm">全选</button>
      <button @click="selectAll(false)" class="btn btn-sm">取消全选</button>
    </div>

    <div class="feature-list">
      <div
        v-for="(fp, index) in filteredFeatures"
        :key="fp.id || index"
        class="feature-item"
        :class="{ 
          'selected': fp.selected,
          'editing': editingIndex === index 
        }"
      >
        <div v-if="editingIndex === index" class="edit-form">
          <div class="edit-row">
            <label>ID:</label>
            <input v-model="editData.id" type="text" class="edit-input" />
          </div>
          <div class="edit-row">
            <label>名称:</label>
            <input v-model="editData.name" type="text" class="edit-input" />
          </div>
          <div class="edit-row">
            <label>描述:</label>
            <textarea v-model="editData.description" class="edit-textarea"></textarea>
          </div>
          <div class="edit-row">
            <label>分类:</label>
            <select v-model="editData.category" class="edit-select">
              <option value="正向功能">正向功能</option>
              <option value="边界条件">边界条件</option>
              <option value="异常处理">异常处理</option>
              <option value="性能">性能</option>
              <option value="安全">安全</option>
            </select>
          </div>
          <div class="edit-row">
            <label>优先级:</label>
            <select v-model="editData.priority" class="edit-select">
              <option value="P0">P0 (核心)</option>
              <option value="P1">P1 (重要)</option>
              <option value="P2">P2 (次要)</option>
              <option value="P3">P3 (可选)</option>
            </select>
          </div>
          <div class="edit-actions">
            <button @click="saveEdit(index)" class="btn btn-success">保存</button>
            <button @click="cancelEdit" class="btn">取消</button>
            <button @click="deleteFeature(index)" class="btn btn-danger">删除</button>
          </div>
        </div>

        <div v-else class="feature-display">
          <div class="feature-checkbox">
            <input
              type="checkbox"
              :id="'fp-' + index"
              :checked="fp.selected"
              @change="toggleSelected(index)"
            >
          </div>
          <div class="feature-info">
            <div class="feature-header">
              <label :for="'fp-' + index" class="feature-label">
                <span class="feature-id">{{ fp.id || 'FP-' + (index + 1) }}</span>
                <span class="feature-name">{{ fp.name }}</span>
              </label>
              <div class="feature-badges">
                <span class="badge priority" :class="'priority-' + (fp.priority || 'P2')">
                  {{ fp.priority || 'P2' }}
                </span>
                <span class="badge category">{{ fp.category || '正向功能' }}</span>
              </div>
            </div>
            <div v-if="fp.description" class="feature-description">
              {{ fp.description }}
            </div>
            <div v-if="fp.preconditions && fp.preconditions.length" class="feature-preconditions">
              <span class="precondition-label">前置条件:</span>
              <span v-for="(cond, i) in fp.preconditions" :key="i" class="precondition-tag">
                {{ cond }}
              </span>
            </div>
          </div>
          <div class="feature-actions">
            <button @click="startEdit(index)" class="action-btn edit-btn" title="编辑">
              ✏️
            </button>
            <button @click="deleteFeature(index)" class="action-btn delete-btn" title="删除">
              🗑️
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="table-footer">
      <div class="footer-info">
        <span class="info-text">💡 双击功能点可快速编辑</span>
      </div>
      <button
        @click="handleGenerate"
        :disabled="selectedCount === 0"
        class="btn btn-primary generate-btn"
      >
        <span class="btn-icon">🚀</span>
        <span>确认并生成测试用例</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  data: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['generate', 'update'])

const filterCategory = ref('')
const filterPriority = ref('')
const editingIndex = ref(-1)
const editData = ref({})

const selectedCount = computed(() => {
  return props.data.filter(fp => fp.selected).length
})

const filteredFeatures = computed(() => {
  let filtered = [...props.data]
  
  if (filterCategory.value) {
    filtered = filtered.filter(fp => fp.category === filterCategory.value)
  }
  if (filterPriority.value) {
    filtered = filtered.filter(fp => fp.priority === filterPriority.value)
  }
  
  return filtered
})

const selectAll = (selected) => {
  const updatedData = props.data.map(fp => ({
    ...fp,
    selected
  }))
  emit('update', updatedData)
}

const startEdit = (index) => {
  editingIndex.value = index
  editData.value = JSON.parse(JSON.stringify(props.data[index]))
}

const saveEdit = (index) => {
  const updatedData = [...props.data]
  updatedData[index] = { ...editData.value }
  editingIndex.value = -1
  emit('update', updatedData)
}

const cancelEdit = () => {
  editingIndex.value = -1
  editData.value = {}
}

const deleteFeature = (index) => {
  if (confirm('确定要删除这个功能点吗？')) {
    const updatedData = [...props.data]
    updatedData.splice(index, 1)
    if (editingIndex.value === index) {
      editingIndex.value = -1
      editData.value = {}
    }
    emit('update', updatedData)
  }
}

const handleGenerate = () => {
  const selectedFeatures = props.data.filter(fp => fp.selected)
  emit('generate', selectedFeatures)
}

const toggleSelected = (index) => {
  const updatedData = [...props.data]
  updatedData[index] = {
    ...updatedData[index],
    selected: !updatedData[index].selected
  }
  emit('update', updatedData)
}
</script>

<style scoped>
.feature-table-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.table-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.table-stats {
  display: flex;
  gap: 16px;
}

.stat-item {
  padding: 4px 12px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  font-size: 13px;
}

.stat-item.selected {
  background: rgba(255, 255, 255, 0.3);
  font-weight: 600;
}

.filter-bar {
  display: flex;
  gap: 10px;
  padding: 16px 24px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.filter-select {
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: white;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-select:hover {
  border-color: #667eea;
}

.filter-select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

.btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-success {
  background: #10b981;
  color: white;
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.feature-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
}

.feature-item {
  padding: 16px;
  margin-bottom: 12px;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  background: white;
  transition: all 0.2s;
}

.feature-item:hover {
  border-color: #667eea;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.1);
}

.feature-item.selected {
  border-color: #667eea;
  background: linear-gradient(135deg, #f0f4ff 0%, #f5f3ff 100%);
}

.feature-item.editing {
  border-color: #f59e0b;
  background: #fffbeb;
}

.feature-display {
  display: flex;
  gap: 12px;
}

.feature-checkbox {
  padding-top: 4px;
}

.feature-checkbox input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.feature-info {
  flex: 1;
  min-width: 0;
}

.feature-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.feature-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  flex: 1;
  min-width: 0;
}

.feature-id {
  padding: 2px 8px;
  background: #667eea;
  color: white;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.feature-name {
  font-weight: 600;
  color: #1e293b;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.feature-badges {
  display: flex;
  gap: 6px;
}

.badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.badge.priority {
  color: white;
}

.badge.priority-P0 {
  background: #ef4444;
}

.badge.priority-P1 {
  background: #f59e0b;
}

.badge.priority-P2 {
  background: #3b82f6;
}

.badge.priority-P3 {
  background: #6b7280;
}

.badge.category {
  background: #e2e8f0;
  color: #475569;
}

.feature-description {
  color: #64748b;
  font-size: 13px;
  line-height: 1.5;
  margin-bottom: 8px;
}

.feature-preconditions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.precondition-label {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
}

.precondition-tag {
  padding: 2px 8px;
  background: #dbeafe;
  color: #1d4ed8;
  border-radius: 4px;
  font-size: 11px;
}

.feature-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: #f1f5f9;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.action-btn:hover {
  transform: scale(1.1);
}

.edit-btn:hover {
  background: #f59e0b;
  color: white;
}

.delete-btn:hover {
  background: #ef4444;
  color: white;
}

.edit-form {
  padding: 16px;
}

.edit-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.edit-row label {
  min-width: 60px;
  font-weight: 500;
  color: #475569;
  padding-top: 8px;
}

.edit-input, .edit-select, .edit-textarea {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 13px;
}

.edit-input:focus, .edit-select:focus, .edit-textarea:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.edit-textarea {
  min-height: 60px;
  resize: vertical;
}

.edit-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.table-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
}

.footer-info {
  flex: 1;
}

.info-text {
  font-size: 13px;
  color: #64748b;
}

.generate-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  font-size: 14px;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-icon {
  font-size: 16px;
}
</style>
