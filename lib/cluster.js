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
export function clusterBySimilarity(items, threshold = 0.87) {
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
