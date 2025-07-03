from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import timedelta

from database import get_db, User, Prompt, PromptVersion, LlmProvider, UserLlmConfig, Favorite, PromptComparison, Approval
from schemas import (
    UserLogin, UserLoginResponse, User as UserSchema, UserCreate, UserUpdate,
    Prompt as PromptSchema, PromptCreate, PromptUpdate,
    PromptVersion as PromptVersionSchema, PromptVersionCreate, PromptVersionUpdate,
    LlmProvider as LlmProviderSchema, LlmProviderCreate, LlmProviderUpdate,
    UserLlmConfig as UserLlmConfigSchema, UserLlmConfigCreate, UserLlmConfigUpdate,
    Favorite as FavoriteSchema, FavoriteCreate,
    PromptComparison as PromptComparisonSchema, PromptComparisonCreate, PromptComparisonUpdate,
    Approval as ApprovalSchema, ApprovalCreate, ApprovalUpdate
)
from auth import (
    authenticate_user, create_access_token, get_current_user, require_roles,
    ADMIN_ROLES, ENGINEER_ROLES, LEAD_ROLES, get_password_hash
)
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
    """Create a new prompt."""
    prompt = Prompt(
        **prompt_data.dict(),
        author_id=current_user.id
    )
    
    db.add(prompt)
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
@router.get("/approvals", response_model=List[ApprovalSchema])
async def get_approvals(
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get approvals (filtered by role)."""
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
    
    approvals = query.all()
    return [ApprovalSchema.from_orm(approval) for approval in approvals]


@router.post("/approvals", response_model=ApprovalSchema)
async def create_approval(
    approval_data: ApprovalCreate,
    current_user: User = Depends(require_roles(ENGINEER_ROLES)),
    db: Session = Depends(get_db)
):
    """Create a new approval request."""
    approval = Approval(**approval_data.dict())
    
    db.add(approval)
    db.commit()
    db.refresh(approval)
    
    return ApprovalSchema.from_orm(approval)