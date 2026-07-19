# Intervue Backend

Hackathon-first backend for an AI interviewer. The current implementation runs as one Go process with clear service boundaries:

- `gateway`: REST and WebSocket entrypoint.
- `orchestrator`: interview state machine.
- `workers`: question, evaluation, resume context, analytics, and timeline modules.
- `shared/events`: fixed event envelope and event types.
- `shared/models`: candidate, interview, transcript, and score contracts.

The in-memory event bus intentionally mirrors the Redpanda topic shape. Swap `internal/eventbus` for a Kafka implementation when the demo path is stable.

## Run

```sh
cd backend
go run ./cmd/gateway
```

The gateway listens on `http://localhost:8080`.

## API

```http
POST /resume/upload
POST /interview/start
POST /interview/end
GET  /interview/{id}
POST /interview/{id}/transcript
WS   /ws?interview_id={id}
```

## Demo Flow

```sh
curl -s http://localhost:8080/resume/upload \
  -H 'Content-Type: application/json' \
  -d '{"name":"Demo Candidate","resume_text":"Built a realtime interview platform with Go, Kafka, and React."}'
```

Use the returned `candidate.id`:

```sh
curl -s http://localhost:8080/interview/start \
  -H 'Content-Type: application/json' \
  -d '{"candidate_id":"cand_xxx","role":"backend engineer"}'
```

Use the returned `interview.id`:

```sh
curl -s http://localhost:8080/interview/int_xxx/transcript \
  -H 'Content-Type: application/json' \
  -d '{"text":"I designed the event contracts first, then made workers consume immutable interview events."}'
```

Connect the frontend to:

```txt
ws://localhost:8080/ws?interview_id=int_xxx
```
