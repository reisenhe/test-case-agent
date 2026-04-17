# TestCase Agent v5.3 架构设计文档

## 1. 整体架构概览

```mermaid
graph TB
    subgraph Frontend["前端层 (Vue 3.5 + TypeScript)"]
        A[TestCaseAgentView.vue]
        B[ChatMessageList.vue]
        C[ChatInput.vue]
        D[FeatureTable.vue]
        E[GenerationProgress.vue]
        F[ResultActions.vue]
        SDK[testCaseAgentSDK.ts]
    end

    subgraph API["API 网关层 (NestJS)"]
        CTRL[TestcaseAgentController]
        SVC[TestcaseAgentService]
    end

    subgraph Phase1["Phase 1: 需求澄清层"]
        AGENT[createChatAgent<br/>LangGraph ReAct]
        TOOLS[confirmFeaturesTool<br/>HITL Interrupt]
        SESSION[SessionManager<br/>MemorySaver]
        CONTEXT[ContextExtractor]
    end

    subgraph Phase2["Phase 2: 用例生成层"]
        GEN[TestCaseGenerator<br/>并行生成引擎]
        TASK[TaskManager<br/>任务调度]
        MEM[MemoryPool<br/>内存池]
        QA[QualityAnalyzer<br/>质量分析]
    end

    subgraph Shared["共享基础设施"]
        MODELS[Models.ts<br/>类型定义]
        SKILLS[Skills/<br/>领域技能]
        EXPORT[Export Tool<br/>Excel导出]
    end

    subgraph External["外部依赖"]
        LLM[DashScope API<br/>qwen-plus]
        DB[(SQLite<br/>会话持久化)]
    end

    A -->|SSE / HTTP| CTRL
    CTRL --> SVC
    SVC -->|streamEvents| AGENT
    SVC -->|generateParallel| GEN
    
    AGENT --> TOOLS
    AGENT --> SESSION
    AGENT -.->|interrupt| CTRL
    
    GEN --> TASK
    GEN --> MEM
    GEN --> QA
    
    AGENT --> LLM
    GEN --> LLM
    SESSION --> DB
    
    TOOLS --> SKILLS
    GEN --> SKILLS
    QA --> SKILLS
    
    SVC --> EXPORT
```

## 2. 核心流程时序图

### 2.1 Phase 1: 需求澄清流程 (HITL)

```mermaid
sequenceDiagram
    actor User
    participant Vue as TestCaseAgentView
    participant SDK as testCaseAgentSDK
    participant Ctrl as TestcaseAgentController
    participant Svc as TestcaseAgentService
    participant Agent as LangGraph Agent
    participant Tool as confirmFeaturesTool
    participant LLM as DashScope API

    User->>Vue: 输入需求文档
    Vue->>SDK: chat(sessionId, message)
    SDK->>Ctrl: POST /sessions/:id/chat (SSE)
    Ctrl->>Svc: chatStream(sessionId, req)
    
    alt 存在挂起中断
        Svc->>Agent: getState() 检查 tasks.interrupts
        Svc->>Agent: Command({resume: reject+feedback})
    else 正常流程
        Svc->>Agent: streamEvents(HumanMessage)
    end
    
    Agent->>LLM: 分析需求文档
    LLM-->>Agent: 功能点列表
    Agent->>Tool: confirm_features(feature_points)
    Tool->>Tool: interrupt(action_requests)
    Tool-->>Svc: 中断数据
    Svc-->>SDK: SSE: hitl_interrupt
    SDK-->>Vue: 显示功能点确认面板
    
    User->>Vue: 编辑/确认功能点
    Vue->>SDK: resumeHitl(decision)
    SDK->>Ctrl: POST /sessions/:id/resume
    Ctrl->>Svc: resumeHitl(sessionId, req)
    Svc->>Agent: invoke(Command({resume}))
    Agent->>Tool: 恢复执行
    Tool-->>Agent: {decision, feature_points}
    
    alt decision = reject
        Agent->>LLM: 根据反馈调整功能点
        LLM-->>Agent: 更新后的功能点
        Agent->>Tool: confirm_features(新列表)
        Tool->>Tool: interrupt(...)
        Tool-->>Svc: 新中断数据
        Svc-->>Vue: SSE: hitl_interrupt (循环)
    else decision = approve
        Svc-->>Vue: 确认成功，进入生成阶段
    end
```

### 2.2 Phase 2: 并行生成流程

```mermaid
sequenceDiagram
    actor User
    participant Vue as TestCaseAgentView
    participant SDK as testCaseAgentSDK
    participant Ctrl as TestcaseAgentController
    participant Svc as TestcaseAgentService
    participant TaskMgr as TaskManager
    participant Gen as TestCaseGenerator
    participant Pool as MemoryPool
    participant LLM as DashScope API

    User->>Vue: 点击"生成测试用例"
    Vue->>SDK: startGeneration(feature_points)
    SDK->>Ctrl: POST /generation/start
    Ctrl->>Svc: startGeneration(req)
    Svc->>TaskMgr: createTask()
    TaskMgr-->>Svc: taskId
    Svc->>Svc: _runGenerationTask() (后台)
    Svc-->>Vue: {task_id, status: processing}
    
    par 进度流
        loop 每秒轮询
            Vue->>SDK: getTaskStatus(taskId)
            SDK->>Ctrl: GET /generation/:id/status
            Ctrl->>Svc: getTaskStatus(taskId)
            Svc->>TaskMgr: getTask(taskId)
            TaskMgr-->>Svc: TaskStatus
            Svc-->>Vue: {progress, total, current_feature}
        end
    and 生成任务
        Svc->>Svc: getFullContextForGeneration()
        Svc->>Gen: generateParallel(features, context)
        
        loop 每个功能点
            Gen->>Pool: acquire() 获取内存许可
            Pool-->>Gen: 许可 granted
            Gen->>LLM: generate(feature_point)
            LLM-->>Gen: test_cases[]
            Gen->>TaskMgr: updateTask(progress)
            Gen->>Pool: release() 释放许可
        end
        
        Gen-->>Svc: {testCases, errors}
        Svc->>Svc: exportTestcases() -> Excel
        Svc->>TaskMgr: updateTask(status: completed)
    end
    
    Vue->>SDK: getQualityReport(taskId)
    SDK->>Ctrl: GET /generation/:id/quality
    Ctrl->>Svc: getQualityReport(taskId)
    Svc->>QA: analyzeQuality(testCases, features)
    QA-->>Svc: QualityReport
    Svc-->>Vue: 质量报告 + 覆盖率统计
```

## 3. 模块详细设计

### 3.1 Phase 1 模块 (需求澄清)

```mermaid
graph LR
    subgraph Phase1Module["Phase 1: Requirement Clarification"]
        direction TB
        
        subgraph AgentLayer["Agent Layer"]
            CA[createChatAgent]
            GCA[getChatAgent]
            RA[ReAct Agent]
        end
        
        subgraph ToolLayer["Tool Layer"]
            CFT[confirmFeaturesTool]
            INT[interrupt]
        end
        
        subgraph SessionLayer["Session Layer"]
            SM[SessionManager]
            MS[MemorySaver<br/>SQLite]
            SI[SessionInfo]
        end
        
        subgraph ContextLayer["Context Layer"]
            GFC[getFullContextForGeneration]
            EDC[extractDeltaContext]
        end
    end
    
    CA -->|uses| RA
    RA -->|calls| CFT
    CFT -->|triggers| INT
    GCA -->|manages| SM
    SM -->|persists| MS
    SM -->|tracks| SI
    GFC -->|reads| MS
    EDC -->|computes| GFC
```

**关键设计决策：**

| 组件 | 职责 | 技术选型 |
|------|------|----------|
| ReAct Agent | 需求分析、功能点提取 | `@langchain/langgraph/prebuilt` |
| confirmFeaturesTool | 触发 HITL 中断 | `interrupt()` from LangGraph |
| SessionManager | 会话生命周期管理 | 单例模式 + SQLite |
| MemorySaver | 图状态持久化 | LangGraph 内置 checkpointer |
| ContextExtractor | Phase 1→2 语境传承 | 增量上下文计算 |

### 3.2 Phase 2 模块 (用例生成)

```mermaid
graph TB
    subgraph Phase2Module["Phase 2: Test Case Generation"]
        direction TB
        
        subgraph GenerationEngine["Generation Engine"]
            TG[TestCaseGenerator]
            TM[TaskManager]
            MP[MemoryPool<br/>并发控制]
        end
        
        subgraph QualityLayer["Quality Layer"]
            QA[QualityAnalyzer]
            CM[CoverageMetrics]
            PD[PriorityDistribution]
            TD[TypeDistribution]
        end
        
        subgraph ExportLayer["Export Layer"]
            ET[exportTestcases]
            EX[Excel生成]
        end
    end
    
    TG -->|schedules| TM
    TG -->|acquires| MP
    TG -->|produces| QA
    QA -->|calculates| CM
    QA -->|calculates| PD
    QA -->|calculates| TD
    TG -->|calls| ET
    ET -->|generates| EX
```

**并发控制模型：**

```mermaid
graph LR
    subgraph ConcurrencyControl["Semaphore-based Concurrency"]
        A[Feature Point 1] -->|acquire| S[Semaphore<br/>maxConcurrent=10]
        B[Feature Point 2] -->|acquire| S
        C[Feature Point N] -->|acquire| S
        S -->|release| D[LLM Worker Pool]
    end
```

### 3.3 共享基础设施

```mermaid
graph TB
    subgraph SharedInfra["Shared Infrastructure"]
        direction TB
        
        subgraph Models["Domain Models"]
            FP[FeaturePoint]
            TC[TestCase]
            TS[TestStep]
            TS2[TaskStatus]
            CM2[CoverageMetrics]
        end
        
        subgraph Skills["Agent Skills"]
            FE[feature-extraction<br/>SKILL.md]
            TG2[test-case-generation<br/>SKILL.md]
            QA2[quality-analysis<br/>SKILL.md]
        end
        
        subgraph Tools["Shared Tools"]
            EXP[export.ts<br/>Excel/JSON]
        end
    end
```

## 4. 数据流架构

### 4.1 状态管理

```mermaid
graph TB
    subgraph StateManagement["State Management"]
        direction TB
        
        subgraph GraphState["LangGraph State"]
            GS_MESSAGES[messages: BaseMessage[]]
            GS_CHECKPOINT[checkpoint: Checkpoint]
        end
        
        subgraph SessionState["Session State"]
            SS_ID[session_id: string]
            SS_PROJECT[project_id: number]
            SS_CREATED[created_at: Date]
            SS_HISTORY[history: Message[]]
        end
        
        subgraph TaskState["Task State"]
            TS_ID[task_id: string]
            TS_STATUS[status: pending/processing/completed/failed]
            TS_PROGRESS[progress: number]
            TS_RESULT[result: GenerationResult]
        end
    end
    
    GS_CHECKPOINT -->|persisted by| MS[MemorySaver]
    SS_HISTORY -->|managed by| SM[SessionManager]
    TS_RESULT -->|tracked by| TM[TaskManager]
```

### 4.2 API 接口矩阵

| 端点 | 方法 | 功能 | 响应类型 |
|------|------|------|----------|
| `/sessions` | POST | 创建会话 | JSON |
| `/sessions/:id/chat` | POST | SSE 对话流 | SSE |
| `/sessions/:id/resume` | POST | 恢复 HITL | JSON |
| `/generation/start` | POST | 启动生成 | JSON |
| `/generation/:id/status` | GET | 查询状态 | JSON |
| `/generation/:id/stream` | GET | 进度流 | SSE |
| `/generation/:id/quality` | GET | 质量报告 | JSON |
| `/generation/:id/download` | GET | 下载文件 | File |

## 5. 部署架构

```mermaid
graph TB
    subgraph Monorepo["Turborepo Monorepo"]
        subgraph Apps["apps/"]
            NEST[NestJS Service<br/>Port 3000]
            VUE[Vue 3 App<br/>Port 5173]
        end
        
        subgraph Packages["packages/"]
            UTILS[utils/<br/>共享工具]
        end
    end
    
    subgraph Runtime["Runtime Environment"]
        ENV[.env<br/>DASHSCOPE_API_KEY]
        SQLITE[(SQLite<br/>sessions.db)]
        TEMP[Temp Files<br/>exports/]
    end
    
    NEST -->|uses| UTILS
    VUE -->|API calls| NEST
    NEST -->|reads| ENV
    NEST -->|writes| SQLITE
    NEST -->|writes| TEMP
```

## 6. 关键设计模式

### 6.1 HITL (Human-in-the-Loop) 模式

```mermaid
graph LR
    A[Agent 运行] -->|调用工具| B[confirm_features]
    B -->|interrupt| C[暂停执行]
    C -->|保存状态| D[Checkpoint]
    D -->|等待| E[人类决策]
    E -->|Command(resume)| F[恢复执行]
    F -->|返回决策| B
    B -->|返回结果| A
```

### 6.2 并发生成模式

```mermaid
graph TB
    subgraph ParallelGeneration["Parallel Generation Pattern"]
        A[输入: FeaturePoints[]] --> B{分片}
        B -->|chunk 1| W1[Worker 1]
        B -->|chunk 2| W2[Worker 2]
        B -->|chunk N| WN[Worker N]
        
        W1 -->|results| C[结果聚合]
        W2 -->|results| C
        WN -->|results| C
        
        C --> D[质量分析]
        D --> E[导出文件]
    end
```

## 7. 扩展性设计

### 7.1 新增 Phase 的可能性

```mermaid
graph LR
    P1[Phase 1<br/>需求澄清] -->|approved| P2[Phase 2<br/>用例生成]
    P2 -->|completed| P3[Phase 3<br/>可扩展]
    
    subgraph FuturePhases["Future Phases"]
        P3A[自动化执行]
        P3B[缺陷预测]
        P3C[用例优化]
    end
    
    P3 -.->|可选| P3A
    P3 -.->|可选| P3B
    P3 -.->|可选| P3C
```

### 7.2 多 LLM 提供商支持

当前通过 `ChatOpenAI` 的兼容模式支持 DashScope，未来可扩展：

```typescript
// config.ts
interface LLMProvider {
  name: 'dashscope' | 'openai' | 'azure' | 'claude';
  model: string;
  baseURL: string;
  apiKey: string;
}
```

## 8. 目录结构

```
apps/nestjs-service/src/agent-for-test-case/testcase/
├── AGENTS.md                    # 项目级规范
├── config.ts                    # 全局配置
├── index.ts                     # 统一导出
├── testcase-agent-module.ts     # NestJS 模块定义
├── testcase-agent.controller.ts # REST/SSE 控制器
├── testcase-agent.service.ts    # 业务逻辑服务
├── phase1/                      # 需求澄清阶段
│   ├── agent.ts                 # LangGraph Agent 工厂
│   ├── tools.ts                 # confirm_features 工具
│   ├── session-manager.ts       # 会话管理
│   ├── context.ts               # 语境提取
│   └── index.ts
├── phase2/                      # 用例生成阶段
│   ├── generator.ts             # 并行生成引擎
│   ├── task-manager.ts          # 任务调度
│   ├── memory-pool.ts           # 内存池（并发控制）
│   ├── quality-analyzer.ts      # 质量分析
│   └── index.ts
└── shared/                      # 共享基础设施
    ├── models.ts                # 类型定义
    ├── skills/                  # 领域技能（Markdown）
    │   ├── feature-extraction/
    │   ├── test-case-generation/
    │   └── quality-analysis/
    └── tools/                   # 共享工具
        ├── export.ts            # Excel/JSON 导出
        └── index.ts
```

---

**版本**: v5.3.0  
**最后更新**: 2026-03-22
