import amqp from "amqplib";

/**
 * Collects a sample of dead-lettered messages without ever touching the
 * real dead-letter queue. It declares its own exclusive, auto-delete queue
 * and binds it to the same dead-letter-exchange your queues already point
 * at, so it receives a mirrored copy of whatever gets dead-lettered. The
 * original DLQ is never consumed from, so nothing you rely on for retries
 * is at risk of being lost or reordered by this tool.
 *
 * @param {object} opts
 * @param {string} opts.amqpUrl
 * @param {string} opts.exchange - the dead-letter-exchange name
 * @param {string} [opts.routingKey] - defaults to "#" (topic/fanout wildcard)
 * @param {number} [opts.windowMs] - how long to listen for
 * @param {number} [opts.maxMessages] - stop early once this many are collected
 * @returns {Promise<Array<{routingKey: string, headers: object, deaths: object[], content: unknown, raw: string}>>}
 */
async function openTap({ amqpUrl, exchange, routingKey }) {
  const connection = await amqp.connect(amqpUrl);
  const channel = await connection.createChannel();
  const { queue } = await channel.assertQueue("", { exclusive: true, autoDelete: true });
  await channel.bindQueue(queue, exchange, routingKey);
  return { connection, channel, queue };
}

export async function collectDeadLetters({
  amqpUrl,
  exchange,
  routingKey = "#",
  windowMs = 30_000,
  maxMessages = 200,
}) {
  const { connection, channel, queue } = await openTap({ amqpUrl, exchange, routingKey });

  try {
    const messages = [];

    await new Promise((resolve) => {
      const timer = setTimeout(resolve, windowMs);

      channel.consume(
        queue,
        (msg) => {
          if (!msg) return;

          messages.push(parseMessage(msg));
          channel.ack(msg);

          if (messages.length >= maxMessages) {
            clearTimeout(timer);
            resolve();
          }
        },
        { noAck: false },
      );
    });

    return messages;
  } finally {
    await channel.close();
    await connection.close();
  }
}

/**
 * The production shape: stays connected indefinitely and calls `onBatch`
 * with whatever dead letters accumulated every `intervalMs`, forever, until
 * `stop()` is called. Nobody has to re-run this by hand — point it at a
 * schedule (systemd, a Kubernetes Deployment, `docker compose up`) once.
 *
 * @param {object} opts
 * @param {string} opts.amqpUrl
 * @param {string} opts.exchange
 * @param {string} [opts.routingKey]
 * @param {number} [opts.intervalMs] - how often to flush a batch
 * @param {(messages: object[]) => void} opts.onBatch - called with an empty
 *   array on intervals where nothing failed, so callers can emit a heartbeat
 * @returns {Promise<{stop: () => Promise<void>}>}
 */
export async function watchDeadLetters({
  amqpUrl,
  exchange,
  routingKey = "#",
  intervalMs = 5 * 60_000,
  onBatch,
}) {
  const { connection, channel, queue } = await openTap({ amqpUrl, exchange, routingKey });

  let buffer = [];

  await channel.consume(
    queue,
    (msg) => {
      if (!msg) return;
      buffer.push(parseMessage(msg));
      channel.ack(msg);
    },
    { noAck: false },
  );

  const timer = setInterval(() => {
    const batch = buffer;
    buffer = [];
    onBatch(batch);
  }, intervalMs);

  return {
    async stop() {
      clearInterval(timer);

      // swap out the buffer before handing it off, same as the interval
      // tick does — otherwise the still-active consumer keeps pushing into
      // this same array while onBatch is mid-flight (embedding/LLM calls
      // take real time), and the message count read at the end of the
      // report would drift from what was actually clustered.
      const finalBatch = buffer;
      buffer = [];
      if (finalBatch.length > 0) await onBatch(finalBatch);

      await channel.close();
      await connection.close();
    },
  };
}

function parseMessage(msg) {
  const raw = msg.content.toString("utf8");
  let content = raw;

  try {
    content = JSON.parse(raw);
  } catch {
    // not JSON, keep as raw string
  }

  return {
    routingKey: msg.fields.routingKey,
    headers: msg.properties.headers ?? {},
    deaths: msg.properties.headers?.["x-death"] ?? [],
    content,
    raw,
  };
}
