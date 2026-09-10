# PromptOps Firestore Integration

This document describes the Firebase Firestore integration for PromptOps, enabling real-time prompt synchronization with ADK agents deployed on Cloud Run.

## Architecture Overview

```
┌─────────────────┐     Approval     ┌─────────────────┐
│   PromptOps     │ ──────────────▶  │  GCP Firestore  │
│   (Backend)     │    Auto-Sync     │  (Prompt Store) │
└─────────────────┘                  └────────┬────────┘
                                              │
                                              │ Real-time Fetch
                                              ▼
                                    ┌─────────────────┐
                                    │  ADK Agent      │
                                    │  (Cloud Run)    │
                                    └─────────────────┘
```

## Your Firestore Details

| Property | Value |
|----------|-------|
| Project ID | `agenticai-484316` |
| Database | `(default)` |
| Database Type | FIRESTORE_NATIVE |
| Location | europe-central2 |
| Collection | `prompts` |

## Setup Instructions

### 1. Configure PromptOps Backend

```bash
export FIRESTORE_PROJECT_ID="agenticai-484316"
export FIRESTORE_COLLECTION="prompts"
export FIRESTORE_DATABASE="(default)"
# For local dev only:
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
```

### 2. Install Dependencies

```bash
pip install firebase-admin
```

## API Endpoints

### Sync All Approved Prompts
```http
POST /api/firestore/sync
Authorization: Bearer {admin_token}
```

### Sync Specific Prompt
```http
POST /api/firestore/sync/{prompt_id}
Authorization: Bearer {lead_token}
```

## Automatic Sync on Approval

When a prompt is approved, it is automatically synced to Firestore.

## ADK Agent Integration

See the `adk_agent/` directory for a complete implementation.

### Quick Start
```bash
cd adk_agent
export FIRESTORE_PROJECT_ID="agenticai-484316"
export FIRESTORE_COLLECTION="prompts"
export GEMINI_API_KEY="your-gemini-key"
python seed_prompts.py --firestore
python main.py
```

## Demo Prompts

| Agent Type | Slug | Description |
|------------|------|-------------|
| Customer Support | `customer-support-agent` | Handle customer queries |
| Code Review | `code-review-assistant` | Review code snippets |
| Technical Writer | `technical-writer` | Generate documentation |
| Data Analyst | `data-analyst` | Analyze data & insights |
