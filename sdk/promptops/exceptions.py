class PromptOpsError(Exception):
    """Base exception for all PromptOps SDK errors."""


class AuthenticationError(PromptOpsError):
    """Raised when the API key is missing, invalid, or expired."""


class PromptNotFoundError(PromptOpsError):
    """Raised when the requested prompt or version does not exist."""


class VersionNotFoundError(PromptNotFoundError):
    """Raised when a specific version of a prompt cannot be found."""


class RenderError(PromptOpsError):
    """Raised when required template variables are missing during render."""

    def __init__(self, missing: list[str]) -> None:
        self.missing = missing
        super().__init__(f"Missing required variables: {missing}")


class ServerError(PromptOpsError):
    """Raised when the PromptOps server returns an unexpected error."""
