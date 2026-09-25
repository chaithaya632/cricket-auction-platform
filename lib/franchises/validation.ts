// =============================================================================
// ACC Auction Portal — Franchise Validation Schemas
// =============================================================================

import { z } from 'zod';

export const adminCreateFranchiseSchema = z.object({
  name: z.string().trim().min(2, 'Team name must be at least 2 characters').max(50),
  short_name: z
    .string()
    .trim()
    .min(2, 'Short code must be 2-5 characters')
    .max(5, 'Short code must be 2-5 characters')
    .toUpperCase(),
  color_primary: z.string().trim().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color').optional().default('#0284c7'),
  color_secondary: z.string().trim().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color').optional().default('#38bdf8'),
  faculty_coordinator_name: z.string().trim().max(100).optional(),
  faculty_coordinator_mobile: z.string().trim().regex(/^[6-9]\d{9}$/, 'Must be a 10-digit phone number').optional().or(z.literal('')),
});

export type AdminCreateFranchiseInput = z.infer<typeof adminCreateFranchiseSchema>;
