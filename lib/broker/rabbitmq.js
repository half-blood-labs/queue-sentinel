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
export async function collectDeadLetters({
  amqpUrl,
  exchange,
  routingKey = "#",
  windowMs = 30_000,
  maxMessages = 200,
}) {
  const connection = await amqp.connect(amqpUrl);
  const channel = await connection.createChannel();

  try {
    const { queue } = await channel.assertQueue("", { exclusive: true, autoDelete: true });
    await channel.bindQueue(queue, exchange, routingKey);

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
