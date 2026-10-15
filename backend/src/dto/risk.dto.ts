import { z } from 'zod';

export const ExecuteRiskAnalysisSchema = z.object({
  sanitizedArtifactId: z.string().optional(),
  force: z.boolean().optional().default(false),
  async: z.boolean().optional().default(false),
  riskModelVersion: z.string().optional().default('1.0.0'),
});

export type ExecuteRiskAnalysisInput = z.infer<typeof ExecuteRiskAnalysisSchema>;
