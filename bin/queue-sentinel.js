#!/usr/bin/env node
import { Command } from "commander";
import { collectDeadLetters, watchDeadLetters } from "../lib/broker/rabbitmq.js";
import { embed } from "../lib/ai/index.js";
import { clusterBySimilarity, normalizeForEmbedding } from "../lib/cluster.js";
import { summarizeCluster, formatReport } from "../lib/report.js";

const program = new Command();

program
  .name("queue-sentinel")
  .description("AI-powered dead-letter queue triage for RabbitMQ")
  .requiredOption("--amqp-url <url>", "RabbitMQ connection URL", process.env.AMQP_URL)
  .requiredOption("--exchange <name>", "dead-letter-exchange to tap")
  .option("--routing-key <pattern>", "binding routing key pattern", "#")
  .option("--similarity <threshold>", "cosine similarity to group failures together", "0.9")
  .option("--window <seconds>", "one-off mode: listen for this long, report once, exit", "30")
  .option("--max-messages <n>", "one-off mode: stop early after collecting this many", "200")
  .option("--watch", "production mode: run forever, reporting every --interval")
  .option("--interval <seconds>", "watch mode: how often to flush a report", "300")
  .action(async (opts) => {
    if (!opts.amqpUrl) {
      console.error("Missing --amqp-url (or set AMQP_URL)");
      process.exit(1);
    }

    if (opts.watch) {
      await runWatch(opts);
    } else {
      await runOnce(opts);
    }
  });

async function runOnce(opts) {
  console.error(`Listening on exchange "${opts.exchange}" for ${opts.window}s...`);

  const messages = await collectDeadLetters({
    amqpUrl: opts.amqpUrl,
    exchange: opts.exchange,
    routingKey: opts.routingKey,
    windowMs: Number(opts.window) * 1000,
    maxMessages: Number(opts.maxMessages),
  });

  await triageAndPrint(messages, opts);
}

async function runWatch(opts) {
  const intervalSeconds = Number(opts.interval);
  console.error(
    `Watching exchange "${opts.exchange}" continuously, reporting every ${intervalSeconds}s (Ctrl+C to stop)...`,
  );

  const { stop } = await watchDeadLetters({
    amqpUrl: opts.amqpUrl,
    exchange: opts.exchange,
    routingKey: opts.routingKey,
    intervalMs: intervalSeconds * 1000,
    // returning the promise matters: stop() awaits the in-flight batch on
    // shutdown so the final report finishes printing before the process exits
    onBatch: (messages) => triageAndPrint(messages, opts).catch((err) => console.error("Error while triaging batch:", err)),
  });

  const shutdown = async () => {
    console.error("\nStopping...");
    await stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // keep the process alive; the interval timer + open socket already do
  // this, but an explicit never-resolving promise makes the intent clear
  await new Promise(() => {});
}

async function triageAndPrint(messages, opts) {
  const timestamp = new Date().toISOString();

  if (messages.length === 0) {
    if (opts.watch) console.log(`[${timestamp}] no dead-lettered messages this interval`);
    else console.log("No dead-lettered messages observed in that window.");
    return;
  }

  console.error(`[${timestamp}] Collected ${messages.length} messages, embedding + clustering...`);

  const withEmbeddings = await Promise.all(
    messages.map(async (m) => ({
      ...m,
      embedding: await embed(
        normalizeForEmbedding({
          routingKey: m.routingKey,
          deathReason: m.deaths?.[0]?.reason,
          content: m.content,
        }),
      ),
    })),
  );

  const clusters = clusterBySimilarity(withEmbeddings, Number(opts.similarity));

  console.error(`Found ${clusters.length} distinct failure group(s), asking the model to explain each...`);

  const summaries = await Promise.all(clusters.map(summarizeCluster));

  console.log(formatReport(summaries, { totalMessages: messages.length }));
}

program.parseAsync();
