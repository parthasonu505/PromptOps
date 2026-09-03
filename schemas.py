from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


# User schemas
class UserBase(BaseModel):
    username: str
    email: str
    role: str
    first_name: str
    last_name: str
    is_active: bool = True


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


class User(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UserLogin(BaseModel):
    username: str
    password: str


class UserLoginResponse(BaseModel):
    user: User
    token: str


# Prompt schemas
class PromptBase(BaseModel):
    name: str
    description: Optional[str] = None
    content: str
    category: str
    status: str
    environment: str
    access_level: str
    variables: List[Dict[str, Any]] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    fragment_slugs: List[str] = Field(default_factory=list)


class PromptCreate(PromptBase):
    pass


class PromptUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    environment: Optional[str] = None
    access_level: Optional[str] = None
    variables: Optional[List[Dict[str, Any]]] = None
    tags: Optional[List[str]] = None
    fragment_slugs: Optional[List[str]] = None


class Prompt(PromptBase):
    id: int
    author_id: int
    current_version_id: Optional[int] = None
    usage_count: int = 0
    rating: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Prompt Version schemas
class PromptVersionBase(BaseModel):
    prompt_id: int
    version: str
    content: str
    changelog: Optional[str] = None
    status: str = "draft"


class PromptVersionCreate(PromptVersionBase):
    pass


class PromptVersionUpdate(BaseModel):
    version: Optional[str] = None
    content: Optional[str] = None
    changelog: Optional[str] = None
    status: Optional[str] = None


class PromptVersion(PromptVersionBase):
    id: int
    author_id: int
    eval_status: str = "none"
    eval_score: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


# Eval schemas
EVAL_TYPES = {"prompt_contains", "prompt_regex", "output_contains", "output_regex", "llm_judge"}


class EvalTestCase(BaseModel):
    """A single test case within an eval suite."""
    id: str
    name: str
    input_variables: Dict[str, str] = Field(default_factory=dict)
    # For output_* and llm_judge, the user message to send after the system prompt
    test_input: Optional[str] = None
    eval_type: str          # see EVAL_TYPES
    expected: Optional[str] = None   # for *_contains / *_regex
    rubric: Optional[str] = None     # for llm_judge: criteria the response must satisfy


class EvalTestResult(BaseModel):
    test_case_id: str
    test_case_name: str
    passed: bool
    actual: Optional[str] = None
    expected: Optional[str] = None
    error: Optional[str] = None


class PromptEvalCreate(BaseModel):
    prompt_id: int
    name: str
    description: Optional[str] = None
    test_cases: List[EvalTestCase]
    pass_threshold: int = 100     # % of cases that must pass (0-100)
    judge_provider: Optional[str] = None
    judge_model: Optional[str] = None


class PromptEvalUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    test_cases: Optional[List[EvalTestCase]] = None
    pass_threshold: Optional[int] = None
    judge_provider: Optional[str] = None
    judge_model: Optional[str] = None
    is_active: Optional[bool] = None


class PromptEvalResponse(BaseModel):
    id: int
    prompt_id: int
    name: str
    description: Optional[str] = None
    test_cases: List[EvalTestCase]
    pass_threshold: int
    judge_provider: Optional[str] = None
    judge_model: Optional[str] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class EvalRunTrigger(BaseModel):
    version_id: int
    # If the eval suite uses LLM-based checks, supply the encrypted API key
    # from the user's configured LLM provider (retrieved via /api/user-llm-configs).
    llm_config_id: Optional[int] = None


class EvalRunResponse(BaseModel):
    id: int
    eval_id: int
    version_id: int
    status: str
    score: Optional[int] = None
    results: Optional[List[EvalTestResult]] = None
    started_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# LLM Provider schemas
class LlmProviderBase(BaseModel):
    name: str
    display_name: str
    base_url: str
    api_key_required: bool = True
    models: List[Dict[str, Any]] = Field(default_factory=list)
    is_active: bool = True


class LlmProviderCreate(LlmProviderBase):
    pass


class LlmProviderUpdate(BaseModel):
    name: Optional[str] = None
    display_name: Optional[str] = None
    base_url: Optional[str] = None
    api_key_required: Optional[bool] = None
    models: Optional[List[Dict[str, Any]]] = None
    is_active: Optional[bool] = None


class LlmProvider(LlmProviderBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# User LLM Config schemas
class UserLlmConfigBase(BaseModel):
    provider_id: int
    api_key: str
    is_active: bool = True


class UserLlmConfigCreate(UserLlmConfigBase):
    pass


class UserLlmConfigUpdate(BaseModel):
    api_key: Optional[str] = None
    is_active: Optional[bool] = None


class UserLlmConfig(BaseModel):
    id: int
    user_id: int
    provider_id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Favorite schemas
class FavoriteBase(BaseModel):
    prompt_id: int


class FavoriteCreate(FavoriteBase):
    pass


class Favorite(FavoriteBase):
    id: int
    user_id: int
    created_at: datetime

    class Config:
        from_attributes = True


# Prompt Comparison schemas
class PromptComparisonBase(BaseModel):
    name: str
    description: Optional[str] = None
    prompt_id: int
    models: List[str]
    input_data: Dict[str, Any]


class PromptComparisonCreate(PromptComparisonBase):
    pass


class PromptComparisonUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    models: Optional[List[str]] = None
    input_data: Optional[Dict[str, Any]] = None
    results: Optional[Dict[str, Any]] = None


class PromptComparison(PromptComparisonBase):
    id: int
    user_id: int
    results: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Approval schemas
class ApprovalBase(BaseModel):
    prompt_id: int
    version_id: int
    comments: Optional[str] = None


class ApprovalCreate(ApprovalBase):
    """Schema for creating a new approval request. 
    requester_id and status are set automatically by the backend."""
    pass


class ApprovalUpdate(BaseModel):
    status: Optional[str] = None
    comments: Optional[str] = None
    approver_id: Optional[int] = None


class Approval(BaseModel):
    """Full approval response schema with all fields."""
    id: int
    prompt_id: int
    version_id: int
    requester_id: int
    approver_id: Optional[int] = None
    status: str
    comments: Optional[str] = None
    requested_at: datetime
    reviewed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserBasicInfo(BaseModel):
    """Basic user info for embedding in responses."""
    id: int
    username: str
    first_name: str
    last_name: str
    
    class Config:
        from_attributes = True


class PromptBasicInfo(BaseModel):
    """Basic prompt info for embedding in responses."""
    id: int
    name: str
    description: Optional[str] = None
    category: str
    
    class Config:
        from_attributes = True


class ApprovalWithDetails(BaseModel):
    """Approval response with related prompt and user details."""
    id: int
    prompt_id: int
    version_id: int
    requester_id: int
    approver_id: Optional[int] = None
    status: str
    comments: Optional[str] = None
    requested_at: datetime
    reviewed_at: Optional[datetime] = None
    prompt: Optional[PromptBasicInfo] = None
    requester: Optional[UserBasicInfo] = None
    approver: Optional[UserBasicInfo] = None
    
    class Config:
        from_attributes = True


# Token schema
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# API Key schemas
class ApiKeyCreate(BaseModel):
    name: str
    scopes: List[str] = Field(default_factory=list)
    expires_in_days: Optional[int] = None


class ApiKeyResponse(BaseModel):
    id: int
    name: str
    key_prefix: str
    scopes: List[str]
    is_active: bool
    last_used_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ApiKeyCreated(ApiKeyResponse):
    """Returned only once at creation — includes the full plaintext key."""
    key: str


# SDK runtime schemas
class PromptSDK(BaseModel):
    """Minimal prompt payload for SDK consumers."""
    id: int
    name: str
    slug: str
    description: Optional[str] = None
    content: str
    version: Optional[str] = None
    version_id: Optional[int] = None
    category: str
    environment: str
    variables: List[Dict[str, Any]] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    fragment_slugs: List[str] = Field(default_factory=list)
    eval_status: str = "none"
    eval_score: Optional[int] = None
    updated_at: datetime

    class Config:
        from_attributes = True


class PromptRenderRequest(BaseModel):
    variables: Dict[str, str] = Field(default_factory=dict)
    version: Optional[str] = None
    environment: Optional[str] = None


class PromptRenderResponse(BaseModel):
    slug: str
    version: Optional[str] = None
    rendered: str
    variables_used: List[str] = Field(default_factory=list)
    variables_missing: List[str] = Field(default_factory=list)


# ── Prompt Fragments ────────────────────────────────────────────────────────

class PromptFragmentCreate(BaseModel):
    slug: str
    name: str
    description: Optional[str] = None
    content: str
    category: Optional[str] = None
    owner_team: Optional[str] = None
    version: str = "1.0.0"


class PromptFragmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    owner_team: Optional[str] = None
    version: Optional[str] = None
    is_active: Optional[bool] = None


class PromptFragmentResponse(BaseModel):
    id: int
    slug: str
    name: str
    description: Optional[str] = None
    content: str
    category: Optional[str] = None
    owner_team: Optional[str] = None
    version: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── A/B Experiments ─────────────────────────────────────────────────────────

class ExperimentCreate(BaseModel):
    prompt_id: int
    name: str
    description: Optional[str] = None
    control_version_id: int
    variant_version_id: int
    traffic_split: int = Field(20, ge=1, le=99)  # % to variant


class ExperimentUpdate(BaseModel):
    status: Optional[str] = None         # paused | running | completed
    winner_version_id: Optional[int] = None
    traffic_split: Optional[int] = None


class ExperimentResponse(BaseModel):
    id: int
    prompt_id: int
    name: str
    description: Optional[str] = None
    control_version_id: int
    variant_version_id: int
    traffic_split: int
    status: str
    winner_version_id: Optional[int] = None
    started_at: datetime
    ended_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Production Logging ───────────────────────────────────────────────────────

class ProductionLogCreate(BaseModel):
    prompt_id: int
    version_id: Optional[int] = None
    version_str: Optional[str] = None
    environment: Optional[str] = None
    input_variables: Optional[Dict[str, str]] = None
    rendered_prompt: Optional[str] = None
    llm_output: str
    model_id: Optional[str] = None
    latency_ms: Optional[int] = None
    token_count: Optional[int] = None
    cost_cents: Optional[int] = None
    feedback: Optional[str] = None     # positive | negative
    session_id: Optional[str] = None
    experiment_id: Optional[int] = None


class ProductionLogResponse(BaseModel):
    id: int
    prompt_id: int
    version_id: Optional[int] = None
    version_str: Optional[str] = None
    environment: Optional[str] = None
    llm_output: str
    model_id: Optional[str] = None
    latency_ms: Optional[int] = None
    token_count: Optional[int] = None
    feedback: Optional[str] = None
    session_id: Optional[str] = None
    logged_at: datetime

    class Config:
        from_attributes = True


class ProductionStats(BaseModel):
    prompt_id: int
    version_str: Optional[str] = None
    total_calls: int
    positive_feedback: int
    negative_feedback: int
    avg_latency_ms: Optional[float] = None
    avg_token_count: Optional[float] = None
    period_hours: int


# ── Drift Alerts ─────────────────────────────────────────────────────────────

class DriftAlertResponse(BaseModel):
    id: int
    prompt_id: int
    version_id: Optional[int] = None
    alert_type: str
    severity: str
    description: Optional[str] = None
    evidence: Optional[Dict[str, Any]] = None
    status: str
    remediation_task_id: Optional[int] = None
    detected_at: datetime
    resolved_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DriftAlertUpdate(BaseModel):
    status: str    # acknowledged | resolved


# ── Agent Tasks ──────────────────────────────────────────────────────────────

class AgentTaskResponse(BaseModel):
    id: int
    task_type: str
    prompt_id: Optional[int] = None
    version_id: Optional[int] = None
    status: str
    input_data: Optional[Dict[str, Any]] = None
    output_data: Optional[Dict[str, Any]] = None
    reasoning: Optional[str] = None
    confidence: Optional[int] = None
    triggered_by: Optional[str] = None
    review_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AgentTaskReview(BaseModel):
    approved: bool
    notes: Optional[str] = None


class AgentTriggerRequest(BaseModel):
    prompt_id: int
    version_id: Optional[int] = None
    llm_config_id: Optional[int] = None   # which user LLM config to use for the agent


class OptimizeRequest(BaseModel):
    version_id: int
    llm_config_id: int
    target_token_reduction: int = 20      # % reduction target


# ── Model Certifications ──────────────────────────────────────────────────────

class CertificationRequest(BaseModel):
    version_id: int
    model_provider: str
    model_id: str
    llm_config_id: int


class CertificationResponse(BaseModel):
    id: int
    prompt_id: int
    version_id: int
    model_provider: str
    model_id: str
    score: Optional[int] = None
    status: Optional[str] = None
    eval_run_id: Optional[int] = None
    certified_at: datetime

    class Config:
        from_attributes = True


class CertificationMatrixEntry(BaseModel):
    model_provider: str
    model_id: str
    score: Optional[int] = None
    status: Optional[str] = None
    certified_at: Optional[datetime] = None