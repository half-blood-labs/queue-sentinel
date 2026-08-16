# Queue Sentinel

AI-powered dead-letter queue triage for RabbitMQ. Instead of an engineer
manually opening a dead-letter queue and reading through failed messages one
by one, Queue Sentinel taps your dead-letter-exchange, clusters similar
failures together with embeddings, and asks an LLM to explain each cluster
in plain English — a summary, a likely root cause, and a suggested fix.

![Queue Sentinel demo: docker compose up, real orders failing live, then a triage report clustering them into two named failure groups](demo/recording/queue-sentinel-demo.gif)

*The recording above is real — `docker compose up`, a fake order service actually
failing in real time, then Queue Sentinel run against it. Nothing staged.*

```
Queue Sentinel — triage report
9 dead-lettered messages, 2 distinct failure group(s)

1. 7 messages — Seven orders failed due to invalid payload format.
   Root cause: messages don't conform to the expected JSON structure.
   Suggested fix: validate the payload before publishing to orders.process.

2. 2 messages — Two orders were rejected due to a downstream timeout.
   Root cause: the order processor couldn't complete downstream processing.
   Suggested fix: check the downstream service's logs for the same window.
```

## Works with any producer, any language

Queue Sentinel talks to RabbitMQ over AMQP directly. It doesn't care what
produced or consumed a message — a Python service, a Java service, a Ruby
service, an Elixir service, whatever. As long as it's RabbitMQ with a
dead-letter-exchange configured, Queue Sentinel can triage its failures.

The tool itself is Node.js. Kafka support is not implemented yet, but the
broker layer (`lib/broker/`) is written as a small adapter so it can be
added without touching the clustering or reporting logic.

## How it stays safe to run against production

Queue Sentinel never consumes from your real dead-letter queue. It declares
its own temporary, exclusive queue and binds it to the same
dead-letter-exchange your existing DLQ is already bound to — so it receives
a mirrored copy of whatever gets dead-lettered, and your actual DLQ (and
whatever retry tooling reads from it) is completely untouched.

## Quick start (self-contained demo)

This spins up RabbitMQ plus a fake "orders" service that deliberately fails
some orders (a downstream timeout, an invalid payload), so you can see a
real triage report without touching your own infrastructure.

```bash
git clone https://github.com/half-blood-labs/queue-sentinel.git
cd queue-sentinel
docker compose up -d          # rabbitmq + producer + worker
```

Give it 15-20 seconds to accumulate some failures, then run Queue Sentinel
against it. By default this uses a local Ollama (free, no API key):

```bash
ollama pull llama3.2:3b
ollama pull nomic-embed-text

npm install
node bin/queue-sentinel.js \
  --amqp-url amqp://guest:guest@localhost:5672 \
  --exchange orders.dlx \
  --window 20
```

Or run it fully containerized, no local Node/Ollama install required
(reaches Ollama on your host via `host.docker.internal`, or set
`AI_PROVIDER=openai` in a `.env` file to use OpenAI instead):

```bash
docker compose run --rm queue-sentinel \
  --amqp-url amqp://guest:guest@rabbitmq:5672 \
  --exchange orders.dlx \
  --window 20
```

RabbitMQ's management UI is at http://localhost:15672 (guest/guest) if you
want to watch the queues directly.

## Using it against your own system

You need the name of the dead-letter-exchange your queues already point at
(the `x-dead-letter-exchange` argument on your queue). Point Queue Sentinel
at it:

```bash
node bin/queue-sentinel.js \
  --amqp-url amqp://user:pass@your-rabbitmq-host:5672 \
  --exchange your.dlx.name \
  --window 60
```

### CLI options

| Flag | Default | Description |
|---|---|---|
| `--amqp-url` | `$AMQP_URL` | RabbitMQ connection URL |
| `--exchange` | *(required)* | the dead-letter-exchange to tap |
| `--routing-key` | `#` | binding pattern (use `""` for a fanout DLX) |
| `--window` | `30` | seconds to listen for dead letters |
| `--max-messages` | `200` | stop early once this many are collected |
| `--similarity` | `0.9` | cosine similarity threshold to group failures together |

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `AI_PROVIDER` | `ollama` | `ollama` (local, free) or `openai` (hosted) |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | |
| `OLLAMA_CHAT_MODEL` | `llama3.2:3b` | |
| `OLLAMA_EMBEDDING_MODEL` | `nomic-embed-text` | |
| `OPENAI_API_KEY` | — | required if `AI_PROVIDER=openai` |
| `OPENAI_CHAT_MODEL` | `gpt-4.1-mini` | |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | |

## How the clustering works

Each dead-lettered message is embedded and grouped with a simple greedy
similarity pass — no need to know the number of failure types up front, and
fast enough for the tens-to-low-hundreds of messages a triage run typically
looks at. Before embedding, fields that look like per-message noise (ids,
amounts, timestamps — detected by field name and by value shape) are
stripped out, so the embedding reflects *why* something failed rather than
which specific order or customer it happened to.

## Limitations

- RabbitMQ only for now; Kafka is on the roadmap.
- Clustering is a simple greedy pass, not a tuned algorithm — it works well
  for triage-sized batches but isn't meant for massive-scale log clustering.
- The suggested fix is a model's best guess from the message content alone;
  it doesn't have access to your actual application code or logs.

## License

MIT
