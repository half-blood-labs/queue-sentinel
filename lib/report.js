import { chat } from "./ai/index.js";

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

const SYSTEM_PROMPT = `You triage dead-lettered message-queue failures for backend engineers.
You'll be given a handful of representative failed messages that were grouped together
because they look similar. Respond with exactly three lines, no preamble, no markdown:
SUMMARY: <one sentence, plain English, what happened>
ROOT CAUSE: <your best guess at the underlying cause>
SUGGESTED FIX: <a concrete, actionable next step>`;

function describeMessage(item) {
  const deathReason = item.deaths?.[0]?.reason ?? "unknown";
  const deathQueue = item.deaths?.[0]?.queue ?? "unknown";
  const body = typeof item.content === "string" ? item.content : JSON.stringify(item.content);

  return `routing key: ${item.routingKey}\ndeath reason: ${deathReason} (from queue: ${deathQueue})\nbody: ${body.slice(0, 500)}`;
}

export async function summarizeCluster(cluster) {
  const sample = cluster.members.slice(0, 3).map(describeMessage).join("\n---\n");

  const content = await chat([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `${cluster.size} messages in this group. Samples:\n\n${sample}` },
  ]);

  const summary = content.match(/SUMMARY:\s*(.+)/)?.[1]?.trim() ?? content;
  const rootCause = content.match(/ROOT CAUSE:\s*(.+)/)?.[1]?.trim() ?? "";
  const suggestedFix = content.match(/SUGGESTED FIX:\s*(.+)/)?.[1]?.trim() ?? "";

  return { summary, rootCause, suggestedFix, size: cluster.size };
}

export function formatReport(summaries, { totalMessages }) {
  const lines = [];

  lines.push(bold(`Queue Sentinel — triage report`));
  lines.push(dim(`${totalMessages} dead-lettered messages, ${summaries.length} distinct failure group(s)\n`));

  summaries.forEach((s, i) => {
    lines.push(`${bold(`${i + 1}. ${red(`${s.size} messages`)} — ${s.summary}`)}`);
    lines.push(`   ${dim("Root cause:")} ${s.rootCause}`);
    lines.push(`   ${dim("Suggested fix:")} ${s.suggestedFix}\n`);
  });

  return lines.join("\n");
}
