import { z } from 'zod';

export const ExecuteVerificationSchema = z.object({
  outputArtifactId: z.string().optional(),
  force: z.boolean().optional().default(false),
  async: z.boolean().optional().default(false),
  verificationModelVersion: z.string().optional().default('1.0.0'),
});

export type ExecuteVerificationInput = z.infer<typeof ExecuteVerificationSchema>;
