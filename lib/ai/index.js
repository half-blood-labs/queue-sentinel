import * as ollama from "./ollama.js";
import * as openai from "./openai.js";

const provider = process.env.AI_PROVIDER ?? "ollama";

const adapters = { ollama, openai };

if (!adapters[provider]) {
  throw new Error(`Unknown AI_PROVIDER "${provider}", expected "ollama" or "openai"`);
}

export const { embed, chat } = adapters[provider];
