#!/usr/bin/env node
import { Command } from "commander";
import { collectDeadLetters } from "../lib/broker/rabbitmq.js";
import { embed } from "../lib/ai/index.js";
import { clusterBySimilarity } from "../lib/cluster.js";
import { summarizeCluster, formatReport } from "../lib/report.js";

const program = new Command();

program
  .name("queue-sentinel")
  .description("AI-powered dead-letter queue triage for RabbitMQ")
  .requiredOption("--amqp-url <url>", "RabbitMQ connection URL", process.env.AMQP_URL)
  .requiredOption("--exchange <name>", "dead-letter-exchange to tap")
  .option("--routing-key <pattern>", "binding routing key pattern", "#")
  .option("--window <seconds>", "how long to listen for dead letters", "30")
  .option("--max-messages <n>", "stop early after collecting this many", "200")
  .option("--similarity <threshold>", "cosine similarity to group failures together", "0.87")
  .action(async (opts) => {
    if (!opts.amqpUrl) {
      console.error("Missing --amqp-url (or set AMQP_URL)");
      process.exit(1);
    }

    console.error(`Listening on exchange "${opts.exchange}" for ${opts.window}s...`);

    const messages = await collectDeadLetters({
      amqpUrl: opts.amqpUrl,
      exchange: opts.exchange,
      routingKey: opts.routingKey,
      windowMs: Number(opts.window) * 1000,
      maxMessages: Number(opts.maxMessages),
    });

    if (messages.length === 0) {
      console.log("No dead-lettered messages observed in that window.");
      return;
    }

    console.error(`Collected ${messages.length} messages, embedding + clustering...`);

    const withEmbeddings = await Promise.all(
      messages.map(async (m) => ({ ...m, embedding: await embed(describeForEmbedding(m)) })),
    );

    const clusters = clusterBySimilarity(withEmbeddings, Number(opts.similarity));

    console.error(`Found ${clusters.length} distinct failure group(s), asking the model to explain each...`);

    const summaries = await Promise.all(clusters.map(summarizeCluster));

    console.log(formatReport(summaries, { totalMessages: messages.length }));
  });

function describeForEmbedding(item) {
  const deathReason = item.deaths?.[0]?.reason ?? "unknown";
  const body = typeof item.content === "string" ? item.content : JSON.stringify(item.content);
  return `${item.routingKey} ${deathReason} ${body.slice(0, 300)}`;
}

program.parseAsync();
