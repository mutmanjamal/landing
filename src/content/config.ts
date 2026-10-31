import { defineCollection, z } from 'astro:content';

const projects = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    summary: z.string(),           // one sentence, an outcome
    stack: z.array(z.string()),
    status: z.enum(['shipped', 'in progress']),
    role: z.string(),              // what Mutman decided/did
    ai_note: z.string(),           // what AI wrote vs what he owned
    links: z.array(z.object({
      label: z.string(),
      url: z.string(),
    })).default([]),
    media: z.array(z.object({
      src: z.string(),
      alt: z.string(),
    })).default([]),
    order: z.number(),             // lower = shown first
    featured: z.boolean().default(false), // featured = wider row
  }),
});

export const collections = { projects };
