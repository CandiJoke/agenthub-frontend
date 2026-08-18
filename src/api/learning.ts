import { requestJson } from "../request/http.js";

export type LearningSubject = "chinese";
export type LearningGrade = "first_grade";
export type WeaknessCategory =
  | "pinyin"
  | "character_recognition"
  | "reading"
  | "expression"
  | "learning_habit";
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

export function getDefaultChildProfile(userId: string): Promise<ChildProfileDto> {
  return requestJson<ChildProfileDto>(
    `/users/${encodeURIComponent(userId)}/children/default/profile`,
  );
}

export function listDefaultChildWeaknesses(
  userId: string,
): Promise<LearningWeaknessDto[]> {
  return requestJson<LearningWeaknessDto[]>(
    `/users/${encodeURIComponent(userId)}/children/default/weaknesses`,
  );
}
