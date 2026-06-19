"""
ReAct loop — bounded Thought→Action→Observation, then a streamed synthesis.

Why this shape:
  • The loop only GATHERS EVIDENCE. Each step the model either calls a tool or
    says ``final_answer`` ("I have enough"). It never writes the prose answer as
    JSON — long answers break JSON, and we want real token streaming.
  • After the loop stops (final_answer / max-steps / a detected repeat), ONE
    streaming synthesis call writes the answer grounded in the observations.
  • Robustness is non-negotiable: malformed actions, unknown tools, and missing
    final_answer must terminate cleanly into synthesis, never raise or spin.
    JSON actions are parsed with the same anti-corruption repairer used for the
    Learn pipeline.

The agent is provider-agnostic: it depends only on an ``llm_svc`` with
``complete`` / ``stream`` and a dict of ``AgentTool``s, both injected.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import AsyncGenerator

from backend.adapters.json_repair_adapter import repair_json_object
from backend.core.agent.events import AgentEvent, AgentStep, Observation, Sources, Token
from backend.core.agent.tools import AgentTool

logger = logging.getLogger("knovex.agent.react")

_FINAL_ANSWER = "final_answer"

_DEFAULT_PERSONA = (
    "You are Knovex, a warm, precise AI assistant. Answer the user's message "
    "directly and helpfully, choosing the richest useful Markdown formatting."
)


def _parse_action(raw: str) -> tuple[str, str, dict] | None:
    """
    Parse one action JSON into (thought, action, action_input).

    Returns None when nothing usable can be recovered — the caller treats that
    as "stop and answer" rather than crashing.
    """
    text = (raw or "").strip()
    if not text:
        return None
    if text.startswith("```"):
        text = text.strip("`")
        text = re.sub(r"^json\s*", "", text, flags=re.IGNORECASE).strip()

    obj: object
    try:
        obj = json.loads(text)
    except Exception:
        obj = repair_json_object(text)

    if not isinstance(obj, dict):
        return None
    action = obj.get("action")
    if not isinstance(action, str) or not action.strip():
        return None

    action_input = obj.get("action_input")
    if isinstance(action_input, str):
        try:
            action_input = json.loads(action_input)
        except Exception:
            action_input = repair_json_object(action_input)
    if not isinstance(action_input, dict):
        action_input = {}

    thought = obj.get("thought")
    return (str(thought or ""), action.strip(), action_input)


class ReActAgent:
    """Capability-gated reasoning loop over a set of injected tools."""

    def __init__(self, llm_svc, *, max_steps: int = 5) -> None:
        self._llm = llm_svc
        self._max_steps = max(1, max_steps)

    # ------------------------------------------------------------------
    async def run(
        self,
        *,
        query: str,
        history: list[dict[str, str]],
        tools: dict[str, AgentTool],
        provider: str,
        model: str,
        credentials,
        system_preamble: str = "",
    ) -> AsyncGenerator[AgentEvent, None]:
        scratchpad: list[str] = []
        sources: list[dict] = []
        web_sources: list[dict] = []
        seen: set[str] = set()

        decide_system = self._decide_system_prompt(tools)

        for _ in range(self._max_steps):
            raw = await self._llm.complete(
                messages=[
                    {"role": "system", "content": decide_system},
                    *history,
                    {"role": "user", "content": self._decide_user_prompt(query, scratchpad)},
                ],
                provider=provider,
                model=model,
                credentials=credentials,
                max_tokens=400,
                temperature=0.0,
            )

            parsed = _parse_action(raw)
            if parsed is None:
                break  # unparseable → answer with what we have

            thought, action, action_input = parsed
            yield AgentStep(thought=thought, action=action, action_input=action_input)

            if action == _FINAL_ANSWER:
                break

            signature = action + "|" + json.dumps(action_input, sort_keys=True)
            if signature in seen:
                break  # the model is repeating itself → stop and answer
            seen.add(signature)

            tool = tools.get(action)
            if tool is None:
                continue  # hallucinated tool name → let the loop try again

            try:
                result = await tool.run(**action_input)
            except Exception as exc:  # noqa: BLE001 - a tool fault must not kill the turn
                logger.warning("Agent tool %s failed: %s", action, exc)
                result = None

            if result is None:
                scratchpad.append(f"Action: {action}\nObservation: (the tool errored)")
                yield Observation(tool=action, content="(the tool errored)")
                continue

            sources.extend(result.sources)
            web_sources.extend(result.web_sources)
            scratchpad.append(
                f"Action: {action}({json.dumps(action_input)})\nObservation: {result.content}"
            )
            yield Observation(tool=action, content=result.content)

        # ── Emit accumulated sources before the answer streams ──────────────
        if sources or web_sources:
            yield Sources(sources=_dedupe(sources), web_sources=_dedupe(web_sources))

        # ── Stream the final synthesis grounded in the gathered evidence ────
        async for tok in self._llm.stream(
            messages=self._synthesis_messages(query, history, scratchpad, system_preamble),
            provider=provider,
            model=model,
            credentials=credentials,
            max_tokens=2048,
            temperature=0.4,
        ):
            yield Token(text=tok)

    # ------------------------------------------------------------------
    def _decide_system_prompt(self, tools: dict[str, AgentTool]) -> str:
        tool_lines = "\n".join(f"- {t.name}: {t.description}" for t in tools.values())
        return (
            "You are Knovex's reasoning controller. Decide the SINGLE next step "
            "needed to answer the user's message.\n\n"
            "Available tools:\n"
            f"{tool_lines}\n"
            f"- {_FINAL_ANSWER}: stop gathering and answer. Use this when you "
            "already have enough information, or for greetings, small talk, and "
            "anything you can answer from general knowledge.\n\n"
            "Respond with ONLY one JSON object, no prose, no code fences:\n"
            '{"thought": "<one sentence>", "action": "<tool name or '
            f'{_FINAL_ANSWER}>", "action_input": {{...}}}}\n'
            "Call a tool ONLY when you genuinely need information you don't have. "
            "Never call a tool just because one exists."
        )

    def _decide_user_prompt(self, query: str, scratchpad: list[str]) -> str:
        if not scratchpad:
            return f"User message: {query}\n\nWhat is the next action?"
        evidence = "\n\n".join(scratchpad)
        return (
            f"User message: {query}\n\n"
            f"Evidence gathered so far:\n{evidence}\n\n"
            "What is the next action? Use final_answer if you have enough."
        )

    def _synthesis_messages(
        self,
        query: str,
        history: list[dict[str, str]],
        scratchpad: list[str],
        system_preamble: str,
    ) -> list[dict[str, str]]:
        system = system_preamble or _DEFAULT_PERSONA
        if scratchpad:
            evidence = "\n\n".join(scratchpad)
            system += (
                "\n\n━━━ GATHERED EVIDENCE ━━━\n"
                "Answer using the evidence below, which was just retrieved for "
                "this question. Attribute facts to their source where relevant. "
                "If the evidence doesn't fully cover the question, answer what it "
                "does cover and say clearly what's missing — never invent details "
                "to fill gaps.\n\n"
                f"{evidence}"
            )
        return [{"role": "system", "content": system}, *history,
                {"role": "user", "content": query}]


def _dedupe(rows: list[dict]) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    for r in rows:
        key = json.dumps(r, sort_keys=True)
        if key not in seen:
            seen.add(key)
            out.append(r)
    return out
