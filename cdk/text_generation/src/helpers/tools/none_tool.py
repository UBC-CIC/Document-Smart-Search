from typing import Any

class NoneTool:
    """Tool that does nothing and returns an empty string."""
    
    @staticmethod
    def none_tool(_: Any) -> str:
        """
        A tool that does nothing and returns an empty string.
        Not meant to be called directly.
        """
        return ''
