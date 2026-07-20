#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed/available." >&2
  exit 1
fi

docker rm -f intervue-whisper intervue-piper >/dev/null 2>&1 || true

echo "Starting local Whisper HTTP on :8000 ..."
docker run -d --name intervue-whisper \
  -p 8000:8000 \
  -e WHISPER_HOST=0.0.0.0 \
  -e WHISPER_PORT=8000 \
  -e WHISPER_MODEL=base \
  ghcr.io/ggerganov/whisper.cpp/whisper-http:latest >/dev/null

echo "Starting local Piper HTTP on :5002 ..."
docker run -d --name intervue-piper \
  -p 5002:5002 \
  -e PIPER_HOST=0.0.0.0 \
  -e PIPER_PORT=5002 \
  -e PIPER_VOICE=en_US-lessac-medium \
  rhasspy/piper-http:latest >/dev/null

echo "Waiting for Whisper ..."
for i in {1..60}; do
  if curl -sf http://localhost:8000/health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
echo "Whisper ready at http://localhost:8000"

echo "Waiting for Piper ..."
for i in {1..60}; do
  if curl -sf http://localhost:5002/health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
echo "Piper ready at http://localhost:5002"

echo "Set these in your backend runtime:"
echo "  WHISPER_BASE_URL=http://localhost:8000"
echo "  PIPER_BASE_URL=http://localhost:5002"