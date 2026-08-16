// Shared topology for the demo: a `orders.process` queue whose failures get
// dead-lettered onto `orders.dlx`, with `orders.dlq` as the "real" queue a
// team would already have watching that exchange. Queue Sentinel binds its
// own tap queue to the same exchange — it never touches orders.dlq.
export const EXCHANGE = "orders.dlx";
export const DLQ = "orders.dlq";
export const QUEUE = "orders.process";

export async function assertTopology(channel) {
  await channel.assertExchange(EXCHANGE, "fanout", { durable: true });
  await channel.assertQueue(DLQ, { durable: true });
  await channel.bindQueue(DLQ, EXCHANGE, "");

  await channel.assertQueue(QUEUE, {
    durable: true,
    arguments: { "x-dead-letter-exchange": EXCHANGE },
  });
}
