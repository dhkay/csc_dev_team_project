"""친화적 프로세스 라벨(vLLM/Ollama 인식) 파싱 테스트."""

from __future__ import annotations

from app.domains.metrics.adapters.outbound.process_label import label_from_cmdline


def test_vllm_served_model_name():
    cmd = [
        "python3",
        "-m",
        "vllm.entrypoints.openai.api_server",
        "--model",
        "/models/qwen3-14b",
        "--served-model-name",
        "qwen3-14b",
    ]
    assert label_from_cmdline(cmd, "python3") == "vLLM, qwen3-14b"


def test_vllm_model_path_basename_when_no_served_name():
    cmd = ["python3", "-m", "vllm.entrypoints.openai.api_server", "--model=/models/qwen3-8b"]
    assert label_from_cmdline(cmd, "python3") == "vLLM, qwen3-8b"


def test_vllm_without_model_flag():
    assert label_from_cmdline(["python", "-m", "vllm.x"], "python") == "vLLM"


def test_ollama():
    assert label_from_cmdline(["ollama", "serve"], "ollama") == "Ollama"
    assert (
        label_from_cmdline(["ollama", "runner", "--model", "/root/.ollama/qwen3:8b"], "ollama")
        == "Ollama, qwen3:8b"
    )


def test_non_ai_falls_back():
    assert label_from_cmdline(["/usr/bin/Code", "--type=renderer"], "Code") == "Code"
    assert label_from_cmdline([], "explorer.exe") == "explorer.exe"
