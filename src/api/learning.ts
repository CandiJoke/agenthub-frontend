import { requestJson } from "../request/http.js";

export type LearningSubject = "chinese" | "english" | "math";
export type LearningGrade =
  | "grade_1"
  | "grade_2"
  | "grade_3"
  | "grade_4"
  | "grade_5"
  | "grade_6";
export type WeaknessCategory =
  | "pinyin"
  | "character_recognition"
  | "reading"
  | "expression"
  | "learning_habit"
  | "listening"
  | "phonics"
  | "vocabulary"
  | "speaking"
  | "number_sense"
  | "calculation"
  | "word_problem"
  | "geometry";
export type WeaknessSeverity = "mild" | "medium" | "high";
export type WeaknessStatus = "active" | "improving" | "resolved";

export interface ChildProfileDto {
  userId: string;
  childId: string;
  displayName: string;
  grade: LearningGrade;
  createdAt: string;
  updatedAt: string;
}

export interface LearningWeaknessDto {
  weaknessId: string;
  userId: string;
  childId: string;
  subject: LearningSubject;
  grade: LearningGrade;
  category: WeaknessCategory;
  title: string;
  evidence: string;
  severity: WeaknessSeverity;
  status: WeaknessStatus;
  abilityId?: string;
  abilityTitle?: string;
  behaviorId?: string;
  behaviorTitle?: string;
  matchConfidence?: number;
  sourceRunId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CurriculumBehaviorDto {
  behaviorId: string;
  title: string;
  evidenceExamples?: string[];
}

export interface CurriculumAbilityDto {
  abilityId: string;
  title: string;
  category: WeaknessCategory;
  behaviors: CurriculumBehaviorDto[];
}

export interface CurriculumDomainDto {
  domainId: string;
  title: string;
  abilities: CurriculumAbilityDto[];
}

export interface CurriculumSubjectDto {
  subject: LearningSubject;
  label: string;
  availability?: string;
  domains: CurriculumDomainDto[];
}

export interface CurriculumGradeDto {
  schemaVersion: "curriculum_tree.v1";
  stage: "primary";
  grade: LearningGrade;
  gradeLabel: string;
  subjects: CurriculumSubjectDto[];
}

export interface UpdateChildProfileRequest {
  grade: LearningGrade;
}

export function getDefaultChildProfile(userId: string): Promise<ChildProfileDto> {
  return requestJson<ChildProfileDto>(
    `/users/${encodeURIComponent(userId)}/children/default/profile`,
  );
}

export function updateDefaultChildProfile(
  userId: string,
  request: UpdateChildProfileRequest,
): Promise<ChildProfileDto> {
  return requestJson<ChildProfileDto>(
    `/users/${encodeURIComponent(userId)}/children/default/profile`,
    {
      method: "PATCH",
      body: JSON.stringify(request),
    },
  );
}

export function getPrimaryGradeCurriculum(
  grade: LearningGrade,
): Promise<CurriculumGradeDto> {
  return requestJson<CurriculumGradeDto>(
    `/curriculum/primary/grades/${encodeURIComponent(grade)}`,
  );
}

export function listDefaultChildWeaknesses(
  userId: string,
  options: { subject?: LearningSubject } = {},
): Promise<LearningWeaknessDto[]> {
  const query = options.subject
    ? `?subject=${encodeURIComponent(options.subject)}`
    : "";
  return requestJson<LearningWeaknessDto[]>(
    `/users/${encodeURIComponent(userId)}/children/default/weaknesses${query}`,
  );
}
