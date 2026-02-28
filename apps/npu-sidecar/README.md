# GoatCitadel NPU Sidecar

Local Python sidecar exposing OpenAI-compatible endpoints for NPU-first local inference flows.

## Endpoints

- `GET /health`
- `GET /v1/capabilities`
- `GET /v1/models`
- `POST /v1/chat/completions`

## Quick Start

```bash
cd apps/npu-sidecar
python -m venv .venv
. .venv/Scripts/activate
pip install -r requirements.txt
python server.py
```

By default the sidecar listens on `http://127.0.0.1:11440`.

## Notes

- Runtime capability detection checks for `onnxruntime`, `onnxruntime-genai`, and QNN provider availability.
- If `GOATCITADEL_NPU_FALLBACK_URL` is configured, chat completions are proxied to that OpenAI-compatible endpoint.
- Model entries come from `model-manifest.json`.
