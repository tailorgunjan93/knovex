"""
ReAct loop — bounded Thought→Action→Observation, then a streamed synthesis.

Design under test:
  • The loop's job is to GATHER EVIDENCE: each step the model either calls a
    tool or says ``final_answer`` (= "I have enough"). It never writes the prose
    answer as JSON (long answers break JSON).
  • After the loop stops, ONE streaming synthesis call produces the answer,
    grounded in the collected observations → real token streaming.
  • It must be robust on flaky output: malformed actions, unknown tools, missing
    final_answer (max-steps), and repeated actions (loops) all terminate cleanly
    into synthesis rather than raising or spinning.

A scripted FakeLLM returns action JSON for ``complete`` and answer tokens for
``stream``; fake tools record their calls.
"""

from __future__ import annotations

import json

from backend.core.agent.events import AgentStep, Observation, Sources, Token
from backend.core.agent.react import ReActAgent
from backend.core.agent.tools import AgentTool, ToolResult


class FakeLLM:
    """complete() pops scripted action strings; stream() yields answer tokens."""

    def __init__(self, actions: list[str], answer: str = "Here is the answer."):
        self._actions = list(actions)
        self._answer = answer
        self.complete_calls = 0
        self.stream_calls = 0

    async def complete(self, **kwargs) -> str:
        self.complete_calls += 1
        if self._actions:
            return self._actions.pop(0)
        return json.dumps({"thought": "done", "action": "final_answer", "action_input": {}})

    async def stream(self, **kwargs):
        self.stream_calls += 1
        for tok in self._answer.split(" "):
            yield tok + " "


class RecordingTool(AgentTool):
    def __init__(self, name: str, result: ToolResult):
        self.name = name
        self.description = f"{name} tool"
        self._result = result
        self.calls: list[dict] = []

    async def run(self, **kwargs) -> ToolResult:
        self.calls.append(kwargs)
        return self._result


_CREDS = object()


def _agent(llm, **kw):
    return ReActAgent(llm, max_steps=kw.pop("max_steps", 5))


async def _collect(agent, **kw):
    events = []
    async for ev in agent.run(
        query=kw.get("query", "q"),
        history=kw.get("history", []),
        tools=kw["tools"],
        provider="openai",
        model="gpt-4o-mini",
        credentials=_CREDS,
    ):
        events.append(ev)
    return events


def _tokens(events) -> str:
    return "".join(e.text for e in events if isinstance(e, Token))


class TestDirectAnswer:
    async def test_greeting_answers_without_any_tool(self):
        # "final_answer" on step 1 → no tool runs, answer is streamed.
        llm = FakeLLM([json.dumps({"thought": "greeting", "action": "final_answer",
                                   "action_input": {}})], answer="Hi there!")
        kb = RecordingTool("search_kb", ToolResult("x"))
        events = await _collect(_agent(llm), tools={"search_kb": kb}, query="hi")
        assert kb.calls == []                       # no grounding on a greeting
        assert "Hi there!" in _tokens(events)
        assert llm.stream_calls == 1


class TestSingleTool:
    async def test_searches_kb_then_answers(self):
        actions = [
            json.dumps({"thought": "need the docs", "action": "search_kb",
                        "action_input": {"query": "payment terms"}}),
            json.dumps({"thought": "got it", "action": "final_answer", "action_input": {}}),
        ]
        llm = FakeLLM(actions, answer="Net 30 days.")
        kb = RecordingTool("search_kb",
                           ToolResult("Payment terms: net 30", sources=[{"file": "c.pdf"}]))
        events = await _collect(_agent(llm), tools={"search_kb": kb}, query="payment terms?")

        assert kb.calls == [{"query": "payment terms"}]
        # sources accumulated and emitted
        srcs = [e for e in events if isinstance(e, Sources)]
        assert srcs and srcs[0].sources == [{"file": "c.pdf"}]
        # a step + observation were surfaced for the trace
        assert any(isinstance(e, AgentStep) and e.action == "search_kb" for e in events)
        assert any(isinstance(e, Observation) for e in events)
        assert "Net 30 days." in _tokens(events)


class TestRobustness:
    async def test_max_steps_caps_tool_calls_then_synthesises(self):
        # Model never says final_answer → must stop at max_steps and answer.
        loop_action = json.dumps({"thought": "again", "action": "search_kb",
                                  "action_input": {"query": "q"}})
        llm = FakeLLM([loop_action] * 10, answer="Best effort.")
        kb = RecordingTool("search_kb", ToolResult("partial"))
        events = await _collect(_agent(llm, max_steps=3),
                                tools={"search_kb": kb}, query="q")
        assert len(kb.calls) <= 3
        assert "Best effort." in _tokens(events)      # always answers

    async def test_repeated_action_breaks_the_loop(self):
        # Identical action twice → detected as a loop → synthesise.
        same = json.dumps({"thought": "stuck", "action": "search_kb",
                           "action_input": {"query": "q"}})
        llm = FakeLLM([same, same, same, same], answer="Done.")
        kb = RecordingTool("search_kb", ToolResult("r"))
        events = await _collect(_agent(llm, max_steps=5),
                                tools={"search_kb": kb}, query="q")
        assert len(kb.calls) == 1                      # ran once, repeat aborted
        assert "Done." in _tokens(events)

    async def test_malformed_action_does_not_crash(self):
        llm = FakeLLM(["this is not json at all {{{", ], answer="Recovered.")
        kb = RecordingTool("search_kb", ToolResult("r"))
        events = await _collect(_agent(llm), tools={"search_kb": kb}, query="q")
        assert "Recovered." in _tokens(events)

    async def test_unknown_tool_is_ignored_and_loop_continues(self):
        actions = [
            json.dumps({"thought": "try", "action": "nonexistent_tool",
                        "action_input": {}}),
            json.dumps({"thought": "ok", "action": "final_answer", "action_input": {}}),
        ]
        llm = FakeLLM(actions, answer="Fine.")
        kb = RecordingTool("search_kb", ToolResult("r"))
        events = await _collect(_agent(llm), tools={"search_kb": kb}, query="q")
        assert kb.calls == []
        assert "Fine." in _tokens(events)
