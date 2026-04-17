"""TestCase Agent v5.3 - Enterprise-grade Test Case Generator.

This package implements a hybrid architecture:
- Phase 1: Requirement clarification with DeepAgent + HITL
- Phase 2: Parallel generation with engineering-grade concurrency control
"""

__version__ = "5.3.0"

# Phase 1: 需求澄清
from .phase1 import (
    create_chat_agent,
    get_chat_agent,
    get_full_context_for_generation,
    extract_delta_context,
    confirm_features,
)

# Phase 2: 并发生成
from .phase2 import (
    TestCaseGenerator,
    TaskManager,
    MemoryPool,
)

__all__ = [
    # Phase 1
    "create_chat_agent",
    "get_chat_agent",
    "get_full_context_for_generation",
    "extract_delta_context",
    "confirm_features",
    # Phase 2
    "TestCaseGenerator",
    "TaskManager",
    "MemoryPool",
]
