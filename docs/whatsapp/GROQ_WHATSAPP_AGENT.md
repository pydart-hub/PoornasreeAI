# Groq AI Integration Specification

High-performance, ultra-fast WhatsApp AI operations powered exclusively by **Groq LPU (Language Processing Unit)** infrastructure.

---

## 1. Active Models Configured

| Task / Feature | Active Model ID | Description |
|---|---|---|
| **Flagship LLM (Text & Translation & RAG)** | **`llama-3.3-70b-versatile`** | **Meta Llama 3.3 70B Parameter Model**. 128k context window, ~300 tokens/sec. Powers all multi-language translations (8 Indian languages) and RAG document generation. |
| **Speech-to-Text (Voice Notes)** | **`whisper-large-v3-turbo`** | Groq Multilingual Whisper Engine. Automatically transcribes `.ogg` WhatsApp audio recordings into text. |

---

## 2. Environment Configuration (`.env`)

```env
GROQ_API_KEY=gsk_...
GROQ_MODEL_FAST=llama-3.3-70b-versatile
GROQ_MODEL_AGENT=llama-3.3-70b-versatile
```

---

## 3. Core Active Groq Services in Codebase

1. **Shared Groq API Client**:
   - [`api/src/services/groq.service.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/services/groq.service.ts)
   - Handles `groqChat()` and `transcribeAudioWithGroq()`.
2. **Groq Multilingual Translation Engine**:
   - [`api/src/services/translate.service.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/services/translate.service.ts)
   - Translates text dynamically into Hindi, Malayalam, Tamil, Telugu, Kannada, Marathi, Bengali, and English.
3. **Groq RAG Generator**:
   - [`api/src/controllers/message.controller.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/controllers/message.controller.ts)
   - Generates grounded responses from knowledge base documents.
4. **WhatsApp Webhook Voice Transcriber**:
   - [`api/src/controllers/whatsapp.controller.ts`](file:///Users/pydart/Projects/PoornasreeAI-1/api/src/controllers/whatsapp.controller.ts)
   - Ingests `.ogg` audio files from Meta Cloud API and converts them to text via `whisper-large-v3-turbo`.
