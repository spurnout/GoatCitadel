import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const bodySchema = z.object({
  toolName: z.string().min(1),
  args: z.record(z.unknown()),
  agentId: z.string().min(1),
  sessionId: z.string().min(1),
  taskId: z.string().optional(),
  consentContext: z.object({
    operatorId: z.string().optional(),
    source: z.enum(["ui", "tui", "agent"]).optional(),
    reason: z.string().optional(),
  }).optional(),
  dryRun: z.boolean().optional(),
});

export const toolsInvokeRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post("/api/v1/tools/invoke", async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const requestInput = parsed.data;
    if (fastify.gateway.isFeatureEnabled("computerUseGuardrailsV1Enabled")) {
      const safety = evaluateComputerUseSafety(requestInput.toolName, requestInput.args);
      if (safety.requiresVerification && !safety.verified) {
        return reply.code(409).send({
          error: "Computer-use guardrail: this mutating browser action requires step verification (set args.verifyStep=true).",
          details: safety,
        });
      }
      if (safety.requiresConfirmation && !safety.confirmed) {
        return reply.code(409).send({
          error: "Computer-use guardrail: confirm-before-submit required (set args.confirmBeforeSubmit=true).",
          details: safety,
        });
      }
      requestInput.args = {
        ...requestInput.args,
        __gcSafety: {
          verified: safety.verified,
          confirmed: safety.confirmed,
          enforced: true,
        },
      };
    }

    const result = await fastify.gateway.invokeTool(requestInput);
    return reply.send(result);
  });
};

function evaluateComputerUseSafety(
  toolName: string,
  args: Record<string, unknown>,
): {
  requiresVerification: boolean;
  requiresConfirmation: boolean;
  verified: boolean;
  confirmed: boolean;
} {
  const isBrowserInteract = toolName === "browser.interact";
  const steps = Array.isArray(args.steps) ? args.steps as Array<Record<string, unknown>> : [];
  const mutatingStep = steps.some((step) => {
    const action = typeof step.action === "string" ? step.action : "";
    return action === "click" || action === "type" || action === "press";
  });
  const requiresVerification = isBrowserInteract && mutatingStep;
  const requiresConfirmation = isBrowserInteract && mutatingStep;
  const verified = args.verifyStep === true;
  const confirmed = args.confirmBeforeSubmit === true;
  return {
    requiresVerification,
    requiresConfirmation,
    verified,
    confirmed,
  };
}
