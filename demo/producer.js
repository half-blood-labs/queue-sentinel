import amqp from "amqplib";
import { assertTopology, QUEUE } from "./topology.js";

const amqpUrl = process.env.AMQP_URL ?? "amqp://guest:guest@localhost:5672";

const FAILURE_TYPES = [
  { type: null, weight: 60 },
  { type: "downstream_timeout", weight: 25 },
  { type: "invalid_payload", weight: 15 },
];

function pickFailureType() {
  const total = FAILURE_TYPES.reduce((sum, f) => sum + f.weight, 0);
  let roll = Math.random() * total;

  for (const f of FAILURE_TYPES) {
    if (roll < f.weight) return f.type;
    roll -= f.weight;
  }

  return null;
}

async function main() {
  const connection = await amqp.connect(amqpUrl);
  const channel = await connection.createChannel();
  await assertTopology(channel);

  console.log("Producer started, publishing an order every ~500ms...");

  let orderId = 1;

  setInterval(() => {
    const order = {
      orderId: orderId++,
      customerId: `cust_${Math.floor(Math.random() * 500)}`,
      amount: (Math.random() * 200).toFixed(2),
      simulateFailure: pickFailureType(),
    };

    channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify(order)), { persistent: true });
  }, 500);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
