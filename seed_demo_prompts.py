"""
Seed Demo Prompts to PromptOps Database.
"""
import os
import sys
from datetime import datetime
from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from database import SessionLocal, Prompt, PromptVersion, Approval, Favorite, PromptComparison

DEMO_PROMPTS = [
    {
        "name": "Customer Support Agent",
        "slug": "customer-support-agent",
        "description": "A friendly customer support agent that helps resolve customer issues.",
        "content": """You are a friendly customer support agent for {{company_name}}.

Guidelines:
- Greet the customer warmly and acknowledge their issue
- Show empathy and understanding
- Provide clear, step-by-step solutions
- Use the customer's name ({{customer_name}}) when appropriate

Context: Department: {{department}}, Priority: {{priority}}

Remember: Every interaction is an opportunity to create a positive experience.""",
        "category": "customer_support",
        "variables": [
            {"name": "company_name", "required": True, "default": "TechCorp"},
            {"name": "customer_name", "required": False, "default": "Valued Customer"},
            {"name": "department", "required": False, "default": "General Support"},
            {"name": "priority", "required": False, "default": "Normal"},
        ],
        "tags": ["support", "customer-facing", "chat"],
    },
    {
        "name": "Code Review Assistant",
        "slug": "code-review-assistant",
        "description": "Expert code reviewer providing constructive feedback.",
        "content": """You are an expert code reviewer with deep knowledge in {{programming_language}}.

Review Criteria:
1. Code Quality: Readability, naming, organization
2. Best Practices: Design patterns, SOLID, DRY
3. Security: Vulnerabilities, input validation
4. Performance: Complexity, optimization
5. Testing: Coverage, edge cases

Context: Project: {{project_type}}, Team Level: {{experience_level}}

Be constructive, explain the "why", and provide code examples.""",
        "category": "code_generation",
        "variables": [
            {"name": "programming_language", "required": True, "default": "Python"},
            {"name": "project_type", "required": False, "default": "Web Application"},
            {"name": "experience_level", "required": False, "default": "Intermediate"},
        ],
        "tags": ["development", "code-review", "engineering"],
    },

    {
        "name": "Technical Writer",
        "slug": "technical-writer",
        "description": "Documentation specialist for software projects.",
        "content": """You are a technical writer specializing in {{documentation_type}} documentation.

Principles:
- Clarity: Use simple language, avoid jargon
- Structure: Organize logically with clear headings
- Examples: Include practical code snippets
- Accessibility: Consider different skill levels

Target: {{target_audience}}, Style: {{doc_style}}

Use markdown, include TOC for longer docs, add callouts (Note, Warning, Tip).""",
        "category": "documentation",
        "variables": [
            {"name": "documentation_type", "required": True, "default": "API"},
            {"name": "target_audience", "required": False, "default": "Developers"},
            {"name": "doc_style", "required": False, "default": "Technical Reference"},
        ],
        "tags": ["documentation", "writing", "technical"],
    },
    {
        "name": "Data Analyst",
        "slug": "data-analyst",
        "description": "Data analysis expert providing actionable insights.",
        "content": """You are an expert data analyst specializing in {{analysis_domain}}.

Framework:
1. Data Understanding: Clarify structure and quality
2. Exploratory Analysis: Identify trends and outliers
3. Statistical Insights: Apply appropriate methods
4. Visualization: Recommend charts and graphs
5. Recommendations: Translate to business actions

Context: Domain: {{business_domain}}, Source: {{data_source}}, Goal: {{analysis_goal}}

Start with executive summary, present findings by importance, end with recommendations.""",
        "category": "data_analysis",
        "variables": [
            {"name": "analysis_domain", "required": True, "default": "Business Intelligence"},
            {"name": "business_domain", "required": False, "default": "E-commerce"},
            {"name": "data_source", "required": False, "default": "Internal Database"},
            {"name": "analysis_goal", "required": False, "default": "Identify Growth Opportunities"},
        ],
        "tags": ["analytics", "data", "insights", "business"],
    },
]


def delete_all_prompts(db):
    print("Deleting existing data...")
    db.query(Approval).delete()
    db.query(Favorite).delete()
    db.query(PromptComparison).delete()
    # First, clear the foreign key reference
    db.execute(text("UPDATE prompts SET current_version_id = NULL"))
    db.commit()
    # Now delete in proper order
    db.query(PromptVersion).delete()
    db.query(Prompt).delete()
    db.commit()
    print("  ✓ All existing prompts deleted")


def create_demo_prompts(db, as_draft=False):
    print("\nCreating demo prompts...")
    created = []
    
    status = "draft" if as_draft else "approved"
    version_status = "draft" if as_draft else "approved"
    
    for p in DEMO_PROMPTS:
        prompt = Prompt(
            name=p["name"], description=p["description"], content=p["content"],
            category=p["category"], status=status, environment="production",
            access_level="organization", author_id=1, variables=p["variables"],
            usage_count=0, rating=5,
        )
        db.add(prompt)
        db.flush()
        
        version = PromptVersion(
            prompt_id=prompt.id, version="1.0.0", content=p["content"],
            changelog="Initial version", author_id=1, status=version_status,
            eval_status="none" if as_draft else "passed", 
            eval_score=None if as_draft else 100,
        )
        db.add(version)
        db.flush()
        
        prompt.current_version_id = version.id
        created.append((prompt, version, p["slug"]))
        print(f"  ✓ {p['slug']} (ID: {prompt.id}) - {status}")
    
    db.commit()
    return created


def sync_to_firestore(prompts):
    print("\nSyncing to Firestore...")
    try:
        from firestore_service import _get_firestore_client, _get_collection_name
        from datetime import datetime, timezone
        
        client = _get_firestore_client()
        if not client:
            print("  ✗ Firestore not configured")
            return
        
        collection = _get_collection_name()
        
        for prompt, version, slug in prompts:
            # Find the original config to get tags
            config = next((p for p in DEMO_PROMPTS if p["slug"] == slug), {})
            
            doc_data = {
                "id": prompt.id,
                "slug": slug,
                "name": prompt.name,
                "description": prompt.description or "",
                "content": version.content,
                "version": version.version,
                "version_id": version.id,
                "category": prompt.category,
                "environment": prompt.environment,
                "access_level": prompt.access_level,
                "variables": prompt.variables or [],
                "tags": config.get("tags", []),
                "fragment_slugs": [],
                "eval_status": version.eval_status,
                "eval_score": version.eval_score,
                "author_id": prompt.author_id,
                "approved_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
                "synced_at": datetime.now(timezone.utc),
            }
            
            client.collection(collection).document(slug).set(doc_data)
            print(f"  ✓ {slug} synced")
            
    except Exception as e:
        print(f"  ✗ Firestore error: {e}")
        import traceback
        traceback.print_exc()


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Seed demo prompts")
    parser.add_argument("--draft", action="store_true", help="Create as draft (for testing approval workflow)")
    parser.add_argument("--approved", action="store_true", help="Create as approved (default)")
    parser.add_argument("--no-firestore", action="store_true", help="Skip Firestore sync")
    args = parser.parse_args()
    
    as_draft = args.draft
    
    print("=" * 50)
    print("PromptOps Demo Prompts Seeder")
    print(f"Mode: {'DRAFT' if as_draft else 'APPROVED'}")
    print("=" * 50)
    
    db = SessionLocal()
    try:
        delete_all_prompts(db)
        created = create_demo_prompts(db, as_draft=as_draft)
        
        if not as_draft and not args.no_firestore:
            sync_to_firestore(created)
        elif as_draft:
            print("\nSkipping Firestore sync (prompts are drafts)")
            print("Submit for approval in UI, then they will sync to Firestore")
        
        print("\n" + "=" * 50)
        print(f"SUCCESS! Created {len(created)} prompts as {'DRAFT' if as_draft else 'APPROVED'}")
        print("=" * 50)
    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    main()
