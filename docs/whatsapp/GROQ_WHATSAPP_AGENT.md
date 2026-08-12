# Groq WhatsApp Agent

Human-like WhatsApp replies grounded **only** in training documents, powered by Groq.

## Enable

In `.env` (API / docker):

```env
GROQ_API_KEY=gsk_...
CHATBOT_MODE=groq
# optional overrides:
# GROQ_MODEL_FAST=llama-3.1-8b-instant
# GROQ_MODEL_AGENT=llama-3.3-70b-versatile
```

Default is `CHATBOT_MODE=legacy_fsm` (old menu FSM). Switch only after `GROQ_API_KEY` is set.

## How it works

1. **Stage 1** (`llama-3.1-8b-instant`) — picks matching rows from the training catalog (JSON + DocumentIssue + company pack).
2. **Stage 2** (`llama-3.3-70b-versatile`) — writes a natural WhatsApp reply using **only** those rows.
3. Low confidence / no match → honest refusal + Book service / Talk to agent buttons.
4. On Groq errors → automatic fallback to the legacy FSM.

## Preserved flows

| Flow | Behavior |
|------|----------|
| Book service button | Hands off to serial / complaint FSM |
| Talk to agent | Notifies support phone + dashboard handoff |
| Feedback after OTP close | Legacy FSM |
| Mid-complaint FSM states | Stay on FSM until MENU |
| Engineer `TICKETS` / OTP / reports | Unchanged |
| Engineer free-text | Groq service-docs Q&A, then training videos |

## Training sources

- `data/training/company-knowledge.json`
- `data/training/customer-training.json`
- `data/training/chatbot-training.json`
- `data/training/training.json` (engineers)
- Active `DocumentIssue` templates in Postgres

## Files

- `api/src/services/groq.service.ts`
- `api/src/services/training-catalog.service.ts`
- `api/src/services/whatsapp-agent.service.ts`
- Wired from `simulate.service.ts` + `engineer-whatsapp.service.ts`
