const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text";
const chatModel = process.env.OLLAMA_CHAT_MODEL ?? "llama3.2:3b";

export async function embed(text) {
  const res = await fetch(`${baseUrl}/api/embeddings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: embeddingModel, prompt: text }),
  });

  if (!res.ok) {
    throw new Error(`Ollama embeddings failed: ${res.status} ${await res.text()}`);
  }

  const { embedding } = await res.json();
  return embedding;
}

export async function chat(messages) {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: chatModel, messages, stream: false }),
  });

  if (!res.ok) {
    throw new Error(`Ollama chat failed: ${res.status} ${await res.text()}`);
  }

  const { message } = await res.json();
  return message.content;
}
