"""
Adapters Package — Anti-Corruption Layer for Third-Party Libraries

Every external (third-party) import in Knovex lives here and ONLY here.
All other backend modules import from backend.adapters, never from the
library directly.

┌─────────────────────────────────────────────────────┐
│  Business code (services, providers, parsers)        │
│         depends on ↓ (interface only)                │
├─────────────────────────────────────────────────────┤
│  backend.adapters — interfaces + concrete wrappers   │
│         depends on ↓ (single-direction)              │
├─────────────────────────────────────────────────────┤
│  Third-party libraries (litellm, httpx, fitz, …)    │
└─────────────────────────────────────────────────────┘

Benefits:
  - Swap any library → change one file, zero service changes
  - Test without the real library → inject a mock adapter
  - Clear seam: grep for 'import litellm' should ONLY hit adapters/

Adapters in this package:
  llm_client.py        ILLMClient  ← LiteLLMAdapter
  http_client.py       IHttpClient ← HttpxAdapter
  document_parsers.py  IPDFAdapter, IParagraphAdapter ← PyMuPDF, python-docx
"""
