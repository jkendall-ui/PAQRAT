import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const NCCPA_TASK_AREAS =
  'History Taking and Performing Physical Examinations, Using Diagnostic and Laboratory Studies, Formulating Most Likely Diagnosis, Health Maintenance, Clinical Intervention, Pharmaceutical Therapeutics, Applying Basic Science Concepts';

const NCCPA_CATEGORIES = [
  { name: 'Cardiovascular System', weight: 16 },
  { name: 'Pulmonary System', weight: 12 },
  { name: 'Gastrointestinal System / Nutritional', weight: 10 },
  { name: 'Musculoskeletal System', weight: 10 },
  { name: 'Eyes, Ears, Nose, and Throat', weight: 9 },
  { name: 'Reproductive System', weight: 8 },
  { name: 'Neurologic System', weight: 7 },
  { name: 'Psychiatry / Behavioral Science', weight: 6 },
  { name: 'Dermatologic System', weight: 6 },
  { name: 'Endocrine System', weight: 6 },
  { name: 'Genitourinary System', weight: 6 },
  { name: 'Hematologic System', weight: 5 },
  { name: 'Infectious Disease', weight: 3 },
  { name: 'Renal System', weight: 3 },
];

async function main() {
  // Seed NCCPA categories (idempotent via findFirst + create/update)
  let seededCount = 0;
  for (const category of NCCPA_CATEGORIES) {
    const existing = await prisma.category.findFirst({
      where: { name: category.name },
    });

    if (existing) {
      await prisma.category.update({
        where: { id: existing.id },
        data: { ncpaTaskArea: NCCPA_TASK_AREAS },
      });
    } else {
      await prisma.category.create({
        data: {
          name: category.name,
          ncpaTaskArea: NCCPA_TASK_AREAS,
        },
      });
      seededCount++;
    }
  }
  console.log(
    `Seeded ${NCCPA_CATEGORIES.length} NCCPA categories (${seededCount} new, ${NCCPA_CATEGORIES.length - seededCount} updated)`
  );

  // Seed admin user (idempotent via upsert on unique googleId)
  await prisma.user.upsert({
    where: { googleId: 'admin-seed-google-id' },
    update: {
      email: 'admin@paexamprep.com',
      name: 'Admin User',
      role: 'admin',
      plan: 'free',
    },
    create: {
      googleId: 'admin-seed-google-id',
      email: 'admin@paexamprep.com',
      name: 'Admin User',
      role: 'admin',
      plan: 'free',
    },
  });
  console.log('Seeded admin user (admin@paexamprep.com)');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
