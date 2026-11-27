import { type Model } from "@earendil-works/pi-ai";
import {
  createCodingTools,
  createReadOnlyTools,
  type ExtensionAPI,
  type ExtensionToolContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Minion } from "./minion";

export default function(pi: ExtensionAPI) {
  pi.registerTool({
    name: "minion",
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
      readOnly: Type.Optional(
        Type.Boolean({
          description: "Whether to give it only read only tools. True if omitted",
          default: true,
        }),
      ),
    }),

    async execute(_toolCallId, args, signal, _onUpdate, ctx) {
      signal?.throwIfAborted();

      args.thinkingLevel ??= "off";
      args.readOnly ??= true;

      const model = resolveModel(args.model, ctx);
      const tools = args.readOnly ? createReadOnlyTools(ctx.cwd) : createCodingTools(ctx.cwd);
      const minion = new Minion(model, args.thinkingLevel, ctx.modelRegistry, tools);

      return await minion.execute(args.prompt, signal);
    },
  });
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
