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
  sourceRunId?: string;
  createdAt: string;
  updatedAt: string;
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
