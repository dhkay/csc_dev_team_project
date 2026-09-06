"""카탈로그 도메인 라우터 노출."""

from __future__ import annotations

from .adapters.inbound.http.router import router

__all__ = ["router"]
