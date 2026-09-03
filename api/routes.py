from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, timedelta
import re

from database import (
    get_db, User, Prompt, PromptVersion, LlmProvider, UserLlmConfig,
    Favorite, PromptComparison, Approval, ApiKey, PromptEval, EvalRun,
    PromptFragment, PromptExperiment, ProductionLog, AgentTask, DriftAlert,
    ModelCertification, slugify,
)
from schemas import (
    UserLogin, UserLoginResponse, User as UserSchema, UserCreate, UserUpdate,
    Prompt as PromptSchema, PromptCreate, PromptUpdate,
    PromptVersion as PromptVersionSchema, PromptVersionCreate, PromptVersionUpdate,
    LlmProvider as LlmProviderSchema, LlmProviderCreate, LlmProviderUpdate,
    UserLlmConfig as UserLlmConfigSchema, UserLlmConfigCreate, UserLlmConfigUpdate,
    Favorite as FavoriteSchema, FavoriteCreate,
    PromptComparison as PromptComparisonSchema, PromptComparisonCreate, PromptComparisonUpdate,
    Approval as ApprovalSchema, ApprovalCreate, ApprovalUpdate, ApprovalWithDetails,
    UserBasicInfo, PromptBasicInfo,
    ApiKeyCreate, ApiKeyResponse, ApiKeyCreated,
    PromptSDK, PromptRenderRequest, PromptRenderResponse,
    PromptEvalCreate, PromptEvalUpdate, PromptEvalResponse,
    EvalRunTrigger, EvalRunResponse,
    PromptFragmentCreate, PromptFragmentUpdate, PromptFragmentResponse,
    ExperimentCreate, ExperimentUpdate, ExperimentResponse,
    ProductionLogCreate, ProductionLogResponse, ProductionStats,
    DriftAlertResponse, DriftAlertUpdate,
    AgentTaskResponse, AgentTaskReview, AgentTriggerRequest, OptimizeRequest,
    CertificationRequest, CertificationResponse,
)
from auth import (
    authenticate_user, create_access_token, get_current_user, require_roles,
    get_current_user_from_api_key, generate_api_key, hash_api_key,
    ADMIN_ROLES, ENGINEER_ROLES, LEAD_ROLES, get_password_hash
)
from eval_service import execute_eval_run
from fragment_service import compose, validate_fragment_slugs
from drift_service import analyze_prompt, run_full_scan
from intelligence_agent import run_agent_task
from certification_service import certify_version, get_matrix
from llm_service import llm_service
from llm_service import llm_service

router = APIRouter()


# Authentication routes
@router.post("/auth/login", response_model=UserLoginResponse)
async def login(user_login: UserLogin, db: Session = Depends(get_db)):
    """Authenticate user and return JWT token."""
    user = authenticate_user(db, user_login.username, user_login.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    access_token = create_access_token(
        data={"userId": user.id, "username": user.username, "role": user.role}
    )
    
    return UserLoginResponse(
        user=UserSchema.from_orm(user),
        token=access_token
    )


@router.get("/auth/me", response_model=UserSchema)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information."""
    return UserSchema.from_orm(current_user)


# User management routes
@router.get("/users", response_model=List[UserSchema])
async def get_users(
    current_user: User = Depends(require_roles(ADMIN_ROLES)),
    db: Session = Depends(get_db)
):
    """Get all users (admin only)."""
    users = db.query(User).all()
    return [UserSchema.from_orm(user) for user in users]


@router.post("/users", response_model=UserSchema)
async def create_user(
    user_data: UserCreate,
    current_user: User = Depends(require_roles(ADMIN_ROLES)),
    db: Session = Depends(get_db)
):
    """Create a new user (admin only)."""
    # Check if username already exists
    if db.query(User).filter(User.username == user_data.username).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists"
        )
    
    # Check if email already exists
    if db.query(User).filter(User.email == user_data.email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already exists"
        )
    
    # Hash password and create user
    hashed_password = get_password_hash(user_data.password)
    user = User(
        username=user_data.username,
        email=user_data.email,
        password=hashed_password,
        role=user_data.role,
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        is_active=user_data.is_active
    )
    
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return UserSchema.from_orm(user)


# Prompt routes
@router.get("/prompts", response_model=List[PromptSchema])
async def get_prompts(
    category: Optional[str] = None,
    status: Optional[str] = None,
    environment: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get prompts with optional filtering."""
    query = db.query(Prompt)
    
    # Apply filters
    if category:
        query = query.filter(Prompt.category == category)
    if status:
        query = query.filter(Prompt.status == status)
    if environment:
        query = query.filter(Prompt.environment == environment)
    
    # Apply access control
    if current_user.role not in ADMIN_ROLES:
        query = query.filter(
            (Prompt.access_level == "organization") |
            (Prompt.access_level == "team") |
            ((Prompt.access_level == "private") & (Prompt.author_id == current_user.id))
        )
    
    prompts = query.all()
    return [PromptSchema.from_orm(prompt) for prompt in prompts]


@router.post("/prompts", response_model=PromptSchema)
async def create_prompt(
    prompt_data: PromptCreate,
    current_user: User = Depends(require_roles(ENGINEER_ROLES)),
    db: Session = Depends(get_db)
):
    """Create a new prompt with an initial version."""
    prompt = Prompt(
        **prompt_data.dict(),
        author_id=current_user.id
    )
    
    db.add(prompt)
    db.commit()
    db.refresh(prompt)
    
    # Create initial version (v1.0.0) for the prompt
    initial_version = PromptVersion(
        prompt_id=prompt.id,
        version="1.0.0",
        content=prompt.content,
        changelog="Initial version",
        author_id=current_user.id,
        status="draft"
    )
    db.add(initial_version)
    db.commit()
    db.refresh(initial_version)
    
    # Set the current version
    prompt.current_version_id = initial_version.id
    db.commit()
    db.refresh(prompt)
    
    return PromptSchema.from_orm(prompt)


@router.get("/prompts/{prompt_id}", response_model=PromptSchema)
async def get_prompt(
    prompt_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific prompt."""
    prompt = db.query(Prompt).filter(Prompt.id == prompt_id).first()
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found"
        )
    
    # Check access permissions
    if (current_user.role not in ADMIN_ROLES and
        prompt.access_level == "private" and
        prompt.author_id != current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    return PromptSchema.from_orm(prompt)


@router.put("/prompts/{prompt_id}", response_model=PromptSchema)
async def update_prompt(
    prompt_id: int,
    prompt_data: PromptUpdate,
    current_user: User = Depends(require_roles(ENGINEER_ROLES)),
    db: Session = Depends(get_db)
):
    """Update a prompt."""
    prompt = db.query(Prompt).filter(Prompt.id == prompt_id).first()
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found"
        )
    
    # Check permissions
    if (current_user.role not in LEAD_ROLES and
        prompt.author_id != current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied"
        )
    
    # Update fields
    for field, value in prompt_data.dict(exclude_unset=True).items():
        setattr(prompt, field, value)
    
    db.commit()
    db.refresh(prompt)
    
    return PromptSchema.from_orm(prompt)


@router.delete("/prompts/{prompt_id}")
async def delete_prompt(
    prompt_id: int,
    current_user: User = Depends(require_roles(LEAD_ROLES)),
    db: Session = Depends(get_db)
):
    """Delete a prompt."""
    prompt = db.query(Prompt).filter(Prompt.id == prompt_id).first()
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found"
        )
    
    db.delete(prompt)
    db.commit()
    
    return {"message": "Prompt deleted successfully"}


# Prompt Version routes
@router.get("/prompt-versions/{prompt_id}", response_model=List[PromptVersionSchema])
async def get_prompt_versions(
    prompt_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all versions of a prompt."""
    versions = db.query(PromptVersion).filter(PromptVersion.prompt_id == prompt_id).all()
    return [PromptVersionSchema.from_orm(version) for version in versions]


@router.post("/prompt-versions", response_model=PromptVersionSchema)
async def create_prompt_version(
    version_data: PromptVersionCreate,
    current_user: User = Depends(require_roles(ENGINEER_ROLES)),
    db: Session = Depends(get_db)
):
    """Create a new prompt version."""
    version = PromptVersion(
        **version_data.dict(),
        author_id=current_user.id
    )
    
    db.add(version)
    db.commit()
    db.refresh(version)
    
    return PromptVersionSchema.from_orm(version)


# LLM Provider routes
@router.get("/llm-providers", response_model=List[LlmProviderSchema])
async def get_llm_providers(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all LLM providers."""
    providers = db.query(LlmProvider).filter(LlmProvider.is_active == True).all()
    return [LlmProviderSchema.from_orm(provider) for provider in providers]


# User LLM Configuration routes
@router.get("/user-llm-configs", response_model=List[UserLlmConfigSchema])
async def get_user_llm_configs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user's LLM configurations."""
    configs = db.query(UserLlmConfig).filter(UserLlmConfig.user_id == current_user.id).all()
    return [UserLlmConfigSchema.from_orm(config) for config in configs]


@router.post("/user-llm-configs", response_model=UserLlmConfigSchema)
async def create_user_llm_config(
    config_data: UserLlmConfigCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new LLM configuration for the user."""
    # Check if provider exists
    provider = db.query(LlmProvider).filter(LlmProvider.id == config_data.provider_id).first()
    if not provider:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="LLM provider not found"
        )
    
    # Encrypt API key
    encrypted_api_key = llm_service.encrypt_api_key(config_data.api_key)
    
    config = UserLlmConfig(
        user_id=current_user.id,
        provider_id=config_data.provider_id,
        api_key=encrypted_api_key,
        is_active=config_data.is_active
    )
    
    db.add(config)
    db.commit()
    db.refresh(config)
    
    return UserLlmConfigSchema.from_orm(config)


@router.delete("/user-llm-configs/{config_id}")
async def delete_user_llm_config(
    config_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a user's LLM configuration."""
    config = db.query(UserLlmConfig).filter(
        UserLlmConfig.id == config_id,
        UserLlmConfig.user_id == current_user.id
    ).first()
    
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Configuration not found"
        )
    
    db.delete(config)
    db.commit()
    
    return {"message": "Configuration deleted successfully"}


# Favorites routes
@router.get("/favorites", response_model=List[FavoriteSchema])
async def get_favorites(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user's favorite prompts."""
    favorites = db.query(Favorite).filter(Favorite.user_id == current_user.id).all()
    return [FavoriteSchema.from_orm(favorite) for favorite in favorites]


@router.post("/favorites", response_model=FavoriteSchema)
async def add_favorite(
    favorite_data: FavoriteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a prompt to favorites."""
    # Check if already favorited
    existing = db.query(Favorite).filter(
        Favorite.user_id == current_user.id,
        Favorite.prompt_id == favorite_data.prompt_id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Prompt already in favorites"
        )
    
    favorite = Favorite(
        user_id=current_user.id,
        prompt_id=favorite_data.prompt_id
    )
    
    db.add(favorite)
    db.commit()
    db.refresh(favorite)
    
    return FavoriteSchema.from_orm(favorite)


@router.delete("/favorites/{prompt_id}")
async def remove_favorite(
    prompt_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove a prompt from favorites."""
    favorite = db.query(Favorite).filter(
        Favorite.user_id == current_user.id,
        Favorite.prompt_id == prompt_id
    ).first()
    
    if not favorite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Favorite not found"
        )
    
    db.delete(favorite)
    db.commit()
    
    return {"message": "Favorite removed successfully"}


# Prompt Comparison routes
@router.get("/prompt-comparisons", response_model=List[PromptComparisonSchema])
async def get_prompt_comparisons(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user's prompt comparisons."""
    comparisons = db.query(PromptComparison).filter(PromptComparison.user_id == current_user.id).all()
    return [PromptComparisonSchema.from_orm(comparison) for comparison in comparisons]


@router.post("/prompt-comparisons", response_model=PromptComparisonSchema)
async def create_prompt_comparison(
    comparison_data: PromptComparisonCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new prompt comparison."""
    comparison = PromptComparison(
        **comparison_data.dict(),
        user_id=current_user.id
    )
    
    db.add(comparison)
    db.commit()
    db.refresh(comparison)
    
    return PromptComparisonSchema.from_orm(comparison)


# Approval routes
@router.get("/approvals", response_model=List[ApprovalWithDetails])
async def get_approvals(
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get approvals with related details (filtered by role)."""
    query = db.query(Approval)
    
    if status_filter:
        query = query.filter(Approval.status == status_filter)
    
    # Filter based on role
    if current_user.role in LEAD_ROLES:
        # Leads can see all approvals
        pass
    else:
        # Others can only see their own requests
        query = query.filter(Approval.requester_id == current_user.id)
    
    approvals = query.order_by(Approval.requested_at.desc()).all()
    
    # Build response with related data
    result = []
    for approval in approvals:
        # Get related prompt
        prompt = db.query(Prompt).filter(Prompt.id == approval.prompt_id).first()
        prompt_info = PromptBasicInfo(
            id=prompt.id,
            name=prompt.name,
            description=prompt.description,
            category=prompt.category
        ) if prompt else None
        
        # Get requester
        requester = db.query(User).filter(User.id == approval.requester_id).first()
        requester_info = UserBasicInfo(
            id=requester.id,
            username=requester.username,
            first_name=requester.first_name,
            last_name=requester.last_name
        ) if requester else None
        
        # Get approver if exists
        approver_info = None
        if approval.approver_id:
            approver = db.query(User).filter(User.id == approval.approver_id).first()
            if approver:
                approver_info = UserBasicInfo(
                    id=approver.id,
                    username=approver.username,
                    first_name=approver.first_name,
                    last_name=approver.last_name
                )
        
        result.append(ApprovalWithDetails(
            id=approval.id,
            prompt_id=approval.prompt_id,
            version_id=approval.version_id,
            requester_id=approval.requester_id,
            approver_id=approval.approver_id,
            status=approval.status,
            comments=approval.comments,
            requested_at=approval.requested_at,
            reviewed_at=approval.reviewed_at,
            prompt=prompt_info,
            requester=requester_info,
            approver=approver_info
        ))
    
    return result


@router.post("/approvals", response_model=ApprovalSchema)
async def create_approval(
    approval_data: ApprovalCreate,
    current_user: User = Depends(require_roles(ENGINEER_ROLES)),
    db: Session = Depends(get_db),
):
    """
    Submit a version for approval.

    If the prompt has active eval suites, the version must have a passing
    eval run (eval_status == 'passed') before approval can be requested.
    Admins may bypass this gate.
    """
    # Verify the prompt exists
    prompt = db.query(Prompt).filter(Prompt.id == approval_data.prompt_id).first()
    if not prompt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")

    version = db.query(PromptVersion).filter(PromptVersion.id == approval_data.version_id).first()
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")

    # Check if there's already a pending approval for this version
    existing_approval = (
        db.query(Approval)
        .filter(
            Approval.prompt_id == approval_data.prompt_id,
            Approval.version_id == approval_data.version_id,
            Approval.status == "pending"
        )
        .first()
    )
    if existing_approval:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="There is already a pending approval request for this version"
        )

    # Eval gate — only block non-admins when active eval suites exist
    if current_user.role not in ADMIN_ROLES:
        active_evals = (
            db.query(PromptEval)
            .filter(PromptEval.prompt_id == approval_data.prompt_id, PromptEval.is_active == True)
            .count()
        )
        if active_evals > 0 and version.eval_status != "passed":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Version '{version.version}' must pass all eval suites before it can be "
                    f"submitted for approval. Current eval status: '{version.eval_status}'. "
                    "Run evals via POST /api/evals/{eval_id}/run first."
                ),
            )

    # Create approval with requester_id from current user and status as pending
    approval = Approval(
        prompt_id=approval_data.prompt_id,
        version_id=approval_data.version_id,
        requester_id=current_user.id,
        status="pending",
        comments=approval_data.comments
    )
    db.add(approval)
    
    # Update the prompt status to pending_review
    prompt.status = "pending_review"
    
    db.commit()
    db.refresh(approval)
    return ApprovalSchema.from_orm(approval)


@router.put("/approvals/{approval_id}", response_model=ApprovalSchema)
async def update_approval(
    approval_id: int,
    approval_update: ApprovalUpdate,
    current_user: User = Depends(require_roles(LEAD_ROLES)),
    db: Session = Depends(get_db),
):
    """
    Update an approval request (approve or reject).
    
    Only leads and admins can approve/reject. When approved, the prompt status
    is updated to 'approved' and the version becomes the current version.
    """
    approval = db.query(Approval).filter(Approval.id == approval_id).first()
    if not approval:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval not found")
    
    if approval.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot update approval that is already {approval.status}"
        )
    
    # Update approval fields
    if approval_update.status:
        approval.status = approval_update.status
    if approval_update.comments is not None:
        approval.comments = approval_update.comments
    
    approval.approver_id = current_user.id
    approval.reviewed_at = datetime.utcnow()
    
    # Update prompt and version status based on approval decision
    prompt = db.query(Prompt).filter(Prompt.id == approval.prompt_id).first()
    version = db.query(PromptVersion).filter(PromptVersion.id == approval.version_id).first()
    
    if approval_update.status == "approved":
        if prompt:
            prompt.status = "approved"
            prompt.current_version_id = approval.version_id
        if version:
            version.status = "approved"
    elif approval_update.status == "rejected":
        if prompt:
            prompt.status = "rejected"
        if version:
            version.status = "rejected"
    
    db.commit()
    db.refresh(approval)
    return ApprovalSchema.from_orm(approval)


# ---------------------------------------------------------------------------
# Eval suite CRUD
# ---------------------------------------------------------------------------

@router.get("/evals", response_model=List[PromptEvalResponse])
async def list_evals(
    prompt_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List eval suites, optionally filtered by prompt."""
    query = db.query(PromptEval)
    if prompt_id:
        query = query.filter(PromptEval.prompt_id == prompt_id)
    return [PromptEvalResponse.from_orm(e) for e in query.all()]


@router.post("/evals", response_model=PromptEvalResponse, status_code=status.HTTP_201_CREATED)
async def create_eval(
    body: PromptEvalCreate,
    current_user: User = Depends(require_roles(ENGINEER_ROLES)),
    db: Session = Depends(get_db),
):
    """Create an eval suite for a prompt."""
    prompt = db.query(Prompt).filter(Prompt.id == body.prompt_id).first()
    if not prompt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")

    # Validate eval_types
    from schemas import EVAL_TYPES
    for tc in body.test_cases:
        if tc.eval_type not in EVAL_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown eval_type '{tc.eval_type}'. Valid: {sorted(EVAL_TYPES)}",
            )

    suite = PromptEval(
        prompt_id=body.prompt_id,
        name=body.name,
        description=body.description,
        test_cases=[tc.model_dump() for tc in body.test_cases],
        pass_threshold=body.pass_threshold,
        judge_provider=body.judge_provider,
        judge_model=body.judge_model,
        created_by=current_user.id,
    )
    db.add(suite)
    db.commit()
    db.refresh(suite)
    return PromptEvalResponse.from_orm(suite)


@router.get("/evals/{eval_id}", response_model=PromptEvalResponse)
async def get_eval(
    eval_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    suite = db.query(PromptEval).filter(PromptEval.id == eval_id).first()
    if not suite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Eval suite not found")
    return PromptEvalResponse.from_orm(suite)


@router.put("/evals/{eval_id}", response_model=PromptEvalResponse)
async def update_eval(
    eval_id: int,
    body: PromptEvalUpdate,
    current_user: User = Depends(require_roles(ENGINEER_ROLES)),
    db: Session = Depends(get_db),
):
    suite = db.query(PromptEval).filter(PromptEval.id == eval_id).first()
    if not suite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Eval suite not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        if field == "test_cases" and value is not None:
            value = [tc if isinstance(tc, dict) else tc.model_dump() for tc in value]
        setattr(suite, field, value)
    db.commit()
    db.refresh(suite)
    return PromptEvalResponse.from_orm(suite)


# ---------------------------------------------------------------------------
# Triggering eval runs
# ---------------------------------------------------------------------------

@router.post("/evals/{eval_id}/run", response_model=EvalRunResponse, status_code=status.HTTP_202_ACCEPTED)
async def trigger_eval_run(
    eval_id: int,
    body: EvalRunTrigger,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_roles(ENGINEER_ROLES)),
    db: Session = Depends(get_db),
):
    """
    Trigger an eval run for a specific version.

    The run executes asynchronously. Poll ``GET /api/eval-runs/{run_id}``
    for the result, or watch the version's ``eval_status`` field.

    If the suite contains LLM-based checks (output_contains, output_regex,
    llm_judge), supply ``llm_config_id`` pointing to one of your configured
    LLM providers (from GET /api/user-llm-configs).
    """
    suite = db.query(PromptEval).filter(PromptEval.id == eval_id, PromptEval.is_active == True).first()
    if not suite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Eval suite not found or inactive")

    version = db.query(PromptVersion).filter(PromptVersion.id == body.version_id).first()
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")

    if version.prompt_id != suite.prompt_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Version does not belong to the prompt this eval suite is attached to",
        )

    # Resolve encrypted API key if an LLM config was supplied
    encrypted_api_key: Optional[str] = None
    if body.llm_config_id:
        config = db.query(UserLlmConfig).filter(
            UserLlmConfig.id == body.llm_config_id,
            UserLlmConfig.user_id == current_user.id,
            UserLlmConfig.is_active == True,
        ).first()
        if not config:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="LLM config not found")
        encrypted_api_key = str(config.api_key)

    # Mark the version as eval-running immediately
    version.eval_status = "running"
    db.commit()

    # Create the run record in "running" state
    run = EvalRun(
        eval_id=eval_id,
        version_id=body.version_id,
        status="running",
        triggered_by=current_user.id,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    # Execute in background so the HTTP response returns immediately
    background_tasks.add_task(
        execute_eval_run, run, suite, version, db, encrypted_api_key
    )

    return EvalRunResponse.from_orm(run)


@router.get("/eval-runs/{run_id}", response_model=EvalRunResponse)
async def get_eval_run(
    run_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Poll the status and results of an eval run."""
    run = db.query(EvalRun).filter(EvalRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Eval run not found")
    db.refresh(run)
    return EvalRunResponse.from_orm(run)


@router.get("/eval-runs", response_model=List[EvalRunResponse])
async def list_eval_runs(
    eval_id: Optional[int] = None,
    version_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List eval runs, optionally filtered by suite or version."""
    query = db.query(EvalRun)
    if eval_id:
        query = query.filter(EvalRun.eval_id == eval_id)
    if version_id:
        query = query.filter(EvalRun.version_id == version_id)
    return [EvalRunResponse.from_orm(r) for r in query.order_by(EvalRun.started_at.desc()).all()]


# ---------------------------------------------------------------------------
# API Key management (JWT-authenticated)
# ---------------------------------------------------------------------------

@router.get("/api-keys", response_model=List[ApiKeyResponse])
async def list_api_keys(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the calling user's API keys."""
    keys = db.query(ApiKey).filter(ApiKey.user_id == current_user.id).all()
    return [ApiKeyResponse.from_orm(k) for k in keys]


@router.post("/api-keys", response_model=ApiKeyCreated, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    body: ApiKeyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new API key. The plaintext key is shown **once** — store it securely."""
    full_key, prefix, key_hash = generate_api_key()
    expires_at = None
    if body.expires_in_days:
        expires_at = datetime.utcnow() + timedelta(days=body.expires_in_days)

    record = ApiKey(
        name=body.name,
        key_prefix=prefix,
        key_hash=key_hash,
        user_id=current_user.id,
        scopes=body.scopes,
        expires_at=expires_at,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return ApiKeyCreated(
        id=record.id,
        name=record.name,
        key_prefix=record.key_prefix,
        scopes=record.scopes,
        is_active=record.is_active,
        last_used_at=record.last_used_at,
        expires_at=record.expires_at,
        created_at=record.created_at,
        key=full_key,
    )


@router.delete("/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    key_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Revoke (deactivate) an API key."""
    record = db.query(ApiKey).filter(
        ApiKey.id == key_id, ApiKey.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
    record.is_active = False
    db.commit()


# ---------------------------------------------------------------------------
# SDK endpoints — authenticated via X-API-Key header
# ---------------------------------------------------------------------------

def _resolve_prompt(db: Session, slug: str) -> Prompt:
    """Find a prompt by exact name or slug match."""
    prompt = db.query(Prompt).filter(
        func.lower(Prompt.name) == slug.lower()
    ).first()
    if not prompt:
        target = slugify(slug)
        for p in db.query(Prompt).all():
            if slugify(p.name) == target:
                return p
    if not prompt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Prompt '{slug}' not found")
    return prompt


def _latest_approved_version(db: Session, prompt_id: int) -> Optional[PromptVersion]:
    return (
        db.query(PromptVersion)
        .filter(PromptVersion.prompt_id == prompt_id, PromptVersion.status == "approved")
        .order_by(PromptVersion.created_at.desc())
        .first()
    )


def _prompt_to_sdk(prompt: Prompt, version: Optional[PromptVersion], db: Optional[Session] = None) -> PromptSDK:
    raw_content = version.content if version else prompt.content
    # Compose fragments if any are declared and we have a db session
    if db and (prompt.fragment_slugs or "{{fragment:" in raw_content):
        composed, _, _ = compose(raw_content, db)
    else:
        composed = raw_content
    return PromptSDK(
        id=prompt.id,
        name=prompt.name,
        slug=slugify(prompt.name),
        description=prompt.description,
        content=composed,
        version=version.version if version else None,
        version_id=version.id if version else None,
        category=prompt.category,
        environment=prompt.environment,
        variables=prompt.variables or [],
        tags=prompt.tags or [],
        fragment_slugs=prompt.fragment_slugs or [],
        eval_status=version.eval_status if version else "none",
        eval_score=version.eval_score if version else None,
        updated_at=prompt.updated_at,
    )


def _render_template(content: str, variables: dict) -> tuple[str, list, list]:
    """Substitute {{variable}} placeholders; return (rendered, used, missing)."""
    declared = set(re.findall(r"\{\{(\w+)\}\}", content))
    used, missing = [], []
    rendered = content
    for key in declared:
        if key in variables:
            rendered = rendered.replace("{{" + key + "}}", variables[key])
            used.append(key)
        else:
            missing.append(key)
    return rendered, used, missing


@router.get("/sdk/v1/prompts", response_model=List[PromptSDK])
async def sdk_list_prompts(
    environment: Optional[str] = None,
    category: Optional[str] = None,
    current_user: User = Depends(get_current_user_from_api_key),
    db: Session = Depends(get_db),
):
    """List all approved prompts visible to the API key owner."""
    query = db.query(Prompt).filter(Prompt.status == "approved")
    if environment:
        query = query.filter(Prompt.environment == environment)
    if category:
        query = query.filter(Prompt.category == category)

    result = []
    for p in query.all():
        v = _latest_approved_version(db, p.id)
        result.append(_prompt_to_sdk(p, v, db))
    return result


@router.get("/sdk/v1/prompts/{slug}", response_model=PromptSDK)
async def sdk_get_prompt(
    slug: str,
    version: Optional[str] = None,
    environment: Optional[str] = None,
    current_user: User = Depends(get_current_user_from_api_key),
    db: Session = Depends(get_db),
):
    """
    Fetch a prompt by name or slug.

    - Omit `version` to get the latest approved version.
    - Pass `version=x.y.z` for a specific version.
    - Pass `environment` to filter by deployment environment.
    """
    prompt = _resolve_prompt(db, slug)
    if environment and prompt.environment != environment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Prompt '{slug}' not found in environment '{environment}'",
        )

    if version:
        ver = (
            db.query(PromptVersion)
            .filter(PromptVersion.prompt_id == prompt.id, PromptVersion.version == version)
            .first()
        )
        if not ver:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Version '{version}' of prompt '{slug}' not found",
            )
    else:
        ver = _latest_approved_version(db, prompt.id)

    return _prompt_to_sdk(prompt, ver, db)


@router.get("/sdk/v1/prompts/{slug}/versions", response_model=List[PromptVersionSchema])
async def sdk_list_versions(
    slug: str,
    current_user: User = Depends(get_current_user_from_api_key),
    db: Session = Depends(get_db),
):
    """List all versions of a prompt."""
    prompt = _resolve_prompt(db, slug)
    versions = (
        db.query(PromptVersion)
        .filter(PromptVersion.prompt_id == prompt.id)
        .order_by(PromptVersion.created_at.desc())
        .all()
    )
    return [PromptVersionSchema.from_orm(v) for v in versions]


@router.post("/sdk/v1/prompts/{slug}/render", response_model=PromptRenderResponse)
async def sdk_render_prompt(
    slug: str,
    body: PromptRenderRequest,
    current_user: User = Depends(get_current_user_from_api_key),
    db: Session = Depends(get_db),
):
    """
    Fetch a prompt and render it with the provided variables.

    Returns the fully-substituted prompt text along with lists of which
    variables were filled and which are still missing.
    """
    prompt = _resolve_prompt(db, slug)

    if body.environment and prompt.environment != body.environment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Prompt '{slug}' not found in environment '{body.environment}'",
        )

    if body.version:
        ver = (
            db.query(PromptVersion)
            .filter(PromptVersion.prompt_id == prompt.id, PromptVersion.version == body.version)
            .first()
        )
        if not ver:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Version '{body.version}' not found",
            )
    else:
        ver = _latest_approved_version(db, prompt.id)

    content = ver.content if ver else prompt.content
    # Apply fragment composition before variable substitution
    composed, _, _ = compose(content, db)
    rendered, used, missing = _render_template(composed, body.variables)

    return PromptRenderResponse(
        slug=slugify(prompt.name),
        version=ver.version if ver else None,
        rendered=rendered,
        variables_used=used,
        variables_missing=missing,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# PROMPT FRAGMENTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/fragments", response_model=List[PromptFragmentResponse])
async def list_fragments(
    category: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List reusable prompt fragments."""
    q = db.query(PromptFragment).filter(PromptFragment.is_active == True)
    if category:
        q = q.filter(PromptFragment.category == category)
    return [PromptFragmentResponse.from_orm(f) for f in q.all()]


@router.post("/fragments", response_model=PromptFragmentResponse, status_code=status.HTTP_201_CREATED)
async def create_fragment(
    body: PromptFragmentCreate,
    current_user: User = Depends(require_roles(ENGINEER_ROLES)),
    db: Session = Depends(get_db),
):
    """Create a new reusable prompt fragment."""
    if db.query(PromptFragment).filter(PromptFragment.slug == body.slug).first():
        raise HTTPException(status_code=400, detail=f"Fragment slug '{body.slug}' already exists")
    frag = PromptFragment(**body.model_dump(), created_by=current_user.id)
    db.add(frag)
    db.commit()
    db.refresh(frag)
    return PromptFragmentResponse.from_orm(frag)


@router.get("/fragments/{fragment_id}", response_model=PromptFragmentResponse)
async def get_fragment(
    fragment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    frag = db.query(PromptFragment).filter(PromptFragment.id == fragment_id).first()
    if not frag:
        raise HTTPException(status_code=404, detail="Fragment not found")
    return PromptFragmentResponse.from_orm(frag)


@router.put("/fragments/{fragment_id}", response_model=PromptFragmentResponse)
async def update_fragment(
    fragment_id: int,
    body: PromptFragmentUpdate,
    current_user: User = Depends(require_roles(LEAD_ROLES)),
    db: Session = Depends(get_db),
):
    """Update a fragment. Changes propagate to all prompts that include it at next serve."""
    frag = db.query(PromptFragment).filter(PromptFragment.id == fragment_id).first()
    if not frag:
        raise HTTPException(status_code=404, detail="Fragment not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(frag, field, value)
    db.commit()
    db.refresh(frag)
    return PromptFragmentResponse.from_orm(frag)


# ═══════════════════════════════════════════════════════════════════════════════
# A/B EXPERIMENTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/experiments", response_model=ExperimentResponse, status_code=status.HTTP_201_CREATED)
async def create_experiment(
    body: ExperimentCreate,
    current_user: User = Depends(require_roles(LEAD_ROLES)),
    db: Session = Depends(get_db),
):
    """Create an A/B experiment to split traffic between two prompt versions."""
    exp = PromptExperiment(**body.model_dump(), created_by=current_user.id)
    db.add(exp)
    db.commit()
    db.refresh(exp)
    return ExperimentResponse.from_orm(exp)


@router.get("/experiments", response_model=List[ExperimentResponse])
async def list_experiments(
    prompt_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(PromptExperiment)
    if prompt_id:
        q = q.filter(PromptExperiment.prompt_id == prompt_id)
    if status_filter:
        q = q.filter(PromptExperiment.status == status_filter)
    return [ExperimentResponse.from_orm(e) for e in q.all()]


@router.put("/experiments/{exp_id}", response_model=ExperimentResponse)
async def update_experiment(
    exp_id: int,
    body: ExperimentUpdate,
    current_user: User = Depends(require_roles(LEAD_ROLES)),
    db: Session = Depends(get_db),
):
    exp = db.query(PromptExperiment).filter(PromptExperiment.id == exp_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(exp, field, value)
    if body.status == "completed":
        exp.ended_at = datetime.utcnow()
    db.commit()
    db.refresh(exp)
    return ExperimentResponse.from_orm(exp)


@router.get("/sdk/v1/experiment/{slug}", response_model=PromptSDK)
async def sdk_get_experiment_version(
    slug: str,
    session_id: str = "",
    environment: Optional[str] = None,
    current_user: User = Depends(get_current_user_from_api_key),
    db: Session = Depends(get_db),
):
    """
    Return the appropriate prompt version for an A/B experiment.

    The assignment is deterministic — the same session_id always receives
    the same variant, ensuring a consistent experience within a session.
    """
    import hashlib
    prompt = _resolve_prompt(db, slug)
    exp = (
        db.query(PromptExperiment)
        .filter(
            PromptExperiment.prompt_id == prompt.id,
            PromptExperiment.status == "running",
        )
        .first()
    )
    if not exp:
        # No active experiment — serve the standard latest approved version
        ver = _latest_approved_version(db, prompt.id)
        return _prompt_to_sdk(prompt, ver, db)

    # Deterministic split: hash(session_id) % 100 < traffic_split → variant
    hash_val = int(hashlib.sha256(session_id.encode()).hexdigest(), 16) % 100
    version_id = exp.variant_version_id if hash_val < exp.traffic_split else exp.control_version_id
    ver = db.query(PromptVersion).filter(PromptVersion.id == version_id).first()
    return _prompt_to_sdk(prompt, ver, db)


# ═══════════════════════════════════════════════════════════════════════════════
# PRODUCTION LOGGING
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/sdk/v1/log", status_code=status.HTTP_202_ACCEPTED)
async def sdk_log_output(
    body: ProductionLogCreate,
    current_user: User = Depends(get_current_user_from_api_key),
    db: Session = Depends(get_db),
):
    """
    Ingest a production output log from the SDK.
    Called automatically by `client.log_output()` — fire-and-forget.
    """
    log = ProductionLog(**body.model_dump())
    db.add(log)
    db.commit()
    return {"status": "accepted"}


@router.get("/production-logs", response_model=List[ProductionLogResponse])
async def list_production_logs(
    prompt_id: Optional[int] = None,
    version_id: Optional[int] = None,
    feedback: Optional[str] = None,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Query production logs for a prompt or version."""
    q = db.query(ProductionLog)
    if prompt_id:
        q = q.filter(ProductionLog.prompt_id == prompt_id)
    if version_id:
        q = q.filter(ProductionLog.version_id == version_id)
    if feedback:
        q = q.filter(ProductionLog.feedback == feedback)
    logs = q.order_by(ProductionLog.logged_at.desc()).limit(limit).all()
    return [ProductionLogResponse.from_orm(l) for l in logs]


@router.get("/production-logs/stats", response_model=ProductionStats)
async def production_stats(
    prompt_id: int,
    period_hours: int = 24,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aggregate production metrics for a prompt over a time window."""
    from datetime import timedelta
    since = datetime.utcnow() - timedelta(hours=period_hours)
    logs = (
        db.query(ProductionLog)
        .filter(ProductionLog.prompt_id == prompt_id, ProductionLog.logged_at >= since)
        .all()
    )
    pos = sum(1 for l in logs if l.feedback == "positive")
    neg = sum(1 for l in logs if l.feedback == "negative")
    latencies = [l.latency_ms for l in logs if l.latency_ms]
    tokens = [l.token_count for l in logs if l.token_count]
    return ProductionStats(
        prompt_id=prompt_id,
        total_calls=len(logs),
        positive_feedback=pos,
        negative_feedback=neg,
        avg_latency_ms=sum(latencies) / len(latencies) if latencies else None,
        avg_token_count=sum(tokens) / len(tokens) if tokens else None,
        period_hours=period_hours,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# DRIFT ALERTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/drift-alerts", response_model=List[DriftAlertResponse])
async def list_drift_alerts(
    prompt_id: Optional[int] = None,
    alert_status: Optional[str] = None,
    severity: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(DriftAlert)
    if prompt_id:
        q = q.filter(DriftAlert.prompt_id == prompt_id)
    if alert_status:
        q = q.filter(DriftAlert.status == alert_status)
    if severity:
        q = q.filter(DriftAlert.severity == severity)
    return [DriftAlertResponse.from_orm(a) for a in q.order_by(DriftAlert.detected_at.desc()).all()]


@router.put("/drift-alerts/{alert_id}", response_model=DriftAlertResponse)
async def update_drift_alert(
    alert_id: int,
    body: DriftAlertUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    alert = db.query(DriftAlert).filter(DriftAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = body.status
    if body.status == "resolved":
        alert.resolved_at = datetime.utcnow()
    db.commit()
    db.refresh(alert)
    return DriftAlertResponse.from_orm(alert)


@router.post("/drift-alerts/scan")
async def trigger_drift_scan(
    prompt_id: Optional[int] = None,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    current_user: User = Depends(require_roles(LEAD_ROLES)),
    db: Session = Depends(get_db),
):
    """Manually trigger a drift scan. Runs in background."""
    if prompt_id:
        background_tasks.add_task(analyze_prompt, db, prompt_id)
        return {"status": "scanning", "prompt_id": prompt_id}
    background_tasks.add_task(run_full_scan, db)
    return {"status": "full_scan_started"}


# ═══════════════════════════════════════════════════════════════════════════════
# MODEL CERTIFICATION MATRIX
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/certifications/run", response_model=CertificationResponse, status_code=status.HTTP_202_ACCEPTED)
async def run_certification(
    body: CertificationRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_roles(ENGINEER_ROLES)),
    db: Session = Depends(get_db),
):
    """Certify a prompt version against a specific LLM model."""
    config = db.query(UserLlmConfig).filter(
        UserLlmConfig.id == body.llm_config_id,
        UserLlmConfig.user_id == current_user.id,
        UserLlmConfig.is_active == True,
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="LLM config not found")

    version = db.query(PromptVersion).filter(PromptVersion.id == body.version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    encrypted_key = str(config.api_key)

    async def _run():
        await certify_version(
            body.version_id, body.model_provider, body.model_id,
            db, encrypted_key, current_user.id,
        )

    background_tasks.add_task(_run)

    # Return a placeholder — poll /certifications?version_id=X for results
    return CertificationResponse(
        id=0,
        prompt_id=version.prompt_id,
        version_id=body.version_id,
        model_provider=body.model_provider,
        model_id=body.model_id,
        status="running",
        certified_at=datetime.utcnow(),
    )


@router.get("/certifications")
async def get_certifications(
    prompt_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the certification matrix for a prompt (all versions × all models)."""
    return get_matrix(prompt_id, db)


# ═══════════════════════════════════════════════════════════════════════════════
# AGENT TASKS — review and act on autonomous agent proposals
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/agent-tasks", response_model=List[AgentTaskResponse])
async def list_agent_tasks(
    task_type: Optional[str] = None,
    task_status: Optional[str] = None,
    prompt_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(AgentTask)
    if task_type:
        q = q.filter(AgentTask.task_type == task_type)
    if task_status:
        q = q.filter(AgentTask.status == task_status)
    if prompt_id:
        q = q.filter(AgentTask.prompt_id == prompt_id)
    return [AgentTaskResponse.from_orm(t) for t in q.order_by(AgentTask.created_at.desc()).all()]


@router.get("/agent-tasks/{task_id}", response_model=AgentTaskResponse)
async def get_agent_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = db.query(AgentTask).filter(AgentTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return AgentTaskResponse.from_orm(task)


@router.post("/agent-tasks/{task_id}/review", response_model=AgentTaskResponse)
async def review_agent_task(
    task_id: int,
    body: AgentTaskReview,
    current_user: User = Depends(require_roles(LEAD_ROLES)),
    db: Session = Depends(get_db),
):
    """
    Approve or reject an agent task.

    **Approving a `propose_fix` task** automatically creates a new PromptVersion
    with the agent's proposed content and a changelog, ready for the normal
    approval workflow.

    **Approving a `generate_evals` task** adds the generated test cases to the
    prompt's existing eval suite (or creates a new one).
    """
    task = db.query(AgentTask).filter(AgentTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status != "awaiting_review":
        raise HTTPException(status_code=400, detail=f"Task is not awaiting review (status: {task.status})")

    task.reviewed_by  = current_user.id
    task.review_notes = body.notes
    task.status       = "approved" if body.approved else "rejected"
    task.updated_at   = datetime.utcnow()

    if body.approved:
        output = task.output_data or {}

        if task.task_type == "propose_fix" and task.version_id:
            # Create a new prompt version from the agent's proposed content
            src = db.query(PromptVersion).filter(PromptVersion.id == task.version_id).first()
            if src and output.get("proposed_content"):
                new_ver = PromptVersion(
                    prompt_id=src.prompt_id,
                    version=_bump_patch(src.version),
                    content=output["proposed_content"],
                    changelog=f"[Agent] {output.get('changelog', 'Automated improvement')}",
                    author_id=current_user.id,
                    status="draft",
                )
                db.add(new_ver)
                task.status = "completed"

        elif task.task_type == "generate_evals" and task.prompt_id:
            # Add generated test cases to the existing eval suite or create one
            suite = (
                db.query(PromptEval)
                .filter(PromptEval.prompt_id == task.prompt_id, PromptEval.is_active == True)
                .first()
            )
            new_cases = output.get("test_cases", [])
            if suite and new_cases:
                suite.test_cases = (suite.test_cases or []) + new_cases
            elif new_cases:
                suite = PromptEval(
                    prompt_id=task.prompt_id,
                    name="Agent-generated eval suite",
                    test_cases=new_cases,
                    pass_threshold=80,
                    created_by=current_user.id,
                )
                db.add(suite)
            task.status = "completed"

        elif task.task_type == "optimize_variant" and task.version_id:
            src = db.query(PromptVersion).filter(PromptVersion.id == task.version_id).first()
            if src and output.get("variant_content"):
                new_ver = PromptVersion(
                    prompt_id=src.prompt_id,
                    version=_bump_patch(src.version),
                    content=output["variant_content"],
                    changelog=f"[Agent] Token-optimised variant. {output.get('changes_summary', '')}",
                    author_id=current_user.id,
                    status="draft",
                )
                db.add(new_ver)
                task.status = "completed"

    db.commit()
    db.refresh(task)
    return AgentTaskResponse.from_orm(task)


def _bump_patch(version_str: str) -> str:
    """Increment the patch segment of a semantic version string."""
    try:
        parts = version_str.split(".")
        parts[-1] = str(int(parts[-1]) + 1)
        return ".".join(parts)
    except Exception:
        return version_str + ".1"


# ═══════════════════════════════════════════════════════════════════════════════
# AGENT TRIGGERS — kick off autonomous agent tasks
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/agents/generate-evals", response_model=AgentTaskResponse, status_code=status.HTTP_202_ACCEPTED)
async def agent_generate_evals(
    body: AgentTriggerRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_roles(ENGINEER_ROLES)),
    db: Session = Depends(get_db),
):
    """Ask the Intelligence Agent to auto-generate test cases for a prompt."""
    _require_llm_config(body.llm_config_id, current_user.id, db)
    task = AgentTask(
        task_type="generate_evals",
        prompt_id=body.prompt_id,
        version_id=body.version_id,
        triggered_by="manual",
        input_data={"llm_config_id": body.llm_config_id},
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    config = db.query(UserLlmConfig).filter(UserLlmConfig.id == body.llm_config_id).first()
    background_tasks.add_task(run_agent_task, task, db, str(config.api_key))
    return AgentTaskResponse.from_orm(task)


@router.post("/agents/optimize", response_model=AgentTaskResponse, status_code=status.HTTP_202_ACCEPTED)
async def agent_optimize(
    body: OptimizeRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_roles(ENGINEER_ROLES)),
    db: Session = Depends(get_db),
):
    """Ask the Optimisation Agent to produce a token-efficient variant."""
    config = _require_llm_config(body.llm_config_id, current_user.id, db)
    version = db.query(PromptVersion).filter(PromptVersion.id == body.version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    task = AgentTask(
        task_type="optimize_variant",
        prompt_id=version.prompt_id,
        version_id=body.version_id,
        triggered_by="manual",
        input_data={"target_token_reduction": body.target_token_reduction, "llm_config_id": body.llm_config_id},
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    background_tasks.add_task(run_agent_task, task, db, str(config.api_key))
    return AgentTaskResponse.from_orm(task)


@router.post("/agents/analyze-drift/{alert_id}", response_model=AgentTaskResponse, status_code=status.HTTP_202_ACCEPTED)
async def agent_analyze_drift(
    alert_id: int,
    body: AgentTriggerRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_roles(LEAD_ROLES)),
    db: Session = Depends(get_db),
):
    """Ask the Intelligence Agent to diagnose a drift alert and propose a fix."""
    alert = db.query(DriftAlert).filter(DriftAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Drift alert not found")
    config = _require_llm_config(body.llm_config_id, current_user.id, db)

    # Pull a sample of recent flagged production logs for context
    from datetime import timedelta
    samples = (
        db.query(ProductionLog)
        .filter(
            ProductionLog.prompt_id == alert.prompt_id,
            ProductionLog.version_id == alert.version_id,
        )
        .order_by(ProductionLog.logged_at.desc())
        .limit(5)
        .all()
    )

    task = AgentTask(
        task_type="propose_fix",
        prompt_id=alert.prompt_id,
        version_id=alert.version_id,
        triggered_by="drift_alert",
        trigger_ref_id=alert_id,
        input_data={
            "alert_id": alert_id,
            "alert_type": alert.alert_type,
            "description": alert.description,
            "evidence": alert.evidence,
            "production_samples": [l.llm_output for l in samples if l.llm_output],
            "llm_config_id": body.llm_config_id,
        },
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    alert.remediation_task_id = task.id
    alert.status = "acknowledged"
    db.commit()

    background_tasks.add_task(run_agent_task, task, db, str(config.api_key))
    return AgentTaskResponse.from_orm(task)


def _require_llm_config(config_id: Optional[int], user_id: int, db: Session) -> UserLlmConfig:
    if not config_id:
        raise HTTPException(status_code=400, detail="llm_config_id is required for agent tasks")
    config = db.query(UserLlmConfig).filter(
        UserLlmConfig.id == config_id,
        UserLlmConfig.user_id == user_id,
        UserLlmConfig.is_active == True,
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="LLM config not found")
    return config