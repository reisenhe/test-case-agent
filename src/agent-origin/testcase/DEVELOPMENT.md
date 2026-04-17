# 测试用例生成器 Agent 开发总结文档

> **版本**: 1.0.0  
> **最后更新**: 2025-02  
> **适用对象**: 后续开发维护人员

---

## 目录

1. [项目概述](#1-项目概述)
2. [架构设计](#2-架构设计)
3. [核心模块详解](#3-核心模块详解)
4. [API 接口文档](#4-api-接口文档)
5. [并行生成机制](#5-并行生成机制)
6. [配置说明](#6-配置说明)
7. [开发指南](#7-开发指南)
8. [常见问题](#8-常见问题)

---

## 1. 项目概述

### 1.1 功能定位

测试用例生成器是一个基于 **Deep Agents + LangGraph** 的智能测试用例生成系统，能够：

- 从 Markdown 格式的需求文档中自动提取可测试的功能点
- 基于功能点自动生成详细的测试用例
- 支持人工介入确认（Human-in-the-loop）
- 导出多种格式（Excel、Markdown、JSON）

### 1.2 技术栈

| 组件 | 技术 |
|------|------|
| Agent 框架 | Deep Agents (基于 LangGraph) |
| LLM | OpenAI GPT-4o (可配置) |
| Web 框架 | FastAPI |
| 状态持久化 | SQLite (AsyncSqliteSaver) |
| 数据验证 | Pydantic |

### 1.3 目录结构

```
agents/testcase/
├── __init__.py              # 模块导出
├── agent.py                 # Agent 核心创建逻辑
├── api.py                   # FastAPI 接口层
├── config.py                # 配置管理
├── models.py                # Pydantic 数据模型
├── parallel_generator.py    # 并行生成器（LangGraph Send 模式）
├── AGENTS.md                # Agent 系统提示词
├── middleware/
│   ├── __init__.py
│   ├── testcase_middleware.py   # 工作流状态管理中间件
│   └── validation_middleware.py # 质量校验中间件
├── tools/
│   ├── __init__.py
│   └── export.py            # 导出工具
└── skills/
    └── testcase-generation/
        └── SKILL.md         # 技能定义
```

---

## 2. 架构设计

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           前端 (可选)                                    │
│                    EventSource / HTTP Client                            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         FastAPI Layer (api.py)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐  │
│  │ REST API     │  │ SSE Stream   │  │ Parallel Generation API      │  │
│  │ /extract     │  │ /extract/    │  │ /generate/parallel           │  │
│  │ /generate    │  │ stream       │  │ /generate/parallel/stream    │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Agent Layer (agent.py)                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    create_deep_agent()                           │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │   │
│  │  │ Main Agent  │  │ Subagents   │  │ Middleware Stack        │  │   │
│  │  │             │  │             │  │                         │  │   │
│  │  │ System:     │  │ feature-    │  │ TodoListMiddleware      │  │   │
│  │  │ TESTCASE_   │  │ extractor   │  │ FilesystemMiddleware    │  │   │
│  │  │ SYSTEM_     │  │             │  │ SubAgentMiddleware      │  │   │
│  │  │ PROMPT      │  │ case-       │  │ SummarizationMiddleware │  │   │
│  │  │             │  │ generator   │  │ ...                     │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   Parallel Generator (parallel_generator.py)            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │              LangGraph StateGraph (Send Pattern)                 │   │
│  │                                                                   │   │
│  │    START ──[fan_out]──► [Send, Send, Send, ...]                 │   │
│  │                              │                                   │   │
│  │                              ▼ (并行执行)                         │   │
│  │         ┌────────────────────────────────────────┐               │   │
│  │         │ generate_batch  generate_batch  ...    │               │   │
│  │         └────────────────────────────────────────┘               │   │
│  │                              │                                   │   │
│  │                              ▼ (reducer 合并)                    │   │
│  │                           END                                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        LLM (OpenAI GPT-4o)                              │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 工作流程

```
┌─────────┐     ┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  开始   │────►│ 功能点提取  │────►│ 功能点确认   │────►│ 测试用例生成│
└─────────┘     └─────────────┘     └──────────────┘     └─────────────┘
                      │                    │                    │
                      ▼                    ▼                    ▼
               [LLM 调用]          [Human-in-loop]      [LLM 调用]
                                                           (可并行)
                      │                    │                    │
                      └────────────────────┴────────────────────┘
                                           │
                                           ▼
                                    ┌─────────────┐
                                    │ 测试用例确认│
                                    └─────────────┘
                                           │
                                           ▼
                                    ┌─────────────┐
                                    │   导出      │
                                    └─────────────┘
                                           │
                                           ▼
                                    ┌─────────────┐
                                    │   完成      │
                                    └─────────────┘
```

### 2.3 状态阶段 (Phase)

| Phase | 说明 | 触发条件 |
|-------|------|---------|
| `initialized` | 会话初始化 | 创建会话 |
| `features_extracted` | 功能点已提取 | LLM 完成提取 |
| `features_confirmed` | 功能点已确认 | 用户确认 |
| `testcases_generated` | 测试用例已生成 | LLM 完成生成 |
| `testcases_confirmed` | 测试用例已确认 | 用户确认 |
| `exported` | 已导出 | 导出完成 |

---

## 3. 核心模块详解

### 3.1 Agent 创建 (agent.py)

#### 核心函数：`create_testcase_agent()`

```python
def create_testcase_agent():
    """创建测试用例生成器 Agent"""
    
    # 1. 定义子代理
    feature_extractor_subagent = {
        "name": "feature-extractor",
        "description": "从需求文档中提取可测试功能点",
        "system_prompt": FEATURE_EXTRACTOR_PROMPT,
        "response_format": ProviderStrategy(FeatureExtractionOutput),
    }
    
    case_generator_subagent = {
        "name": "case-generator", 
        "description": "基于功能点生成详细测试用例",
        "system_prompt": CASE_GENERATOR_PROMPT,
        "response_format": ProviderStrategy(TestCaseGenerationOutput),
    }
    
    # 2. 创建主代理
    agent = create_deep_agent(
        model=get_llm(),
        system_prompt=TESTCASE_SYSTEM_PROMPT,
        tools=[export_testcases_tool],
        subagents=[feature_extractor_subagent, case_generator_subagent],
        middleware=[],
        checkpointer=get_checkpointer(),  # 支持状态持久化
    )
    
    return agent
```

#### 关键点：

1. **Subagent 机制**：通过 `task` 工具委派任务给专业子代理
2. **结构化输出**：使用 `ProviderStrategy` 强制 LLM 返回结构化 JSON
3. **Checkpointer**：使用 SQLite 持久化会话状态，支持断点续传

### 3.2 数据模型 (models.py)

#### 核心模型关系

```
Requirement (需求)
     │
     └──► FeaturePoint (功能点)
              │
              └──► TestCase (测试用例)
                       │
                       └──► TestStep (测试步骤)
```

#### FeaturePoint 模型

```python
class FeaturePoint(BaseModel):
    id: str                          # FP-001
    requirement_id: str              # REQ-001
    category: str                    # 正向功能/边界条件/异常处理
    name: str                        # 功能点名称
    description: str                 # 详细描述
    preconditions: list[str]         # 前置条件
    test_suggestions: list[str]      # 测试建议
    priority: Priority               # P0/P1/P2/P3
```

#### TestCase 模型

```python
class TestCase(BaseModel):
    id: str                          # TC-001
    feature_point_id: str            # 关联功能点
    title: str                       # 用例标题
    purpose: str                     # 测试目的
    priority: str                    # 优先级
    type: str                        # 正向/逆向/边界
    preconditions: list[str]         # 前置条件
    steps: list[TestStep]            # 测试步骤
    expected_results: list[str]      # 预期结果
    postconditions: list[str]        # 后置条件
    tags: list[str]                  # 标签
```

### 3.3 中间件 (middleware/)

#### TestCaseMiddleware

管理工作流状态，注入系统提示：

```python
class TestCaseMiddleware(AgentMiddleware):
    system_prompt = TESTCASE_FLOW_PROMPT
    
    def before_agent(self, state, runtime, config):
        # 初始化工作流状态
        if "current_phase" not in state:
            return {
                "current_phase": "initialized",
                "feature_points": [],
                "test_cases": [],
            }
```

#### ValidationMiddleware

执行质量校验：

```python
class ValidationMiddleware(AgentMiddleware):
    VALIDATION_RULES = {
        "feature_coverage": "每个需求至少有一个功能点",
        "testcase_completeness": "每个功能点至少有2个测试用例",
        "step_validity": "测试步骤必须包含操作和预期结果",
    }
```

### 3.4 导出工具 (tools/export.py)

支持三种导出格式：

| 格式 | 说明 | 文件扩展名 |
|------|------|-----------|
| Excel | 表格格式，适合导入测试管理工具 | .xlsx |
| Markdown | 文档格式，适合阅读和版本控制 | .md |
| JSON | 数据格式，适合程序处理 | .json |

---

## 4. API 接口文档

### 4.1 接口列表

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/session/start` | 创建新会话 |
| POST | `/extract` | 提取功能点（非流式） |
| POST | `/extract/stream` | 提取功能点（SSE 流式） |
| POST | `/confirm/features` | 确认功能点 |
| POST | `/generate` | 生成测试用例（串行） |
| POST | `/generate/stream` | 生成测试用例（SSE 流式） |
| **POST** | **`/generate/parallel`** | **并行生成测试用例** |
| **POST** | **`/generate/parallel/stream`** | **并行生成（带进度）** |
| POST | `/confirm/testcases` | 确认测试用例 |
| POST | `/export` | 导出测试用例 |
| GET | `/sessions/{session_id}` | 获取会话状态 |

### 4.2 并行生成接口详解

#### POST `/generate/parallel`

**请求体**：
```json
{
  "session_id": "uuid-string",
  "batch_size": 5,
  "feature_point_ids": ["FP-001", "FP-002"]  // 可选，不指定则处理全部
}
```

**响应**：
```json
{
  "test_cases": [...],
  "phase": "testcases_generated",
  "stats": {
    "total_features": 30,
    "total_batches": 6,
    "total_test_cases": 87,
    "elapsed_seconds": 15.3,
    "errors": []
  }
}
```

#### POST `/generate/parallel/stream`

**SSE 事件流**：

```
event: start
data: {"total_features": 30, "total_batches": 6, "batch_size": 5}

event: progress
data: {"batch_id": 1, "total_batches": 6, "completed": 1, "progress_percent": 16.7, "test_cases_in_batch": 15}

event: progress
data: {"batch_id": 2, "total_batches": 6, "completed": 2, "progress_percent": 33.3, "test_cases_in_batch": 14}

...

event: complete
data: {"test_cases": [...], "stats": {...}}
```

---

## 5. 并行生成机制

### 5.1 核心原理：LangGraph Send 模式

并行生成器使用 LangGraph 的 **Map-Reduce** 模式：

```
┌─────────────────────────────────────────────────────────────┐
│                    StateGraph                                │
│                                                              │
│  START ──────► router (fan_out)                             │
│                     │                                        │
│        ┌────────────┼────────────┐                          │
│        ▼            ▼            ▼                          │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐                    │
│   │ Batch 0 │  │ Batch 1 │  │ Batch 2 │  ... (并行)        │
│   │ (Send)  │  │ (Send)  │  │ (Send)  │                    │
│   └────┬────┘  └────┬────┘  └────┬────┘                    │
│        │            │            │                          │
│        └────────────┼────────────┘                          │
│                     ▼                                        │
│                    END (reducer 合并结果)                    │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 状态定义与 Reducer

```python
class ParallelGenState(TypedDict):
    feature_points: list[dict]
    # 关键：使用 operator.add 作为 reducer，自动合并列表
    test_cases: Annotated[list[dict], operator.add]
    batch_size: int
    completed_batches: Annotated[list[int], operator.add]
```

**Reducer 工作原理**：
```python
# 批次1返回: {"test_cases": [tc1, tc2]}
# 批次2返回: {"test_cases": [tc3, tc4]}
# 批次3返回: {"test_cases": [tc5, tc6]}
# 
# 最终状态自动合并为: {"test_cases": [tc1, tc2, tc3, tc4, tc5, tc6]}
```

### 5.3 Fan-Out 路由

```python
def create_batch_router(batch_size: int):
    def router(state: ParallelGenState) -> list[Send]:
        features = state["feature_points"]
        
        # 分批
        batches = [
            features[i:i + batch_size]
            for i in range(0, len(features), batch_size)
        ]
        
        # 创建 Send 列表 - 每个批次一个分支
        return [
            Send("generate_batch", {
                "feature_batch": batch,
                "batch_id": i,
                "total_batches": len(batches)
            })
            for i, batch in enumerate(batches)
        ]
    
    return router
```

### 5.4 性能对比

| 功能点数量 | 串行耗时 | 并行耗时 (batch_size=5) | 加速比 |
|-----------|---------|------------------------|--------|
| 10 | ~25秒 | ~10秒 | 2.5x |
| 30 | ~75秒 | ~15秒 | 5x |
| 50 | ~120秒 | ~25秒 | 4.8x |

### 5.5 使用建议

- **batch_size = 3~5**：平衡并行度和单次调用效率
- **功能点 < 10**：使用串行接口 `/generate`
- **功能点 >= 10**：使用并行接口 `/generate/parallel`

---

## 6. 配置说明

### 6.1 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `OPENAI_LLM_MODEL` | `gpt-4o` | LLM 模型 |
| `OPENAI_BASE_URL` | - | API 基础 URL |
| `TESTCASE_PORT` | `8001` | 服务端口 |
| `TESTCASE_TEMPERATURE` | `0.7` | 生成温度 |
| `TESTCASE_CHECKPOINT_DB` | `testcase_checkpoints.db` | 状态持久化数据库 |

### 6.2 配置类 (config.py)

```python
@dataclass
class AgentConfig:
    model: str = "openai:gpt-4o"
    temperature: float = 0.7
    max_iterations: int = 100

@dataclass
class ServerConfig:
    host: str = "0.0.0.0"
    port: int = 8001

@dataclass
class StorageConfig:
    checkpoint_db: str = "testcase_checkpoints.db"
    exports_dir: str = "exports"
```

---

## 7. 开发指南

### 7.1 本地启动

```bash
# 安装依赖
pip install -r requirements.txt

# 启动服务
python -m agents.testcase.api

# 或使用 uvicorn
uvicorn agents.testcase.api:app --host 0.0.0.0 --port 8001 --reload
```

### 7.2 测试流程

```bash
# 1. 创建会话
curl -X POST http://localhost:8001/session/start \
  -H "Content-Type: application/json" \
  -d '{"requirement_content": "# 登录模块\n## 功能\n用户登录..."}'

# 2. 提取功能点
curl -X POST http://localhost:8001/extract \
  -H "Content-Type: application/json" \
  -d '{"session_id": "your-session-id"}'

# 3. 确认功能点
curl -X POST http://localhost:8001/confirm/features \
  -H "Content-Type: application/json" \
  -d '{"session_id": "xxx", "feature_points": [...], "action": "confirm"}'

# 4. 并行生成测试用例
curl -X POST http://localhost:8001/generate/parallel \
  -H "Content-Type: application/json" \
  -d '{"session_id": "xxx", "batch_size": 5}'

# 5. 导出
curl -X POST http://localhost:8001/export \
  -H "Content-Type: application/json" \
  -d '{"session_id": "xxx", "format": "excel"}'
```

### 7.3 添加新的导出格式

1. 在 `tools/export.py` 中添加导出函数：

```python
def generate_html(test_cases: list[dict]) -> str:
    """生成 HTML 格式"""
    # 实现逻辑
    pass
```

2. 在 `export_testcases` 函数中添加格式支持：

```python
elif format == "html":
    html_content = generate_html(test_cases)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html_content)
```

3. 更新 API 中的 `format_map`。

### 7.4 自定义验证规则

在 `middleware/validation_middleware.py` 中添加：

```python
VALIDATION_RULES = {
    # 现有规则...
    
    "custom_rule": {
        "description": "自定义验证规则描述",
        "check": lambda state: your_validation_logic(state),
    },
}
```

---

## 8. 常见问题

### Q1: 并行生成时部分批次失败怎么办？

**A**: 并行生成器会记录错误但不中断整体流程。检查返回的 `stats.errors` 字段获取失败信息。失败的批次会生成占位测试用例，标记为"需完善"。

### Q2: 如何调整并行度？

**A**: 修改 `batch_size` 参数。值越小并行度越高，但单次调用效率降低。建议范围 3-5。

### Q3: 状态持久化在哪里？

**A**: 默认使用 SQLite 数据库 `testcase_checkpoints.db`，可通过 `TESTCASE_CHECKPOINT_DB` 环境变量修改路径。

### Q4: 如何更换 LLM 模型？

**A**: 设置环境变量 `OPENAI_LLM_MODEL` 或 `TESTCASE_LLM_MODEL`。

### Q5: 生成的测试用例质量不高怎么办？

**A**: 
1. 调整 `temperature` 参数（降低可获得更确定的输出）
2. 修改 `agent.py` 中的 `CASE_GENERATOR_PROMPT` 提示词
3. 在 `ValidationMiddleware` 中添加更严格的验证规则

---

## 附录

### A. 完整 API 请求示例

```python
import httpx
import asyncio

async def test_workflow():
    base_url = "http://localhost:8001"
    
    async with httpx.AsyncClient() as client:
        # 1. 创建会话
        resp = await client.post(f"{base_url}/session/start", json={
            "requirement_content": """
# 用户登录模块

## 功能需求
1. 用户可以使用用户名和密码登录
2. 支持记住密码功能
3. 登录失败显示错误提示

## 非功能需求
- 响应时间 < 2秒
- 密码加密存储
"""
        })
        session = resp.json()
        session_id = session["session_id"]
        print(f"Session: {session_id}")
        
        # 2. 提取功能点
        resp = await client.post(f"{base_url}/extract", json={
            "session_id": session_id
        })
        features = resp.json()
        print(f"Features: {len(features['feature_points'])} extracted")
        
        # 3. 确认功能点
        resp = await client.post(f"{base_url}/confirm/features", json={
            "session_id": session_id,
            "feature_points": features["feature_points"],
            "action": "confirm"
        })
        
        # 4. 并行生成测试用例
        resp = await client.post(f"{base_url}/generate/parallel", json={
            "session_id": session_id,
            "batch_size": 5
        })
        result = resp.json()
        print(f"Generated {len(result['test_cases'])} test cases in {result['stats']['elapsed_seconds']}s")
        
        # 5. 导出
        resp = await client.post(f"{base_url}/export", json={
            "session_id": session_id,
            "format": "excel"
        })
        with open("testcases.xlsx", "wb") as f:
            f.write(resp.content)
        print("Exported to testcases.xlsx")

asyncio.run(test_workflow())
```

### B. 相关文档链接

- [LangGraph 官方文档](https://langchain-ai.github.io/langgraph/)
- [Deep Agents 架构说明](../../learning-docs/02-core-architecture.md)
- [Subagent 协作机制](../../learning-docs/05-subagents-collaboration.md)
- [并行执行模式](https://langchain-ai.github.io/langgraph/how-tos/map-reduce/)
