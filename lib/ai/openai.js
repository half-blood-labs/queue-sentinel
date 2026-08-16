const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
const chatModel = process.env.OPENAI_CHAT_MODEL ?? "gpt-4.1-mini";

function apiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  return key;
}

function headers() {
  return {
    authorization: `Bearer ${apiKey()}`,
    "content-type": "application/json",
  };
}

export async function embed(text) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ model: embeddingModel, input: text }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI embeddings failed: ${res.status} ${await res.text()}`);
  }

  const { data } = await res.json();
  return data[0].embedding;
}

export async function chat(messages) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ model: chatModel, messages }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI chat failed: ${res.status} ${await res.text()}`);
  }

  const { choices } = await res.json();
  return choices[0].message.content;
}
