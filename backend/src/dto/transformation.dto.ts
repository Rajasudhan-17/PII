import { z } from 'zod';

export const ExecuteTransformationSchema = z.object({
  decisionRunId: z.string().optional(),
  operation: z.enum(['REDACTION', 'MUTATION']).optional().default('REDACTION'),
  force: z.boolean().optional().default(false),
  async: z.boolean().optional().default(false),
});

export type ExecuteTransformationInput = z.infer<typeof ExecuteTransformationSchema>;
