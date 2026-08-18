import type { LearningSubject, LearningWeaknessDto } from "../api/learning.js";

export const subjectLabels: Record<LearningSubject, string> = {
  chinese: "语文",
  english: "英语",
  math: "数学",
};

export const categoryLabels: Record<string, string> = {
  pinyin: "拼音",
  character_recognition: "识字",
  reading: "朗读",
  expression: "表达",
  learning_habit: "习惯",
  listening: "听音",
  phonics: "拼读",
  vocabulary: "词汇",
  speaking: "口语",
  number_sense: "数感",
  calculation: "计算",
  word_problem: "应用",
  geometry: "图形",
  overall: "综合",
};

export const subjectDimensions = {
  chinese: [
    "pinyin",
    "character_recognition",
    "reading",
    "expression",
    "learning_habit",
  ],
  english: ["listening", "phonics", "vocabulary", "speaking", "learning_habit"],
  math: [
    "number_sense",
    "calculation",
    "word_problem",
    "geometry",
    "learning_habit",
  ],
} as const;

const severityPenalty = { mild: 12, medium: 24, high: 36 } as const;
const statusWeight = { active: 1, improving: 0.5, resolved: 0 } as const;

export type SubjectHexagonScore = {
  subject: LearningSubject;
  label: string;
  axes: string[];
  dimensions: Record<string, number>;
};

export function calculateSubjectHexagonScores(
  weaknesses: LearningWeaknessDto[],
): Record<LearningSubject, SubjectHexagonScore> {
  const result = {} as Record<LearningSubject, SubjectHexagonScore>;
  (Object.keys(subjectDimensions) as LearningSubject[]).forEach((subject) => {
    const axes: string[] = Array.from(subjectDimensions[subject]);
    const dimensions = Object.fromEntries(axes.map((axis) => [axis, 100]));
    weaknesses
      .filter((item) => item.subject === subject)
      .forEach((item) => {
        if (!(item.category in dimensions)) return;
        const penalty = severityPenalty[item.severity] * statusWeight[item.status];
        dimensions[item.category] = Math.max(
          35,
          Math.round(dimensions[item.category] - penalty),
        );
      });
    const overall = Math.round(
      axes.reduce((total, axis) => total + dimensions[axis], 0) / axes.length,
    );
    result[subject] = {
      subject,
      label: subjectLabels[subject],
      axes: axes.concat(["overall"]),
      dimensions: Object.assign({}, dimensions, { overall }),
    };
  });
  return result;
}
