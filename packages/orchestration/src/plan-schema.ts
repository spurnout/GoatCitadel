import { z } from "zod";

export const phaseSchema = z.object({
  phaseId: z.string().min(1),
  ownerAgentId: z.string().min(1),
  specPath: z.string().min(1),
  loopMode: z.enum(["fresh-context", "compaction"]),
  requiresApproval: z.boolean(),
});

export const waveSchema = z.object({
  waveId: z.string().min(1),
  verify: z.array(z.string().min(1)).default([]),
  budgetUsd: z.number().nonnegative(),
  ownership: z.array(
    z.object({
      agentId: z.string().min(1),
      paths: z.array(z.string().min(1)).min(1),
    }),
  ),
  phases: z.array(phaseSchema).min(1),
});

export const planSchema = z.object({
  planId: z.string().min(1),
  goal: z.string().min(1),
  mode: z.enum(["auto", "hitl"]),
  maxIterations: z.number().int().positive(),
  maxRuntimeMinutes: z.number().int().positive(),
  maxCostUsd: z.number().positive(),
  waves: z.array(waveSchema).min(1),
});

export type ParsedPlan = z.infer<typeof planSchema>;

export function validatePlan(input: unknown): ParsedPlan {
  return planSchema.parse(input);
}