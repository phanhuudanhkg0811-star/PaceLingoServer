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
      'For each question in this part, you will hear four statements about a picture in your test book. When you hear the statements, you must select the one statement that best describes what you see in the picture. Then find the number of the question on your answer sheet and mark your answer. The statements will not be printed in your test book and will be spoken only one time.',
  },
  {
    part: 'PART_2',
    directionText:
      'You will hear a question or statement and three responses spoken in English. They will not be printed in your test book and will be spoken only one time. Select the best response to the question or statement and mark the letter (A), (B), or (C) on your answer sheet.',
  },
  {
    part: 'PART_3',
    directionText:
      'You will hear some conversations between two or more people. You will be asked to answer three questions about what the speakers say in each conversation. Select the best response to each question and mark the letter (A), (B), (C), or (D) on your answer sheet. The conversations will not be printed in your test book and will be spoken only one time. Some questions may require responses based on visual information.',
  },
  {
    part: 'PART_4',
    directionText:
      'You will hear some talks given by a single speaker. You will be asked to answer three questions about what the speaker says in each talk. Select the best response to each question and mark the letter (A), (B), (C), or (D) on your answer sheet. The talks will not be printed in your test book and will be spoken only one time. Some questions may require responses based on visual information.',
  },
  {
    part: 'PART_5',
    directionText:
      'A word or phrase is missing in each of the sentences below. Four answer choices are given below each sentence. Select the best answer to complete the sentence. Then mark the letter (A), (B), (C), or (D) on your answer sheet.',
  },
  {
    part: 'PART_6',
    directionText:
      'Read the texts that follow. A word, phrase, or sentence is missing in parts of each text. Four answer choices for each question are given below the text. Select the best answer to complete the text. Then mark the letter (A), (B), (C), or (D) on your answer sheet.',
  },
  {
    part: 'PART_7',
    directionText:
      'In this part you will read a selection of texts, such as magazine and newspaper articles, e-mails, and instant messages. Each text or set of texts is followed by several questions. Select the best answer for each question and mark the letter (A), (B), (C), or (D) on your answer sheet.',
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

  let syncedDirections = 0;
  for (const direction of defaultDirections) {
    await prisma.directionTemplate.upsert({
      where: {
        part_language_version: {
          part: direction.part,
          language: 'en',
          version: 1,
        },
      },
      create: {
        ...direction,
        language: 'en',
        version: 1,
        isDefault: true,
      },
      update: {
        directionText: direction.directionText,
        exampleHtml: direction.exampleHtml ?? null,
        isDefault: true,
      },
    });
    syncedDirections += 1;
  }

  console.log(
    syncedDirections
      ? `Synced ${syncedDirections} default English direction(s)`
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
