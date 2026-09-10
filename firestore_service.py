"""
Firestore service for syncing approved prompts to GCP Firebase Firestore.

Configuration via environment variables:
    FIRESTORE_PROJECT_ID    — GCP project ID
    FIRESTORE_COLLECTION    — Firestore collection name (default: "prompts")
    GOOGLE_APPLICATION_CREDENTIALS — Path to service account JSON (optional if running on GCP)
"""

from __future__ import annotations

import os
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

logger = logging.getLogger(__name__)

_firestore_client = None
_initialized = False


def _get_firestore_client():
    """Get or initialize the Firestore client."""
    global _firestore_client, _initialized
    
    if _initialized:
        return _firestore_client
    
    project_id = os.environ.get("FIRESTORE_PROJECT_ID")
    if not project_id:
        logger.warning("FIRESTORE_PROJECT_ID not set. Firestore sync disabled.")
        _initialized = True
        return None
    
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
        
        try:
            firebase_admin.get_app()
        except ValueError:
            cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
            if cred_path and os.path.exists(cred_path):
                cred = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred, {"projectId": project_id})
            else:
                firebase_admin.initialize_app(options={"projectId": project_id})
        
        _firestore_client = firestore.client()
        _initialized = True
        logger.info(f"Firestore client initialized for project: {project_id}")
        return _firestore_client
        
    except ImportError:
        logger.warning("firebase-admin not installed. Run: pip install firebase-admin")
        _initialized = True
        return None
    except Exception as e:
        logger.error(f"Failed to initialize Firestore client: {e}")
        _initialized = True
        return None


def _get_collection_name() -> str:
    return os.environ.get("FIRESTORE_COLLECTION", "prompts")


def _prompt_to_firestore_doc(prompt, version, slug: str) -> Dict[str, Any]:
    """Convert a PromptOps Prompt and PromptVersion to a Firestore document."""
    now = datetime.now(timezone.utc)
    return {
        "id": prompt.id,
        "slug": slug,
        "name": prompt.name,
        "description": prompt.description or "",
        "content": version.content if version else prompt.content,
        "version": version.version if version else "1.0.0",
        "version_id": version.id if version else None,
        "category": prompt.category,
        "environment": prompt.environment,
        "access_level": prompt.access_level,
        "variables": prompt.variables or [],
        "tags": prompt.tags or [],
        "fragment_slugs": prompt.fragment_slugs or [],
        "eval_status": version.eval_status if version else "none",
        "eval_score": version.eval_score if version else None,
        "author_id": prompt.author_id,
        "approved_at": now,
        "updated_at": now,
        "synced_at": now,
    }


def sync_prompt_to_firestore(prompt, version, slug: str) -> bool:
    """Sync an approved prompt to Firestore."""
    client = _get_firestore_client()
    if not client:
        return False
    
    try:
        collection = _get_collection_name()
        doc_ref = client.collection(collection).document(slug)
        doc_data = _prompt_to_firestore_doc(prompt, version, slug)
        doc_ref.set(doc_data, merge=True)
        logger.info(f"Synced prompt '{slug}' (v{doc_data['version']}) to Firestore")
        return True
    except Exception as e:
        logger.error(f"Failed to sync prompt '{slug}' to Firestore: {e}")
        return False


def update_prompt_in_firestore(slug: str, updates: Dict[str, Any]) -> bool:
    """Update specific fields of a prompt in Firestore."""
    client = _get_firestore_client()
    if not client:
        return False
    
    try:
        collection = _get_collection_name()
        doc_ref = client.collection(collection).document(slug)
        updates["updated_at"] = datetime.now(timezone.utc)
        updates["synced_at"] = datetime.now(timezone.utc)
        doc_ref.update(updates)
        logger.info(f"Updated prompt '{slug}' in Firestore")
        return True
    except Exception as e:
        logger.error(f"Failed to update prompt '{slug}' in Firestore: {e}")
        return False


def delete_prompt_from_firestore(slug: str) -> bool:
    """Delete a prompt from Firestore."""
    client = _get_firestore_client()
    if not client:
        return False
    
    try:
        collection = _get_collection_name()
        doc_ref = client.collection(collection).document(slug)
        doc_ref.delete()
        logger.info(f"Deleted prompt '{slug}' from Firestore")
        return True
    except Exception as e:
        logger.error(f"Failed to delete prompt '{slug}' from Firestore: {e}")
        return False


def get_prompt_from_firestore(slug: str) -> Optional[Dict[str, Any]]:
    """Retrieve a prompt from Firestore."""
    client = _get_firestore_client()
    if not client:
        return None
    
    try:
        collection = _get_collection_name()
        doc_ref = client.collection(collection).document(slug)
        doc = doc_ref.get()
        return doc.to_dict() if doc.exists else None
    except Exception as e:
        logger.error(f"Failed to get prompt '{slug}' from Firestore: {e}")
        return None


def list_prompts_from_firestore(
    environment: Optional[str] = None,
    category: Optional[str] = None,
    tags: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """List prompts from Firestore with optional filters."""
    client = _get_firestore_client()
    if not client:
        return []
    
    try:
        collection = _get_collection_name()
        query = client.collection(collection)
        
        if environment:
            query = query.where("environment", "==", environment)
        if category:
            query = query.where("category", "==", category)
        if tags:
            for tag in tags:
                query = query.where("tags", "array_contains", tag)
        
        docs = query.stream()
        return [doc.to_dict() for doc in docs]
    except Exception as e:
        logger.error(f"Failed to list prompts from Firestore: {e}")
        return []


def sync_all_approved_prompts(db_session) -> Dict[str, int]:
    """Sync all approved prompts from the database to Firestore."""
    from database import Prompt, PromptVersion, slugify
    
    client = _get_firestore_client()
    if not client:
        return {"synced": 0, "failed": 0, "skipped": True}
    
    synced = 0
    failed = 0
    
    try:
        approved_prompts = db_session.query(Prompt).filter(Prompt.status == "approved").all()
        
        for prompt in approved_prompts:
            version = None
            if prompt.current_version_id:
                version = db_session.query(PromptVersion).filter(
                    PromptVersion.id == prompt.current_version_id
                ).first()
            
            slug = slugify(prompt.name)
            if sync_prompt_to_firestore(prompt, version, slug):
                synced += 1
            else:
                failed += 1
        
        logger.info(f"Bulk sync complete: {synced} synced, {failed} failed")
        return {"synced": synced, "failed": failed, "skipped": False}
    except Exception as e:
        logger.error(f"Bulk sync failed: {e}")
        return {"synced": synced, "failed": failed, "error": str(e)}
