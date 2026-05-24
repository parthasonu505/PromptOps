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
    requester_id: int
    status: str
    comments: Optional[str] = None


class ApprovalCreate(ApprovalBase):
    pass


class ApprovalUpdate(BaseModel):
    status: Optional[str] = None
    comments: Optional[str] = None
    approver_id: Optional[int] = None


class Approval(ApprovalBase):
    id: int
    approver_id: Optional[int] = None
    requested_at: datetime
    reviewed_at: Optional[datetime] = None

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