import { z } from 'zod';

export const ExecuteSanitizationSchema = z.object({
  sourceArtifactId: z.string().optional(),
  operation: z.enum(['SANITY_STRIP', 'SANITY_MUTATE', 'FULL_CLEAN']).optional().default('FULL_CLEAN'),
  policyOptions: z
    .object({
      stripAuthor: z.boolean().optional(),
      stripTimestamps: z.boolean().optional(),
      stripComments: z.boolean().optional(),
      stripTrackedRevisions: z.boolean().optional(),
      stripHiddenSheets: z.boolean().optional(),
      stripSpeakerNotes: z.boolean().optional(),
      stripExif: z.boolean().optional(),
      stripGps: z.boolean().optional(),
      stripDeviceMetadata: z.boolean().optional(),
      sanitizeFilename: z.boolean().optional(),
    })
    .optional(),
  force: z.boolean().optional().default(false),
  async: z.boolean().optional().default(false),
});

export type ExecuteSanitizationInput = z.infer<typeof ExecuteSanitizationSchema>;
