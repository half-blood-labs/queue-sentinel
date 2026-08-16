import amqp from "amqplib";
import { assertTopology, QUEUE } from "./topology.js";

const amqpUrl = process.env.AMQP_URL ?? "amqp://guest:guest@localhost:5672";

async function main() {
  const connection = await amqp.connect(amqpUrl);
  const channel = await connection.createChannel();
  await assertTopology(channel);
  await channel.prefetch(5);

  console.log("Worker started, processing orders...");

  channel.consume(QUEUE, async (msg) => {
    if (!msg) return;

    const order = JSON.parse(msg.content.toString("utf8"));

    if (order.simulateFailure === "downstream_timeout") {
      // simulate a slow, failing call to a downstream payments API
      await new Promise((r) => setTimeout(r, 200));
      console.log(`order ${order.orderId}: downstream payments API timed out`);
      channel.nack(msg, false, false);
      return;
    }

    if (order.simulateFailure === "invalid_payload") {
      console.log(`order ${order.orderId}: schema validation failed`);
      channel.nack(msg, false, false);
      return;
    }

    console.log(`order ${order.orderId}: processed ok`);
    channel.ack(msg);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
