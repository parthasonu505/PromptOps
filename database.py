from sqlalchemy import create_engine, Column, Integer, String, Text, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship, Session
from sqlalchemy.sql import func
import os
import re
from typing import AsyncGenerator

# Database URL from environment
DATABASE_URL = os.getenv("DATABASE_URL", "")

engine = create_engine(DATABASE_URL, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


# Database Models
class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)
    role = Column(String, nullable=False)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    prompts = relationship("Prompt", back_populates="author")
    llm_configs = relationship("UserLlmConfig", back_populates="user")
    favorites = relationship("Favorite", back_populates="user")
    comparisons = relationship("PromptComparison", back_populates="user")


class Prompt(Base):
    __tablename__ = "prompts"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    content = Column(Text, nullable=False)
    category = Column(String, nullable=False)
    status = Column(String, nullable=False)
    environment = Column(String, nullable=False)
    access_level = Column(String, nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    current_version_id = Column(Integer, ForeignKey("prompt_versions.id"))
    usage_count = Column(Integer, default=0)
    rating = Column(Integer)
    variables = Column(JSON, default=list)
    tags = Column(JSON, default=list)            # for routing and discovery
    fragment_slugs = Column(JSON, default=list)  # ordered list of PromptFragment slugs to compose

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    author = relationship("User", back_populates="prompts")
    versions = relationship("PromptVersion", back_populates="prompt", foreign_keys="PromptVersion.prompt_id")
    favorites = relationship("Favorite", back_populates="prompt")
    comparisons = relationship("PromptComparison", back_populates="prompt")


class PromptVersion(Base):
    __tablename__ = "prompt_versions"

    id = Column(Integer, primary_key=True, index=True)
    prompt_id = Column(Integer, ForeignKey("prompts.id"), nullable=False)
    version = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    changelog = Column(Text)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String, nullable=False)
    # Eval lifecycle fields
    eval_status = Column(String, default="none")   # none | running | passed | failed
    eval_score = Column(Integer)                   # 0-100 pass rate
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    prompt = relationship("Prompt", back_populates="versions", foreign_keys=[prompt_id])
    author = relationship("User")
    eval_runs = relationship("EvalRun", back_populates="version")


class LlmProvider(Base):
    __tablename__ = "llm_providers"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    display_name = Column(String, nullable=False)
    base_url = Column(String, nullable=False)
    api_key_required = Column(Boolean, default=True)
    models = Column(JSON, default=list)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    user_configs = relationship("UserLlmConfig", back_populates="provider")


class UserLlmConfig(Base):
    __tablename__ = "user_llm_configs"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    provider_id = Column(Integer, ForeignKey("llm_providers.id"), nullable=False)
    api_key = Column(String, nullable=False)  # Encrypted
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="llm_configs")
    provider = relationship("LlmProvider", back_populates="user_configs")


class Favorite(Base):
    __tablename__ = "favorites"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    prompt_id = Column(Integer, ForeignKey("prompts.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="favorites")
    prompt = relationship("Prompt", back_populates="favorites")


class PromptComparison(Base):
    __tablename__ = "prompt_comparisons"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)
    prompt_id = Column(Integer, ForeignKey("prompts.id"), nullable=False)
    models = Column(JSON, nullable=False)
    input_data = Column(JSON, nullable=False)
    results = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="comparisons")
    prompt = relationship("Prompt", back_populates="comparisons")


class Approval(Base):
    __tablename__ = "approvals"

    id = Column(Integer, primary_key=True, index=True)
    prompt_id = Column(Integer, ForeignKey("prompts.id"), nullable=False)
    version_id = Column(Integer, ForeignKey("prompt_versions.id"), nullable=False)
    requester_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    approver_id = Column(Integer, ForeignKey("users.id"))
    status = Column(String, nullable=False)
    comments = Column(Text)
    requested_at = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_at = Column(DateTime(timezone=True))


class PromptEval(Base):
    """An evaluation suite attached to a prompt."""
    __tablename__ = "prompt_evals"

    id = Column(Integer, primary_key=True, index=True)
    prompt_id = Column(Integer, ForeignKey("prompts.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)
    # JSON list of EvalTestCase dicts
    test_cases = Column(JSON, nullable=False, default=list)
    pass_threshold = Column(Integer, default=100)  # 0-100; % of cases that must pass
    # Optional LLM config for llm_judge / output_* eval types
    judge_provider = Column(String)
    judge_model = Column(String)
    is_active = Column(Boolean, default=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    prompt = relationship("Prompt")
    runs = relationship("EvalRun", back_populates="eval")


class EvalRun(Base):
    """One execution of a PromptEval suite against a specific prompt version."""
    __tablename__ = "eval_runs"

    id = Column(Integer, primary_key=True, index=True)
    eval_id = Column(Integer, ForeignKey("prompt_evals.id"), nullable=False)
    version_id = Column(Integer, ForeignKey("prompt_versions.id"), nullable=False)
    status = Column(String, nullable=False, default="running")  # running|passed|failed|error
    score = Column(Integer)          # 0-100 pass rate
    results = Column(JSON)           # List[EvalTestResult]
    triggered_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True))

    eval = relationship("PromptEval", back_populates="runs")
    version = relationship("PromptVersion", back_populates="eval_runs")


class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    key_prefix = Column(String(8), nullable=False, index=True)
    key_hash = Column(String, nullable=False, unique=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    scopes = Column(JSON, default=list)
    is_active = Column(Boolean, default=True)
    last_used_at = Column(DateTime(timezone=True))
    expires_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")


class PromptFragment(Base):
    """Reusable prompt component injected into prompts via {{fragment:slug}}."""
    __tablename__ = "prompt_fragments"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    content = Column(Text, nullable=False)
    category = Column(String)   # constraints | tone | output-format | persona | safety
    owner_team = Column(String)
    version = Column(String, default="1.0.0")
    is_active = Column(Boolean, default=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PromptExperiment(Base):
    """A/B test: split traffic between two versions of a prompt."""
    __tablename__ = "prompt_experiments"

    id = Column(Integer, primary_key=True, index=True)
    prompt_id = Column(Integer, ForeignKey("prompts.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)
    control_version_id = Column(Integer, ForeignKey("prompt_versions.id"), nullable=False)
    variant_version_id = Column(Integer, ForeignKey("prompt_versions.id"), nullable=False)
    traffic_split = Column(Integer, default=20)  # % routed to variant
    status = Column(String, default="running")   # running | paused | completed
    winner_version_id = Column(Integer, ForeignKey("prompt_versions.id"))
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True))


class ProductionLog(Base):
    """Actual LLM outputs logged from production via the SDK — foundation for drift detection."""
    __tablename__ = "production_logs"

    id = Column(Integer, primary_key=True, index=True)
    prompt_id = Column(Integer, ForeignKey("prompts.id"), nullable=False)
    version_id = Column(Integer, ForeignKey("prompt_versions.id"))
    version_str = Column(String)
    environment = Column(String)
    input_variables = Column(JSON)
    rendered_prompt = Column(Text)
    llm_output = Column(Text)
    model_id = Column(String)
    latency_ms = Column(Integer)
    token_count = Column(Integer)
    cost_cents = Column(Integer)
    feedback = Column(String)    # positive | negative | null
    session_id = Column(String, index=True)
    experiment_id = Column(Integer, ForeignKey("prompt_experiments.id"))
    logged_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)


class AgentTask(Base):
    """Work item created by an autonomous agent, awaiting human review."""
    __tablename__ = "agent_tasks"

    id = Column(Integer, primary_key=True, index=True)
    task_type = Column(String, nullable=False)
    # propose_fix | generate_evals | optimize_variant | certify_model
    prompt_id = Column(Integer, ForeignKey("prompts.id"))
    version_id = Column(Integer, ForeignKey("prompt_versions.id"))
    status = Column(String, default="pending")
    # pending | in_progress | awaiting_review | approved | rejected | completed
    input_data = Column(JSON)
    output_data = Column(JSON)
    reasoning = Column(Text)
    confidence = Column(Integer)    # 0-100
    triggered_by = Column(String)   # drift_alert | model_update | scheduled | manual
    trigger_ref_id = Column(Integer)
    reviewed_by = Column(Integer, ForeignKey("users.id"))
    review_notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class DriftAlert(Base):
    """Quality anomaly detected in production behaviour for a prompt version."""
    __tablename__ = "drift_alerts"

    id = Column(Integer, primary_key=True, index=True)
    prompt_id = Column(Integer, ForeignKey("prompts.id"), nullable=False)
    version_id = Column(Integer, ForeignKey("prompt_versions.id"))
    alert_type = Column(String, nullable=False)
    # constraint_violation | output_length_drift | negative_feedback_spike | model_update
    severity = Column(String, nullable=False)   # low | medium | high | critical
    description = Column(Text)
    evidence = Column(JSON)
    status = Column(String, default="open")     # open | acknowledged | resolved | auto_remediated
    remediation_task_id = Column(Integer)       # FK to agent_tasks (no constraint to avoid circular)
    detected_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    resolved_at = Column(DateTime(timezone=True))


class ModelCertification(Base):
    """Eval results for a specific prompt version against a specific LLM model."""
    __tablename__ = "model_certifications"

    id = Column(Integer, primary_key=True, index=True)
    eval_run_id = Column(Integer, ForeignKey("eval_runs.id"))
    prompt_id = Column(Integer, ForeignKey("prompts.id"), nullable=False)
    version_id = Column(Integer, ForeignKey("prompt_versions.id"), nullable=False)
    model_provider = Column(String, nullable=False)
    model_id = Column(String, nullable=False)
    score = Column(Integer)     # 0-100
    status = Column(String)     # passed | failed
    certified_at = Column(DateTime(timezone=True), server_default=func.now())


def slugify(name: str) -> str:
    """Convert a prompt name to a URL-safe slug."""
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug


# Database session dependency
async def get_db() -> AsyncGenerator[Session, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Database initialization
async def create_tables():
    Base.metadata.create_all(bind=engine)


# Database seeding
async def seed_database():
    from passlib.context import CryptContext
    
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    db = SessionLocal()
    
    try:
        # Check if data already exists
        if db.query(User).first():
            return
        
        # Create users
        users_data = [
            {
                "username": "admin",
                "email": "admin@promptops.com",
                "password": pwd_context.hash("admin123"),
                "role": "admin",
                "first_name": "Admin",
                "last_name": "User"
            },
            {
                "username": "engineer",
                "email": "engineer@promptops.com", 
                "password": pwd_context.hash("engineer123"),
                "role": "prompt_engineer",
                "first_name": "Prompt",
                "last_name": "Engineer"
            },
            {
                "username": "lead",
                "email": "lead@promptops.com",
                "password": pwd_context.hash("lead123"), 
                "role": "engineering_lead",
                "first_name": "Engineering",
                "last_name": "Lead"
            },
            {
                "username": "api_dev",
                "email": "api@promptops.com",
                "password": pwd_context.hash("api123"),
                "role": "api_developer", 
                "first_name": "API",
                "last_name": "Developer"
            }
        ]
        
        for user_data in users_data:
            user = User(**user_data)
            db.add(user)
        
        db.commit()
        
        # Create LLM providers
        providers_data = [
            {
                "name": "openai",
                "display_name": "OpenAI", 
                "base_url": "https://api.openai.com/v1",
                "models": [
                    {
                        "id": "gpt-4o",
                        "name": "GPT-4o",
                        "capabilities": ["text", "vision", "function-calling"],
                        "contextWindow": 128000,
                        "inputCostPer1k": 2.50,
                        "outputCostPer1k": 10.00
                    },
                    {
                        "id": "gpt-4o-mini", 
                        "name": "GPT-4o Mini",
                        "capabilities": ["text", "vision", "function-calling"],
                        "contextWindow": 128000,
                        "inputCostPer1k": 0.15,
                        "outputCostPer1k": 0.60
                    }
                ]
            },
            {
                "name": "anthropic",
                "display_name": "Anthropic",
                "base_url": "https://api.anthropic.com", 
                "models": [
                    {
                        "id": "claude-sonnet-4-20250514",
                        "name": "Claude 4.0 Sonnet",
                        "capabilities": ["text", "vision", "document-analysis"],
                        "contextWindow": 200000,
                        "inputCostPer1k": 3.00,
                        "outputCostPer1k": 15.00
                    }
                ]
            },
            {
                "name": "google",
                "display_name": "Google AI",
                "base_url": "https://generativelanguage.googleapis.com/v1beta",
                "models": [
                    {
                        "id": "gemini-2.5-flash",
                        "name": "Gemini 2.5 Flash",
                        "capabilities": ["text", "vision", "audio", "video"],
                        "contextWindow": 1048576,
                        "inputCostPer1k": 0.075,
                        "outputCostPer1k": 0.30
                    }
                ]
            }
        ]
        
        for provider_data in providers_data:
            provider = LlmProvider(**provider_data)
            db.add(provider)
            
        db.commit()
        
        # Create sample prompts
        prompts_data = [
            {
                "name": "Customer Support Assistant",
                "description": "Helpful customer service prompt for resolving queries",
                "content": "You are a helpful customer support assistant. Always be polite and professional when helping customers with their questions and concerns.",
                "category": "customer_support",
                "status": "approved",
                "environment": "production",
                "access_level": "organization",
                "author_id": 1,
                "usage_count": 45,
                "rating": 5
            },
            {
                "name": "Code Review Helper", 
                "description": "Assists with code review and suggestions",
                "content": "You are a senior software engineer reviewing code. Provide constructive feedback focusing on best practices, security, and performance.",
                "category": "code_generation",
                "status": "approved", 
                "environment": "staging",
                "access_level": "team",
                "author_id": 1,
                "usage_count": 23,
                "rating": 5
            }
        ]
        
        for prompt_data in prompts_data:
            prompt = Prompt(**prompt_data)
            db.add(prompt)
            
        db.commit()
        
    finally:
        db.close()