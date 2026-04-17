"""Configuration for Test Case Generator Agent."""

from dataclasses import dataclass, field
from typing import Literal
import os


@dataclass
class AgentConfig:
    """Test case generator agent configuration."""
    model: str = "openai:gpt-4o"
    temperature: float = 0.7
    max_iterations: int = 100
    recursion_limit: int = 1000


@dataclass
class ServerConfig:
    """Server configuration."""
    host: str = "0.0.0.0"
    port: int = 8001
    reload: bool = False


@dataclass
class StorageConfig:
    """Storage configuration."""
    checkpoint_db: str = "testcase_checkpoints.db"
    exports_dir: str = "exports"


Phase = Literal[
    "initialized",
    "requirement_input",
    "features_extracted",
    "features_confirmed",
    "testcases_generated",
    "testcases_confirmed",
    "exported",
    "completed"
]

PHASE_TRANSITIONS = {
    "initialized": ["requirement_input"],
    "requirement_input": ["features_extracted"],
    "features_extracted": ["features_confirmed"],
    "features_confirmed": ["testcases_generated"],
    "testcases_generated": ["testcases_confirmed"],
    "testcases_confirmed": ["exported"],
    "exported": ["completed"],
}


agent_config = AgentConfig(
    model=os.getenv("TESTCASE_LLM_MODEL", os.getenv("OPENAI_LLM_MODEL", "gpt-4o")),
    temperature=float(os.getenv("TESTCASE_TEMPERATURE", "0.7")),
)

server_config = ServerConfig(
    host=os.getenv("TESTCASE_HOST", "0.0.0.0"),
    port=int(os.getenv("TESTCASE_PORT", "8001")),
    reload=os.getenv("TESTCASE_RELOAD", "false").lower() == "true",
)

storage_config = StorageConfig(
    checkpoint_db=os.getenv("TESTCASE_CHECKPOINT_DB", "testcase_checkpoints.db"),
    exports_dir=os.getenv("TESTCASE_EXPORTS_DIR", "exports"),
)
