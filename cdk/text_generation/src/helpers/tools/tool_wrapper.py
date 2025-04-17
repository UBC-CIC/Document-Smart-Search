import json
from typing import List, Dict, Any

# Global order counter for tool tracking
_global_call_order = 0

def _next_order() -> int:
    global _global_call_order
    _global_call_order += 1
    return _global_call_order

def _reset_global_order() -> None:
    global _global_call_order
    _global_call_order = 0

class ToolWrapper:
    """Wraps a tool so every call is logged with a global order index."""

    def __init__(self, tool):
        self.tool = tool
        self._calls: List[Dict[str, Any]] = []
        self._orig = tool.func
        tool.func = self._wrapped_func  # monkey‑patch

    def _wrapped_func(self, *args, **kwargs):
        order = _next_order()
        raw = self._orig(*args, **kwargs)

        try:
            payload = json.loads(raw)
        except Exception:
            payload = {"output": raw, "metadata": {}}

        meta = payload.get("metadata", {})
        entry = {
            "order": order,
            "tool_name": self.tool.name,
            "description": meta.get("description", ""),
            **({
                "sources": meta["sources"]
            } if meta.get("sources") else {}),
        }
        self._calls.append(entry)

        return payload.get("output", "")

    def reset(self) -> None:
        self._calls.clear()

    def get_calls(self) -> List[Dict[str, Any]]:
        return self._calls

def get_tool_calls_summary(tool_wrappers: Dict[str, ToolWrapper]) -> Dict[str, Any]:
    """Return ordered list of every call, tagging repeats as '#N'."""
    all_calls = sorted(
        (
            call
            for w in tool_wrappers.values()
            if w.tool.name.lower() != "none"
            for call in w.get_calls()
        ),
        key=lambda c: c["order"],
    )

    counters: Dict[str, int] = {}
    summary: List[Dict[str, Any]] = []

    for call in all_calls:
        name = call["tool_name"]
        counters[name] = counters.get(name, 0) + 1
        numbered = call.copy()
        numbered["tool_name"] = f"{name} #{counters[name]}"
        summary.append(numbered)

    return {"tools_and_sources": summary}

def reset_all_tool_wrappers(tool_wrappers: Dict[str, ToolWrapper]) -> None:
    _reset_global_order()
    for wrapper in tool_wrappers.values():
        wrapper.reset()
