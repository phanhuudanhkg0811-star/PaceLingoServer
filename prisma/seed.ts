import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role, type ToeicPart } from '../generated/prisma/client';

const adminEmail = 'phanhuudanhkg123@gmail.com';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed the database');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const defaultDirections: Array<{
  part: ToeicPart;
  directionText: string;
  exampleHtml?: string;
}> = [
  {
    part: 'PART_1',
    directionText:
      'For each question, look at the photograph and listen to four statements. Choose the statement that best describes the photograph. The statements are played once and are not shown on screen.',
    exampleHtml:
      '<p>Look at the photograph, listen to all four choices, then select the best description.</p>',
  },
  {
    part: 'PART_2',
    directionText:
      'Listen to a question or statement followed by three responses. Choose the most appropriate response. The audio is played once and the choices are not shown on screen.',
    exampleHtml:
      '<p>Listen for the speaker’s intent, then select the most natural response.</p>',
  },
  {
    part: 'PART_3',
    directionText:
      'Listen to each conversation and answer the three questions that follow. Choose the best answer for each question. Each conversation is played once.',
  },
  {
    part: 'PART_4',
    directionText:
      'Listen to each talk and answer the three questions that follow. Choose the best answer for each question. Each talk is played once.',
  },
  {
    part: 'PART_5',
    directionText:
      'Each sentence is missing a word or phrase. Choose the answer that best completes the sentence.',
  },
  {
    part: 'PART_6',
    directionText:
      'Read each text. Choose the best word, phrase, or sentence to complete each blank.',
  },
  {
    part: 'PART_7',
    directionText:
      'Read the documents and choose the best answer to each question. Some questions refer to more than one document.',
  },
];

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      googleSubject: `seed:${adminEmail}`,
      name: 'PaceLingo Admin',
      role: Role.ADMIN,
    },
    update: {
      role: Role.ADMIN,
    },
  });

  console.log(`Seeded admin user: ${admin.email} (${admin.id})`);

  let createdDirections = 0;
  for (const direction of defaultDirections) {
    const existing = await prisma.directionTemplate.count({
      where: { part: direction.part, language: 'en' },
    });
    if (existing > 0) continue;
    await prisma.directionTemplate.create({
      data: {
        ...direction,
        language: 'en',
        version: 1,
        isDefault: true,
      },
    });
    createdDirections += 1;
  }

  console.log(
    createdDirections
      ? `Seeded ${createdDirections} default English direction(s)`
      : 'Default English directions already exist',
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
