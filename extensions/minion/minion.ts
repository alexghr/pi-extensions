import {
  Agent,
  AgentToolResult,
  type AgentTool,
  type ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import { contentText, type Model } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { addAbortListener } from "node:events";

export class Minion {
  static readonly SYSTEM_PROMPT =
    "You are a Pi subagent. Complete the delegated task and give a concise final reply to the parent agent. You do not have the parent conversation.";

  public readonly id = randomUUID();

  #agent: Agent;

  constructor(
    model: Model<any>,
    thinkingLevel: ThinkingLevel | undefined,
    modelRegistry: ModelRegistry,
    tools: AgentTool[],
  ) {
    this.#agent = new Agent({
      initialState: {
        model,
        thinkingLevel: thinkingLevel,
        systemPrompt: Minion.SYSTEM_PROMPT,
        tools,
      },
      streamFn: (model, context, options) => modelRegistry.streamSimple(model, context, options),
    });
  }

  async execute(prompt: string, signal?: AbortSignal): Promise<AgentToolResult<{ id: string }>> {
    signal?.throwIfAborted();

    using _ = signal ? addAbortListener(signal, () => this.#agent.abort()) : undefined;

    await this.#agent.prompt(prompt);
    // not sure what prompt() does on an abort, let's make sure something throws at least
    signal?.throwIfAborted();

    const reply = this.#agent.state.messages.findLast((message) => message.role === "assistant");
    if (reply?.stopReason === "error" || reply?.stopReason === "aborted") {
      throw new Error(reply.errorMessage ?? `Minion run ${reply.stopReason}.`);
    }

    const text = reply ? contentText(reply.content).trim() : undefined;
    if (!text) {
      throw new Error(this.#agent.state.errorMessage ?? "Minion did not return a text reply.");
    }

    return {
      content: [{ type: "text", text: `Minion ID: ${this.id}\n\n${text}` }],
      details: { id: this.id },
    };
  }

  abort(): void {
    this.#agent.abort();
  }
}
