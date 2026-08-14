---
name: always-plan-before-execution
description: Mandatory pre-implementation planning workflow. For every user command or request, thoroughly study the codebase and data requirements, create an implementation plan artifact, present the plan to the user, and ONLY proceed with execution after obtaining explicit user approval.
---

# Always Plan Before Execution Skill

## Overview
This skill mandates a strict 3-phase workflow for ALL incoming user requests and commands:
1. **Study & Research**: Perform read-only research of the codebase, APIs, schemas, and requirements. Do NOT modify any application source files or run destructive commands.
2. **Build Implementation Plan**: Create or update the `implementation_plan.md` artifact detailing proposed technical changes, file modifications, data structures, and verification steps. Request user feedback (`request_feedback = true`).
3. **Wait for Approval**: Stop and wait for the user's explicit command/approval BEFORE executing any implementation steps.

## Workflow Rules

### Phase 1: Study & Research
- Inspect relevant codebase files, database schemas, and documentation.
- Understand all dependencies, component interactions, and side effects.
- Gather exact file paths, function signatures, and data requirements.

### Phase 2: Create Implementation Plan
- Write a detailed technical document in `implementation_plan.md`.
- Include:
  - Problem/Goal Overview
  - Proposed Changes by Component and File
  - Data structures, schema changes, and API contracts
  - Verification Plan (Automated & Manual tests)
  - Open Questions / User Review Items
- Set `UserFacing: true` and `RequestFeedback: true` in artifact metadata.

### Phase 3: Wait for User Approval
- Present the plan to the user.
- **DO NOT** execute any code edits, database mutations, or deployment commands until the user explicitly responds with approval or command to proceed.
- Once approved, execute the plan cleanly and verify with tests.
