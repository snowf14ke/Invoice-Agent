FROM nvidia/cuda:13.0.0-cudnn-runtime-ubuntu22.04

ARG HF_TOKEN

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/app/model_cache\
    HUGGINGFACE_TOKEN=$HF_TOKEN

# ── system deps ───────────────────────────────────────────────────────────────
RUN set -eux; \
    rm -rf /var/lib/apt/lists/*; \
    printf 'Acquire::Retries "5";\nAcquire::http::No-Cache "true";\nAcquire::http::Pipeline-Depth "0";\nAcquire::CompressionTypes::Order:: "gz";\n' \
        > /etc/apt/apt.conf.d/99fix-hashsum; \
    apt-get -o Acquire::CompressionTypes::Order::=gz update; \
    apt-get install -y --no-install-recommends \
        python3 python3-pip python3-dev python-is-python3 \
        build-essential \
        libgl1 libglib2.0-0 libsm6 libxrender1 libxext6 \
        ca-certificates; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── python deps ───────────────────────────────────────────────────────────────
COPY requirements.txt /app/requirements.txt


RUN python3 -m pip install --upgrade pip && \
    python3 -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu130 && \
    python3 -m pip install -r requirements.txt

# ── app ───────────────────────────────────────────────────────────────────────
COPY handler.py /app/handler.py

ENV HF_HOME=/app/model_cache
# ── pre-download model weights into the image (eliminates cold-start download) ─
RUN python3 - <<'PY'
import os
import torch
from transformers import AutoProcessor, AutoModelForImageTextToText
# tok        = os.environ.get("HUGGINGFACE_TOKEN")
model_path = os.environ.get("HF_MODEL_ID", "PaddlePaddle/PaddleOCR-VL-1.6")

print(f"Pre-caching processor for {model_path} …")
AutoProcessor.from_pretrained(model_path, torch_dtype=torch.bfloat16)

print(f"Pre-caching model weights for {model_path} …")
AutoModelForImageTextToText.from_pretrained(model_path, torch_dtype=torch.bfloat16)

print("All assets pre-cached.")
PY


CMD ["python3", "-u", "handler.py"]