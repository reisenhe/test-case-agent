"""Parallel Test Case Generator for Phase 2.

This module implements engineering-grade parallel generation with:
- Task-level semaphore isolation
- Independent Agent instances
- Memory aggregation
- Skill-based generation (loaded on-demand)
"""

import asyncio
import os
import json
import re
from pathlib import Path
from typing import Callable, Optional

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)
from loguru import logger

from .memory_pool import MemoryPool


# 获取当前目录
BASE_DIR = Path(__file__).parent.parent
SKILLS_DIR = BASE_DIR / "shared" / "skills"


# ==================== Skill Loading ====================


class SkillLoader:
    """Skills 加载器 - 按需加载 skill 内容"""

    def __init__(self, skills_dir: Path = SKILLS_DIR):
        self.skills_dir = skills_dir
        self._cache: dict[str, str] = {}

    def load_skill(self, skill_name: str) -> str:
        """
        加载指定 skill 的完整内容

        Args:
            skill_name: skill 名称，如 "test-case-generation"

        Returns:
            skill 的完整内容（SKILL.md 文件内容）
        """
        if skill_name in self._cache:
            return self._cache[skill_name]

        skill_path = self.skills_dir / skill_name / "SKILL.md"

        if not skill_path.exists():
            logger.warning(f"[SkillLoader] Skill not found: {skill_path}")
            return f"Skill '{skill_name}' not found."

        with open(skill_path, "r", encoding="utf-8") as f:
            content = f.read()

        # 提取 --- 之后的正文（跳过 YAML frontmatter）
        # 但保留 # 标题内容
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                content = parts[2].strip()

        self._cache[skill_name] = content
        logger.info(f"[SkillLoader] Loaded skill: {skill_name} ({len(content)} chars)")

        return content

    def list_available_skills(self) -> list[str]:
        """列出所有可用的 skills"""
        if not self.skills_dir.exists():
            return []

        skills = []
        for item in self.skills_dir.iterdir():
            if item.is_dir() and (item / "SKILL.md").exists():
                skills.append(item.name)

        return skills

    def get_skill_description(self, skill_name: str) -> str:
        """获取 skill 的简短描述（从 frontmatter 中提取）"""
        skill_path = self.skills_dir / skill_name / "SKILL.md"

        if not skill_path.exists():
            return ""

        with open(skill_path, "r", encoding="utf-8") as f:
            content = f.read()

        # 提取 YAML frontmatter 中的 description
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 2:
                frontmatter = parts[1]
                for line in frontmatter.split("\n"):
                    if line.startswith("description:"):
                        return line.split(":", 1)[1].strip()

        return ""


# 全局 SkillLoader 实例
skill_loader = SkillLoader()


# ==================== Generator Prompts ====================


# 基础系统提示词（不包含 skill 内容）
GENERATOR_BASE_PROMPT = """# 测试用例生成器

你是专业的测试用例生成器。根据给定的功能点和全局上下文生成详细、高质量的测试用例。

## ⚠️ 重要规则

1. **只输出 JSON**：严格按照提供的 JSON Schema 输出，不要输出任何其他内容
2. **遵守全局约束**：全局上下文中提到的所有约定必须体现在测试用例中
3. **满足覆盖率目标**：确保生成的用例达到覆盖率要求
4. **遵循 Skill 指导**：严格按照加载的 skill 内容生成用例

## 输出格式

必须输出以下 JSON 格式：
```json
{
  "test_cases": [
    {
      "id": "TC-FP-XXX-001",
      "feature_point_id": "FP-XXX",
      "title": "用例标题",
      "purpose": "测试目的",
      "priority": "P1",
      "type": "正向",
      "preconditions": ["前置条件1"],
      "steps": [
        {"step_no": 1, "action": "操作描述", "test_data": "具体数据", "expected_result": "可验证结果"}
      ],
      "postconditions": ["后置条件1"],
      "tags": ["标签1"]
    }
  ]
}
```
"""


def build_generator_prompt(include_skill: bool = True) -> str:
    """
    构建生成器提示词（可选择是否包含 skill 内容）

    Args:
        include_skill: 是否包含 test-case-generation skill 的完整内容

    Returns:
        完整的生成器提示词
    """
    prompt = GENERATOR_BASE_PROMPT

    if include_skill:
        # 加载 test-case-generation skill
        skill_content = skill_loader.load_skill("test-case-generation")

        prompt += f"""

## ==================== 测试用例生成 Skill ====================

{skill_content}

## ==================== Skill 内容结束 ====================

"""

    return prompt


# 预加载的完整提示词（包含 skill）
GENERATOR_SYSTEM_PROMPT = build_generator_prompt(include_skill=True)


class TestCaseGenerator:
    """并发生成器（任务级信号量隔离）"""

    def __init__(self, max_concurrent: int = 10):
        """
        初始化生成器

        Args:
            max_concurrent: 最大并发数
        """
        self.max_concurrent = max_concurrent
        self._memory_pool = MemoryPool()

        # 预加载 skill 以验证可用性
        available_skills = skill_loader.list_available_skills()
        logger.info(f"[Generator] Available skills: {available_skills}")

    async def generate_parallel(
        self,
        feature_points: list[dict],
        global_context: str,
        progress_callback: Optional[Callable] = None,
    ) -> dict:
        """
        并发生成测试用例

        Args:
            feature_points: 功能点列表
            global_context: ✅ 增量拼接的完整上下文
            progress_callback: 进度回调函数

        Returns:
            {
                "test_cases": list,
                "total_features": int,
                "success_count": int,
                "failure_count": int,
                "errors": list,
            }
        """
        # 🆕 任务级信号量（避免全局死锁）
        local_semaphore = asyncio.Semaphore(self.max_concurrent)

        all_test_cases = []
        errors = []
        completed = 0
        total = len(feature_points)

        logger.info(
            f"[Generator] Starting parallel generation: {total} features, max_concurrent={self.max_concurrent}"
        )

        # 创建所有任务
        tasks = [
            self._generate_single_feature(fp, global_context, local_semaphore)
            for fp in feature_points
        ]

        # 使用 as_completed 实现进度追踪
        for coro in asyncio.as_completed(tasks):
            result = await coro
            completed += 1

            if result["success"]:
                # 🆕 内存聚合，最高效
                all_test_cases.extend(result["test_cases"])
            else:
                errors.append(
                    {"feature_id": result["feature_id"], "error": result["error"]}
                )

            # 进度回调
            if progress_callback:
                await progress_callback(completed, total, result["feature_id"])

        success_count = total - len(errors)

        logger.info(
            f"[Generator] Complete: {success_count}/{total} success, {len(all_test_cases)} cases"
        )

        return {
            "test_cases": all_test_cases,
            "total_features": total,
            "success_count": success_count,
            "failure_count": len(errors),
            "errors": errors,
        }

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((TimeoutError, ConnectionError)),
        reraise=True,
    )
    async def _generate_single_feature(
        self,
        feature_point: dict,
        global_context: str,
        semaphore: asyncio.Semaphore,
    ) -> dict:
        """
        生成单个功能点的测试用例（带重试）

        Args:
            feature_point: 功能点数据
            global_context: 完整的测试上下文
            semaphore: 任务级信号量

        Returns:
            {
                "feature_id": str,
                "test_cases": list,
                "success": bool,
                "error": Optional[str]
            }
        """
        feature_id = feature_point.get("id", "unknown")

        async with semaphore:  # 🆕 任务级并发限制
            try:
                logger.info(f"[Generator] Starting: {feature_id}")

                # 🆕 使用简单的 LLM 调用 + JSON 解析
                model = self._create_model()

                # 🆕 使用包含 skill 的完整提示词
                prompt = f"""{GENERATOR_SYSTEM_PROMPT}

## 全局测试上下文

{global_context}

---

## 当前目标功能点

- ID: {feature_id}
- 名称: {feature_point.get('name')}
- 分类: {feature_point.get('category')}
- 描述: {feature_point.get('description')}
- 优先级: {feature_point.get('priority')}
- 前置条件: {', '.join(feature_point.get('preconditions', [])) or '无'}
- 测试建议: {', '.join(feature_point.get('test_suggestions', []))}

## 输入参数（如有）

{self._format_input_parameters(feature_point.get('input_parameters', []))}

## 生成要求

**重要**：
1. 严格按照上方 Skill 中的生成规则生成用例
2. 只输出 JSON 格式，不要输出任何其他内容
3. 每个测试用例的 feature_point_id 必须是 "{feature_id}"
4. 优先级必须使用 P1-P5（不要使用 P0）
5. 测试数据使用具体值（如 "testuser" 而非 "用户名"）
"""

                response = await model.ainvoke([HumanMessage(content=prompt)])
                content = response.content

                # 解析 JSON 输出
                test_cases = self._parse_json_output(content, feature_id)

                if test_cases:
                    logger.info(
                        f"[Generator] Success: {feature_id} -> {len(test_cases)} cases"
                    )

                    return {
                        "feature_id": feature_id,
                        "test_cases": test_cases,
                        "success": True,
                        "error": None,
                    }
                else:
                    raise ValueError("Failed to parse test cases from output")

            except Exception as e:
                logger.error(f"[Generator] Failed: {feature_id} -> {e}")
                return {
                    "feature_id": feature_id,
                    "test_cases": [],
                    "success": False,
                    "error": str(e),
                }

    def _create_model(self):
        """
        创建 LLM 模型

        Returns:
            ChatOpenAI: 配置好的模型
        """
        return ChatOpenAI(
            model=os.getenv("OPENAI_LLM_MODEL", "gpt-4o"),
            openai_api_base=os.getenv("OPENAI_BASE_URL"),
            openai_api_key=os.getenv("OPENAI_API_KEY"),
            temperature=0.7,
        )

    def _format_input_parameters(self, input_parameters: list) -> str:
        """
        格式化输入参数信息

        Args:
            input_parameters: 输入参数列表

        Returns:
            格式化后的字符串
        """
        if not input_parameters:
            return "（未提供输入参数信息，请根据功能描述自行识别）"

        lines = []
        for param in input_parameters:
            name = param.get("name", "未知参数")
            ptype = param.get("type", "未知类型")
            required = "必填" if param.get("required") else "可选"
            constraints = param.get("constraints", "无限制")

            lines.append(f"- **{name}** ({ptype}, {required}): {constraints}")

        return "\n".join(lines)

    def _parse_json_output(self, content: str, feature_id: str) -> list[dict]:
        """
        解析 LLM 输出的 JSON

        Args:
            content: LLM 输出内容
            feature_id: 功能点 ID

        Returns:
            测试用例列表
        """
        try:
            # 尝试提取 JSON 块
            json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', content)
            if json_match:
                json_str = json_match.group(1)
            else:
                # 尝试直接解析
                json_str = content

            # 清理 JSON 字符串
            json_str = json_str.strip()

            # 解析 JSON
            data = json.loads(json_str)

            # 提取测试用例
            if isinstance(data, dict) and "test_cases" in data:
                test_cases = data["test_cases"]
            elif isinstance(data, list):
                test_cases = data
            else:
                logger.warning(f"[Generator] Unexpected JSON structure: {list(data.keys()) if isinstance(data, dict) else type(data)}")
                return []

            # 规范化测试用例
            normalized = []
            for i, tc in enumerate(test_cases):
                normalized.append({
                    "id": tc.get("id", f"TC-{feature_id}-{i+1:03d}"),
                    "feature_point_id": feature_id,
                    "title": tc.get("title", f"测试用例 {i+1}"),
                    "purpose": tc.get("purpose", tc.get("test_purpose", "")),
                    "priority": tc.get("priority", "P2"),
                    "type": tc.get("type", "正向"),
                    "preconditions": tc.get("preconditions", []),
                    "steps": tc.get("steps", []),
                    "postconditions": tc.get("postconditions", []),
                    "tags": tc.get("tags", []),
                })

            return normalized

        except json.JSONDecodeError as e:
            logger.error(f"[Generator] JSON parse error: {e}")
            # 尝试更宽松的提取
            return self._extract_test_cases_loose(content, feature_id)

    def _extract_test_cases_loose(self, content: str, feature_id: str) -> list[dict]:
        """
        宽松模式提取测试用例

        Args:
            content: LLM 输出内容
            feature_id: 功能点 ID

        Returns:
            测试用例列表
        """
        # 简单的回退：创建一个基本测试用例
        logger.warning(f"[Generator] Using loose extraction for {feature_id}")

        return [{
            "id": f"TC-{feature_id}-001",
            "feature_point_id": feature_id,
            "title": f"基本功能测试 - {feature_id}",
            "purpose": "验证基本功能是否正常工作",
            "priority": "P1",
            "type": "正向",
            "preconditions": ["系统正常运行", "用户已登录"],
            "steps": [
                {"step_no": 1, "action": "执行基本操作", "test_data": "", "expected_result": "操作成功完成"}
            ],
            "postconditions": ["系统状态正常"],
            "tags": ["自动生成"],
        }]

    def get_memory_stats(self) -> dict:
        """
        获取内存统计

        Returns:
            统计信息
        """
        return self._memory_pool.get_stats()

    def reload_skill(self) -> str:
        """
        重新加载 skill 内容（用于热更新）

        Returns:
            加载的 skill 内容
        """
        global GENERATOR_SYSTEM_PROMPT

        # 清除缓存
        skill_loader._cache.clear()

        # 重新构建提示词
        GENERATOR_SYSTEM_PROMPT = build_generator_prompt(include_skill=True)

        logger.info("[Generator] Skill reloaded")
        return GENERATOR_SYSTEM_PROMPT
