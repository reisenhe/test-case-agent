"""FastAPI routes for TestCase Agent v5.3.

This module implements the REST + SSE API for the TestCase Agent system.

Features:
- SQLite-backed session persistence (survives restarts)
- Automatic session recovery on startup
- Full CRUD support for sessions
"""

import asyncio
import json
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import APIRouter, HTTPException, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langgraph.types import Command
from loguru import logger

from .shared.models import (
    StartSessionRequest,
    ChatRequest,
    ResumeRequest,
    StartGenerationRequest,
    SaveRequest,
)
from .phase1.agent import get_chat_agent
from .phase1.session_manager import (
    get_session_manager,
    init_session_manager,
    close_session_manager,
)
from .phase1.context import get_full_context_for_generation
from .phase2.task_manager import TaskManager
from .phase2.generator import TestCaseGenerator
from .phase2.quality_analyzer import analyze_quality
from .shared.tools.export import export_testcases


# ==================== Lifespan Management ====================


@asynccontextmanager
async def testcase_lifespan(app: FastAPI):
    """
    TestCase Agent 生命周期管理

    用法 1 - 独立应用:
        app = FastAPI(lifespan=testcase_lifespan)

    用法 2 - 挂载到现有应用:
        @asynccontextmanager
        async def lifespan(app):
            async with testcase_lifespan(app):
                yield
    """
    logger.info("[TestCase API] Starting up...")

    # 初始化 SessionManager（SQLite checkpointer）
    await init_session_manager()
    logger.info("[TestCase API] SessionManager initialized")

    yield

    # 关闭资源
    await close_session_manager()
    logger.info("[TestCase API] Shutdown complete")


# ==================== Router Definition ====================


router = APIRouter(prefix="/v1/testcase-agent", tags=["测试用例生成智能体"])

# 全局实例
task_manager = TaskManager()
generator = TestCaseGenerator(max_concurrent=10)


# ==================== Phase 1: 需求澄清 ====================


@router.post("/sessions", summary="启动会话")
async def start_session(req: StartSessionRequest):
    """
    启动 Phase 1 需求澄清会话

    Returns:
        session_id: 会话 ID
        status: 状态
    """
    session_manager = get_session_manager()
    session_id = await session_manager.create_session(req.project_id)

    logger.info(f"[API] Started session: {session_id}")

    return {
        "session_id": session_id,
        "status": "ready",
        "message": "会话已创建，可以开始对话",
    }


@router.get("/sessions", summary="获取会话列表")
async def list_sessions():
    """
    获取所有活跃会话列表

    Returns:
        sessions: 会话列表
    """
    session_manager = get_session_manager()
    sessions = await session_manager.list_sessions()

    logger.info(f"[API] Listed {len(sessions)} sessions")

    return {
        "sessions": sessions,
        "total": len(sessions),
    }


@router.get("/sessions/{session_id}", summary="获取会话详情")
async def get_session_detail(session_id: str):
    """
    获取会话详细信息（包括历史消息）

    Args:
        session_id: 会话 ID

    Returns:
        会话详情
    """
    session_manager = get_session_manager()
    session = await session_manager.get_session_details(session_id)

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    logger.info(f"[API] Retrieved session details: {session_id}")

    return session


@router.delete("/sessions/{session_id}", summary="删除会话")
async def delete_session(session_id: str):
    """
    删除指定会话

    Args:
        session_id: 会话 ID

    Returns:
        删除结果
    """
    session_manager = get_session_manager()
    
    # 检查会话是否存在
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    await session_manager.delete_session(session_id)

    logger.info(f"[API] Deleted session: {session_id}")

    return {
        "session_id": session_id,
        "status": "deleted",
        "message": "会话已删除"
    }


@router.post("/sessions/{session_id}/chat", summary="SSE 流式对话")
async def chat_stream(session_id: str, req: ChatRequest):
    """
    SSE 流式对话（支持 HITL 中断）

    Args:
        session_id: 会话 ID
        req: 对话请求

    Returns:
        StreamingResponse: SSE 事件流
    """

    async def event_generator():
        try:
            agent, config = await get_chat_agent(session_id, req.project_id)

            logger.info(f"[API] Starting chat stream for session: {session_id}")

            # 🚀 使用 astream_events 实现流式输出
            async for event in agent.astream_events(
                {"messages": [("user", req.message)]}, config, version="v1"
            ):
                event_type = event.get("event")

                # 调试日志
                if event_type not in ["on_chat_model_stream"]:
                    logger.debug(f"[API] Event: {event_type}, data keys: {list(event.get('data', {}).keys())}")

                # 1. 流式输出 token
                if event_type == "on_chat_model_stream":
                    chunk = event.get("data", {}).get("chunk")
                    if chunk and hasattr(chunk, "content"):
                        token = chunk.content
                        if token:
                            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

                # 2. 工具调用
                elif event_type == "on_tool_start":
                    tool_name = event.get("data", {}).get("name", "unknown")
                    tool_input = event.get("data", {}).get("input", {})
                    logger.info(f"[API] Tool start: {tool_name}, input keys: {list(tool_input.keys()) if isinstance(tool_input, dict) else type(tool_input)}")
                    yield f"data: {json.dumps({'type': 'tool_start', 'tool': tool_name})}\n\n"

                elif event_type == "on_tool_end":
                    tool_name = event.get("data", {}).get("name", "unknown")
                    tool_output = event.get("data", {}).get("output", {})
                    logger.info(f"[API] Tool end: {tool_name}, output type: {type(tool_output)}")

                # 3. HITL 中断检测
                elif event_type == "on_chain_end":
                    result = event.get("data", {}).get("output")
                    if result:
                        # 调试日志：打印 result 的结构
                        if "__interrupt__" in result:
                            logger.info(f"[API] Found __interrupt__ in result: {result['__interrupt__']}")
                            interrupt_data = result["__interrupt__"][0].value
                            logger.info(f"[API] Interrupt data: {interrupt_data}")
                            action_requests = interrupt_data.get("action_requests", [])

                            if action_requests:
                                action_request = action_requests[0]
                                feature_points = action_request.get("args", {}).get(
                                    "feature_points", []
                                )

                                logger.info(
                                    f"[API] HITL interrupt for session: {session_id}"
                                )

                                yield f"data: {json.dumps({
                                    'type': 'hitl_interrupt',
                                    'feature_points': feature_points,
                                    'allowed_decisions': ['approve', 'edit', 'reject']
                                })}\n\n"
                        else:
                            # 调试：打印 result 的 keys
                            logger.debug(f"[API] on_chain_end result keys: {list(result.keys()) if isinstance(result, dict) else type(result)}")

            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            logger.info(f"[API] Chat stream completed for session: {session_id}")

        except Exception as e:
            import traceback
            logger.error(f"[API] Chat stream error: {e}")
            logger.error(f"[API] Traceback: {traceback.format_exc()}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/sessions/{session_id}/resume", summary="恢复 HITL 中断")
async def resume_hitl(session_id: str, req: ResumeRequest):
    """
    恢复 HITL 中断的会话

    Args:
        session_id: 会话 ID
        req: 恢复请求

    Returns:
        status: 状态
        message: 消息
    """
    agent, config = await get_chat_agent(session_id)

    # 构建恢复命令
    if req.decision == "approve":
        resume_data = {"decisions": [{"type": "approve"}]}
    elif req.decision == "edit":
        if not req.modified_features:
            raise HTTPException(
                status_code=400, detail="Modified features required for edit decision"
            )

        resume_data = {
            "decisions": [
                {
                    "type": "edit",
                    "args": {
                        "feature_points": [
                            fp.model_dump() for fp in req.modified_features
                        ]
                    },
                }
            ]
        }
    elif req.decision == "reject":
        resume_data = {"decisions": [{"type": "reject"}]}
    else:
        raise HTTPException(status_code=400, detail="Invalid decision type")

    logger.info(f"[API] Resuming session {session_id} with decision: {req.decision}")

    # 🚀 使用 Command(resume=...) 恢复执行
    result = await agent.ainvoke(Command(resume=resume_data), config)

    # 提取最终消息
    messages = result.get("messages", [])
    final_message = messages[-1].content if messages else ""

    logger.info(f"[API] Session {session_id} resumed successfully")

    return {
        "status": "resumed",
        "message": final_message,
        "session_id": session_id,
    }


# ==================== Phase 2: 并发生成 ====================


@router.post("/generate", summary="启动并发生成任务")
async def start_generation(req: StartGenerationRequest):
    """
    启动 Phase 2 并发生成任务

    立即返回 task_id，前端应轮询 /tasks/{id} 获取进度

    Args:
        req: 生成请求

    Returns:
        task_id: 任务 ID
        status: 状态
        total_features: 总功能点数
    """
    # 创建任务
    task_id = await task_manager.create_task()

    logger.info(
        f"[API] Starting generation task: {task_id} for session: {req.session_id}"
    )

    # 启动后台任务
    asyncio.create_task(
        _run_generation_task(
            task_id=task_id,
            session_id=req.session_id,
            feature_points=req.feature_points,
            requirement_content=req.requirement_content,
            max_concurrent=req.max_concurrent,
        )
    )

    return {
        "task_id": task_id,
        "status": "processing",
        "total_features": len(req.feature_points),
        "session_id": req.session_id,
    }


async def _run_generation_task(
    task_id: str,
    session_id: str,
    feature_points: list[dict],
    requirement_content: str,
    max_concurrent: int,
):
    """
    后台执行生成任务

    Args:
        task_id: 任务 ID
        session_id: 会话 ID
        feature_points: 功能点列表
        requirement_content: 原始需求文档
        max_concurrent: 最大并发数
    """
    try:
        # 更新任务状态
        await task_manager.update_task(
            task_id,
            status="processing",
            total=len(feature_points),
            progress=0,
        )

        logger.info(f"[API] Task {task_id}: Starting generation")

        # 🆕 Phase 1→2: 语境传承
        session_manager = get_session_manager()
        session_info = await session_manager.get_session(session_id)

        if session_info:
            # 使用共享的 checkpointer（而不是 session_info.checkpointer）
            global_context = await get_full_context_for_generation(
                checkpointer=session_manager.get_checkpointer(),
                session_id=session_id,
                original_requirement=requirement_content,
            )
        else:
            # 如果会话不存在，只使用原始需求
            global_context = f"## 核心需求文档\n\n{requirement_content}"

        logger.info(
            f"[API] Task {task_id}: Context extracted: {len(global_context)} chars"
        )

        # 进度回调
        async def progress_callback(completed: int, total: int, feature_id: str):
            await task_manager.update_task(
                task_id,
                progress=completed,
                current_feature=feature_id,
            )

        # 🚀 并发生成
        result = await generator.generate_parallel(
            feature_points=feature_points,
            global_context=global_context,
            progress_callback=progress_callback,
        )

        # 导出文件
        file_url = await export_testcases(
            test_cases=result["test_cases"],
            format="excel",
            filename=f"testcases_{task_id[:8]}",
        )

        # 更新任务完成状态
        await task_manager.update_task(
            task_id,
            status="completed",
            progress=len(feature_points),
            result={
                "test_cases": result["test_cases"],
                "feature_points": feature_points,  # 保存功能点用于质量分析
                "file_url": file_url,
                "total_features": result["total_features"],
                "success_count": result["success_count"],
                "failure_count": result["failure_count"],
                "errors": result["errors"],
                "context_length": len(global_context),
            },
        )

        logger.info(f"[API] Task {task_id}: Generation completed")

    except Exception as e:
        logger.error(f"[API] Task {task_id}: Generation failed - {e}")
        await task_manager.update_task(
            task_id,
            status="failed",
            error=str(e),
        )


@router.get("/tasks/{task_id}", summary="查询任务状态")
async def get_task_status(task_id: str):
    """
    查询生成任务状态

    Args:
        task_id: 任务 ID

    Returns:
        task_id: 任务 ID
        status: 状态
        progress: 进度
        total: 总数
        result: 结果（如果完成）
        error: 错误信息（如果失败）
    """
    task = await task_manager.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    return {
        "task_id": task.task_id,
        "status": task.status,
        "progress": task.progress,
        "total": task.total,
        "current_feature": task.current_feature,
        "result": task.result,
        "error": task.error,
        "created_at": task.created_at.isoformat(),
    }


@router.get("/tasks/{task_id}/stream", summary="SSE 实时进度")
async def task_stream(task_id: str):
    """
    Server-Sent Events 实时进度流

    Args:
        task_id: 任务 ID

    Returns:
        StreamingResponse: SSE 事件流
    """

    async def event_generator():
        while True:
            task = await task_manager.get_task(task_id)

            if not task:
                yield f"data: {json.dumps({'error': 'Task not found'})}\n\n"
                break

            # 发送当前状态
            yield f"data: {json.dumps({
                'status': task.status,
                'progress': task.progress,
                'total': task.total,
                'current_feature': task.current_feature,
            })}\n\n"

            # 任务完成或失败时停止
            if task.status in ["completed", "failed"]:
                break

            await asyncio.sleep(1)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/tasks/{task_id}/save", summary="保存到项目")
async def save_to_project(task_id: str, req: SaveRequest):
    """
    保存测试用例到项目（仅在任务完成后调用）

    Args:
        task_id: 任务 ID
        req: 保存请求

    Returns:
        saved: 保存数量
        total: 总数量
    """
    task = await task_manager.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.status != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Task not completed. Current status: {task.status}",
        )

    test_cases = task.result.get("test_cases", [])

    # TODO: 调用数据库保存逻辑（需要根据你的实际数据库实现）
    # saved_count = await _save_testcases_to_db(
    #     test_cases=test_cases,
    #     project_id=req.project_id,
    #     module_id=req.module_id,
    #     create_user=req.create_user
    # )

    saved_count = len(test_cases)  # 临时：假设全部保存成功

    logger.info(f"[API] Saved {saved_count} test cases to project {req.project_id}")

    return {
        "saved": saved_count,
        "total": len(test_cases),
        "project_id": req.project_id,
    }


@router.get("/tasks/{task_id}/download", summary="下载测试用例")
async def download_testcases(task_id: str, format: str = "excel"):
    """
    下载测试用例文件

    Args:
        task_id: 任务 ID
        format: 导出格式 (excel/json)

    Returns:
        FileResponse: 文件下载响应
    """
    from fastapi.responses import FileResponse
    from pathlib import Path

    task = await task_manager.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.status != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Task not completed. Current status: {task.status}",
        )

    # 从任务结果中获取文件路径
    result = task.result
    if not result or "file_url" not in result:
        raise HTTPException(status_code=404, detail="Export file not found")

    file_path = Path(result["file_url"])

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on server")

    # 确定文件扩展名和 MIME 类型
    suffix = file_path.suffix.lower()
    media_type_map = {
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".json": "application/json",
        ".xmind": "application/x-xmind",
    }
    media_type = media_type_map.get(suffix, "application/octet-stream")

    logger.info(f"[API] Downloading file: {file_path}")

    return FileResponse(
        path=file_path,
        filename=file_path.name,
        media_type=media_type,
    )


# ==================== Quality Analysis ====================


@router.get("/tasks/{task_id}/quality-report", summary="获取质量报告")
async def get_quality_report(task_id: str):
    """
    获取测试用例集的质量分析报告

    Args:
        task_id: 任务 ID

    Returns:
        覆盖率统计、优先级分布、类型分布、质量缺口、改进建议
    """
    task = await task_manager.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.status != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Task not completed. Current status: {task.status}",
        )

    test_cases = task.result.get("test_cases", [])
    feature_points = task.result.get("feature_points", [])

    # 如果结果中没有功能点，尝试从请求中获取
    if not feature_points:
        # 从 task 的原始数据中获取（如果有保存的话）
        feature_points = getattr(task, "feature_points", [])

    # 分析质量
    report = analyze_quality(test_cases, feature_points)

    logger.info(
        f"[API] Quality report generated for task {task_id}: score={report.score}"
    )

    return {
        "task_id": task_id,
        "report": report.model_dump(),
    }


@router.get("/tasks/{task_id}/coverage", summary="获取覆盖率统计")
async def get_coverage_stats(task_id: str):
    """
    获取测试用例的覆盖率统计

    Args:
        task_id: 任务 ID

    Returns:
        覆盖率指标和达标情况
    """
    task = await task_manager.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.status != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Task not completed. Current status: {task.status}",
        )

    test_cases = task.result.get("test_cases", [])
    feature_points = task.result.get("feature_points", [])

    report = analyze_quality(test_cases, feature_points)

    return {
        "task_id": task_id,
        "coverage": report.coverage.model_dump(),
        "targets": report.coverage.check_targets(),
    }


@router.get("/tasks/{task_id}/distribution", summary="获取用例分布")
async def get_distribution_stats(task_id: str):
    """
    获取测试用例的优先级和类型分布

    Args:
        task_id: 任务 ID

    Returns:
        优先级分布、类型分布
    """
    task = await task_manager.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.status != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Task not completed. Current status: {task.status}",
        )

    test_cases = task.result.get("test_cases", [])

    report = analyze_quality(test_cases, [])

    return {
        "task_id": task_id,
        "priority_distribution": report.priority_distribution.model_dump(),
        "priority_percentages": report.priority_distribution.to_percentages(),
        "priority_targets": report.priority_distribution.check_targets(),
        "type_distribution": report.type_distribution.model_dump(),
    }


# ==================== Application Factory ====================


def create_app() -> FastAPI:
    """
    创建独立的 TestCase Agent FastAPI 应用

    用法:
        app = create_app()
        uvicorn.run(app, host="0.0.0.0", port=8001)

    Returns:
        FastAPI: 配置好的应用实例
    """
    app = FastAPI(
        title="TestCase Agent API",
        description="Enterprise-grade Test Case Generator with DeepAgent + HITL",
        version="5.3.0",
        lifespan=testcase_lifespan,
    )

    # CORS 配置
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 注册路由
    app.include_router(router)

    # 健康检查端点
    @app.get("/health")
    async def health():
        session_manager = get_session_manager()
        return {
            "status": "healthy",
            "session_manager_initialized": session_manager.is_initialized,
            **session_manager.get_stats(),
        }

    # 根端点
    @app.get("/")
    async def root():
        return {
            "name": "TestCase Agent API",
            "version": "5.3.0",
            "features": [
                "SQLite persistence",
                "Session recovery",
                "HITL (Human-in-the-Loop)",
                "Parallel generation",
            ],
            "endpoints": {
                "POST /v1/testcase-agent/sessions": "Create a new session",
                "GET /v1/testcase-agent/sessions": "List all sessions",
                "POST /v1/testcase-agent/sessions/{id}/chat": "SSE chat stream",
                "POST /v1/testcase-agent/generate": "Start parallel generation",
            },
        }

    return app
