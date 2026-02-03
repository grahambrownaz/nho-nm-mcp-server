/**
 * Template Seeding Script
 * Seeds the database with starter templates
 */

import { prisma } from '../db/client.js';
import { starterTemplates } from './starter-templates.js';

/**
 * Seed starter templates into the database
 */
export async function seedStarterTemplates(): Promise<{
  created: number;
  skipped: number;
  errors: string[];
}> {
  const results = {
    created: 0,
    skipped: 0,
    errors: [] as string[],
  };

  console.log(`[Seed] Seeding ${starterTemplates.length} starter templates...`);

  for (const template of starterTemplates) {
    try {
      // Check if template already exists (by name)
      const existing = await prisma.template.findFirst({
        where: {
          name: template.name,
          tenantId: null, // System templates have no tenant
        },
      });

      if (existing) {
        console.log(`[Seed] Skipping existing template: ${template.name}`);
        results.skipped++;
        continue;
      }

      // Create the template
      await prisma.template.create({
        data: {
          tenantId: null, // System template
          name: template.name,
          description: template.description,
          category: template.category,
          size: template.size,
          htmlFront: template.htmlFront,
          htmlBack: template.htmlBack,
          cssStyles: template.cssStyles,
          mergeFields: template.mergeFields,
          isPublic: true,
          isActive: true,
        },
      });

      console.log(`[Seed] Created template: ${template.name}`);
      results.created++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Seed] Error creating template ${template.name}: ${errorMessage}`);
      results.errors.push(`${template.name}: ${errorMessage}`);
    }
  }

  console.log(
    `[Seed] Complete. Created: ${results.created}, Skipped: ${results.skipped}, Errors: ${results.errors.length}`
  );

  return results;
}

/**
 * Clear all system templates (for testing)
 */
export async function clearSystemTemplates(): Promise<number> {
  const result = await prisma.template.deleteMany({
    where: {
      tenantId: null,
    },
  });

  console.log(`[Seed] Deleted ${result.count} system templates`);
  return result.count;
}

/**
 * Get counts of templates by category
 */
export async function getTemplateCounts(): Promise<
  Array<{ category: string; count: number }>
> {
  const counts = await prisma.template.groupBy({
    by: ['category'],
    where: {
      isActive: true,
    },
    _count: {
      category: true,
    },
  });

  return counts.map((c) => ({
    category: c.category,
    count: c._count.category,
  }));
}

// Allow running directly
if (process.argv[1]?.endsWith('seed-templates.ts')) {
  seedStarterTemplates()
    .then((results) => {
      console.log('Seeding results:', results);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}
