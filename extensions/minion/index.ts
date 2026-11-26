import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { contentText, type Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const MINION_TOOL_NAME = "minion";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: MINION_TOOL_NAME,
    label: "Minion",
    description: "Delegate a self-contained task to a fresh Pi agent and return its final reply.",
    exposure: "model-only",
    parameters: Type.Object({
      prompt: Type.String({ description: "Task instructions for the minion." }),
      model: Type.Optional(
        Type.String({ description: "Model as provider/id; omit to inherit the parent model." }),
      ),
      thinkingLevel: Type.Optional(
        Type.Enum(["off", "low", "medium", "high"], {
          description: "Thinking effort; off if omitted.",
          default: "off",
        }),
      ),
    }),

    async execute(_toolCallId, args, signal, _onUpdate, ctx) {
      signal?.throwIfAborted();

      const model = resolveModel(args.model, ctx);
      const tools = forwardTools(new Set(pi.getActiveTools()), ctx);

      const agent = new Agent({
        initialState: {
          model,
          thinkingLevel: args.thinkingLevel,
          systemPrompt: `You are a Pi subagent working in ${ctx.cwd}. Complete the delegated task and give a concise final reply to the parent agent. You do not have the parent conversation.`,
          tools,
        },
        streamFn: (model, context, options) =>
          ctx.modelRegistry.streamSimple(model, context, options),
      });

      const abort = () => agent.abort();
      signal?.addEventListener("abort", abort, { once: true });

      try {
        await agent.prompt(args.prompt);

        signal?.throwIfAborted();

        const reply = agent.state.messages.findLast((message) => message.role === "assistant");
        if (reply?.stopReason === "error" || reply?.stopReason === "aborted") {
          throw new Error(reply.errorMessage ?? `Minion run ${reply.stopReason}.`);
        }

        const text = reply ? contentText(reply.content).trim() : undefined;
        if (!text) {
          throw new Error(agent.state.errorMessage ?? "Minion did not return a text reply.");
        }

        return { content: [{ type: "text", text }], details: {} };
      } finally {
        signal?.removeEventListener("abort", abort);
      }
    },
  });
}

function forwardTools(activeTools: Set<string>, ctx: ExtensionToolContext): AgentTool[] {
  const minionTools: AgentTool[] = [];

  for (const tool of ctx.tools) {
    // minions can't spawn other minions
    if (!activeTools.has(tool.name) || tool.name === MINION_TOOL_NAME) {
      continue;
    }

    minionTools.push({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      parameters: tool.parameters,
      constrainedSampling: tool.constrainedSampling,
      outputSchema: tool.outputSchema,
      executionMode: tool.executionMode,
      async execute(_id, args, signal) {
        const { result, isError } = await ctx.executeTool(tool.name, args, { signal });
        return { ...result, isError };
      },
    });
  }

  return minionTools;
}

function resolveModel(modelName: string | undefined, ctx: ExtensionToolContext): Model<any> {
  const model =
    modelName === undefined
      ? ctx.model
      : ctx.modelRegistry.getAll().find((m) => `${m.provider}/${m.id}` === modelName);

  if (!model) {
    throw new Error(
      modelName === undefined ? "No active parent model." : `Unknown model: ${modelName}`,
    );
  }

  return model;
}
