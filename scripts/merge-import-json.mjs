import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const outputIndex = args.indexOf('--out');
const output = outputIndex >= 0 ? args[outputIndex + 1] : null;

if (outputIndex >= 0) {
  args.splice(outputIndex, 2);
}

if (!output || args.length < 2) {
  console.error(
    'Usage: npm run merge:imports --workspace pace-lingo-server -- --out "merged.json" "fragment-1.json" "fragment-2.json"',
  );
  process.exit(2);
}

function load(file) {
  const resolved = path.resolve(file);
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    throw new Error(
      `Cannot parse ${resolved}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (payload?.schemaVersion !== 1 || !Array.isArray(payload?.sections)) {
    throw new Error(
      `${resolved} is not a PaceLingo schemaVersion 1 import file.`,
    );
  }
  return { resolved, payload };
}

function sectionKey(section) {
  return `${section?.kind ?? ''}:${section?.part ?? ''}`;
}

function partNumber(part) {
  const match = String(part ?? '').match(/(\d+)/);
  return match ? Number(match[1]) : 99;
}

try {
  const sources = args.map(load);
  const first = structuredClone(sources[0].payload);
  const sections = new Map();

  for (const { payload } of sources) {
    for (const rawSection of payload.sections) {
      const section = structuredClone(rawSection);
      const key = sectionKey(section);
      const groups = Array.isArray(section.questionGroups)
        ? section.questionGroups
        : Array.isArray(section.groups)
          ? section.groups
          : [];

      if (!sections.has(key)) {
        section.questionGroups = [];
        delete section.groups;
        sections.set(key, section);
      }
      sections.get(key).questionGroups.push(...groups);
    }
  }

  const questionNumbers = new Map();
  const groupExternalIds = new Map();
  const mergedSections = [...sections.values()].sort(
    (left, right) => partNumber(left.part) - partNumber(right.part),
  );

  mergedSections.forEach((section, sectionIndex) => {
    section.order = sectionIndex;
    section.questionGroups.sort((left, right) => {
      const leftNumber = Math.min(
        ...(left.questions ?? []).map((item) => Number(item.number)),
      );
      const rightNumber = Math.min(
        ...(right.questions ?? []).map((item) => Number(item.number)),
      );
      return leftNumber - rightNumber;
    });

    section.questionGroups.forEach((group, groupIndex) => {
      group.order = groupIndex;
      const externalId =
        typeof group.externalId === 'string' ? group.externalId : null;
      if (externalId) {
        if (groupExternalIds.has(externalId)) {
          throw new Error(
            `Duplicate group externalId ${externalId} in ${section.part}; first seen at ${groupExternalIds.get(externalId)}.`,
          );
        }
        groupExternalIds.set(externalId, `${section.part} group ${groupIndex}`);
      }

      if (Array.isArray(group.stimuli)) {
        group.stimuli.forEach((stimulus, stimulusIndex) => {
          stimulus.order = stimulusIndex;
        });
      }

      group.questions = Array.isArray(group.questions) ? group.questions : [];
      group.questions.sort(
        (left, right) => Number(left.number) - Number(right.number),
      );
      group.questions.forEach((question, questionIndex) => {
        const number = Number(question.number);
        if (questionNumbers.has(number)) {
          throw new Error(
            `Duplicate question ${number}: ${section.part} group ${groupIndex}; first seen at ${questionNumbers.get(number)}.`,
          );
        }
        questionNumbers.set(number, `${section.part} group ${groupIndex}`);
        question.order = questionIndex;
        if (Array.isArray(question.options)) {
          question.options.forEach((option, optionIndex) => {
            if (option && typeof option === 'object')
              option.order = optionIndex;
          });
        }
      });
    });
  });

  first.sections = mergedSections;
  const resolvedOutput = path.resolve(output);
  fs.writeFileSync(
    resolvedOutput,
    `${JSON.stringify(first, null, 2)}\n`,
    'utf8',
  );
  console.log(`Merged ${sources.length} fragment(s) into ${resolvedOutput}`);
  console.log(
    `Sections ${mergedSections.length} | Questions ${questionNumbers.size}`,
  );
  console.log('Run audit:import on the merged file before importing.');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
