"""프로세스 친화적 라벨: AI 서빙 프로세스(vLLM/Ollama)를 사람이 알아볼 이름으로.

NVML/psutil 은 PID 만 알려주므로 vLLM 은 그냥 'python3', Ollama 는 'ollama' 로 잡힌다.
cmdline 을 파싱해 서빙 모델까지 드러낸다(예: 'vLLM, qwen3-14b'). 비용 때문에 top N 결과에만 적용한다.
컨테이너라도 에이전트가 pid:host + HOST_PROC 이라 호스트 프로세스의 argv 를 읽을 수 있다.
"""

from __future__ import annotations

import os

try:
    import psutil
except Exception:  # pragma: no cover
    psutil = None  # type: ignore


def _extract_arg(cmd: list[str], flag: str) -> str | None:
    """`--flag value` 및 `--flag=value` 양쪽 지원."""
    for i, tok in enumerate(cmd):
        if tok == flag and i + 1 < len(cmd):
            return cmd[i + 1]
        prefix = flag + "="
        if tok.startswith(prefix):
            return tok[len(prefix) :]
    return None


def label_from_cmdline(cmd: list[str], fallback: str) -> str:
    """cmdline(argv) → 친화적 라벨(순수 함수, 테스트 용이)."""
    if not cmd:
        return fallback
    joined = " ".join(cmd).lower()

    if "vllm" in joined:
        model = _extract_arg(cmd, "--served-model-name") or _extract_arg(cmd, "--model")
        if model:
            # /models/qwen3-14b 같은 경로면 마지막 요소만.
            model = os.path.basename(model.rstrip("/")) or model
            return f"vLLM, {model}"
        return "vLLM"

    if "ollama" in joined:
        # `ollama runner --model .../qwen3:8b` 등에서 모델 추출 시도.
        model = _extract_arg(cmd, "--model")
        if model:
            return f"Ollama, {os.path.basename(model.rstrip('/')) or model}"
        return "Ollama"

    return fallback


def friendly_label(pid: int, fallback: str) -> str:
    """AI 서빙 프로세스면 모델까지 드러낸 라벨, 아니면 fallback(원래 프로세스명)."""
    if psutil is None:
        return fallback
    try:
        cmd = psutil.Process(pid).cmdline()
    except Exception:
        return fallback
    return label_from_cmdline(cmd, fallback)
