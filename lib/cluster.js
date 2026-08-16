/**
 * Builds the text that actually gets embedded for clustering. Raw message
 * bodies are mostly per-message noise (ids, amounts, timestamps) that swamp
 * the one or two fields that actually explain *why* something failed, so
 * fields that look like unique identifiers or numbers are dropped and only
 * the descriptive/categorical ones are kept.
 */
export function normalizeForEmbedding({ routingKey, deathReason, content }) {
  const prefix = [routingKey, deathReason].filter(Boolean).join(" ");

  if (typeof content !== "object" || content === null) {
    return `${prefix} ${String(content)}`.trim().slice(0, 300);
  }

  const descriptive = Object.entries(content)
    .filter(([key, value]) => typeof value === "string" && !isNoisyField(key, value))
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");

  return `${prefix} ${descriptive}`.trim().slice(0, 300);
}

// Log-clustering tools (Drain3 and friends) mask fields by both name and
// shape for the same reason: a field named `customerId` with value "cust_42"
// won't match a generic id/number regex, but it's still per-message noise
// that has nothing to do with why something failed. Matched on the
// lowercased key so both `customer_id` and `customerId` are caught.
const NOISY_KEY_SUFFIXES = ["id", "uuid", "amount", "price", "total", "timestamp", "date", "time", "ts"];

function isNoisyField(key, value) {
  const lowerKey = key.toLowerCase();
  if (NOISY_KEY_SUFFIXES.some((suffix) => lowerKey.endsWith(suffix))) return true;
  return /^\d+$/.test(value) || /^[0-9a-f-]{8,}$/i.test(value) || /^\d+\.\d+$/.test(value);
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Greedy single-pass clustering: each message joins the first existing
 * cluster whose centroid it's similar enough to, otherwise it starts a new
 * one. Simple, no need to know the number of clusters up front, and good
 * enough for triage-sized batches (tens to low hundreds of messages).
 *
 * @param {Array<{embedding: number[]}>} items
 * @param {number} threshold - cosine similarity to join an existing cluster
 */
export function clusterBySimilarity(items, threshold = 0.9) {
  const clusters = [];

  for (const item of items) {
    const match = clusters.find((c) => cosineSimilarity(c.centroid, item.embedding) >= threshold);

    if (match) {
      match.members.push(item);
    } else {
      clusters.push({ centroid: item.embedding, members: [item] });
    }
  }

  return clusters
    .map((c) => ({ members: c.members, size: c.members.length }))
    .sort((a, b) => b.size - a.size);
}
