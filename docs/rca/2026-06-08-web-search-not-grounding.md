# RCA — Web search returns sources but the model says "I don't have real-time access" (2026-06-08)

**Status:** Fixed (prompt grounding directive) · guard test added
**Severity:** Medium (feature appears broken; "grounded" badge is misleading)

---

## 1. Symptom

With **Web** search enabled, asking *"search today's news, give me the latest 10"*
returned: *"I'm sorry — I don't have real-time access to today's headlines…"* plus a
generic "here's how to get news yourself" list — even though the UI showed the
answer as **grounded**.

## 2. What actually happened (reproduced on the live backend)

The web search **worked**. It returned **4 real, current sources** with headline
snippets:

```
NPR        — "President Trump is dismissing the idea that launching the war with Iran…"
ABC News   — "Search for gunmen continues after 12 wounded at outdoor Ohio festival…"
CBS News   — "Lawsuit attempts to stop UFC fight at White House…"
Google News— "7.8 magnitude earthquake hits southern Philippines · 5 injured in Penn Station…"
```

Those snippets were injected into the prompt under **"Web Search Results"**. The
model (`cerebras/gpt-oss-120b`) **ignored them** and emitted its trained
"I can't access real-time information" refusal.

## 3. Root cause

`ChatService._build_messages` added the web results to the **user** message but the
**system** prompt contained **no instruction to use them**. Many instruction-tuned
models (gpt-oss especially) have a strong prior to refuse "current events / today's
news" requests with "I don't have real-time access" — and with nothing in the
system prompt overriding that, the prior wins even when fresh headlines are present
in context.

Contrast: the KB path *does* have a directive ("Always prioritise information from
the provided context"). The web path had none.

### Secondary (not a bug)
The header "· 1 source" badge counts **KB** sources only (`message.sources`). The
query ran with scope "All KBs", so it found 1 KB chunk → "1 source". The 4 web
results render in the separate **Web sources** panel. Confusing, but correct.
(Tracked as a minor UX item: consider showing kb+web total.)

## 4. Why it wasn't caught

- No test asserted the system prompt instructs the model to use web results.
- Web-search grounding quality is **model-behaviour**, invisible to unit tests that
  mock the LLM and to the (mocked-API) browser E2E. The real-backend E2E gate uses
  a deterministic fake LLM, so it verifies *plumbing* (results reach the prompt) but
  not *model compliance*.

## 5. Fix

`_build_messages` now adds a **web grounding directive** to the system prompt
whenever web results are present:

> *"Real-time web search results are provided below… They were retrieved just now…
> Answer directly from them… You DO have access to this real-time information —
> never reply that you lack real-time access or cannot browse the web…"*

**Guard:** `test_chat.py::test_build_messages_adds_web_grounding_directive_when_web_context_present`
(and the negative case). These assert the directive is present iff web results are.

## 6. Lessons

1. **If you inject context, instruct the model to use it.** Retrieval without a
   grounding directive is half a feature — the model's prior can override silent
   context. (Mirror the KB directive for every context source.)
2. **A "grounded" badge must mean grounded.** Don't show grounding affordances
   unless the answer actually used the sources. (Follow-up: badge should reflect
   web+kb, and ideally be suppressed if the model didn't cite anything.)
3. **Model-compliance can't be unit-tested with a fake LLM.** Keep a small,
   manual/`@slow` smoke test against a real model for grounding-sensitive prompts
   (see docs/qa/test-plan.md → "Manual / model-dependent checks").
