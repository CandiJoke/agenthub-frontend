import type {
  ChildProfileDto,
  LearningWeaknessDto,
  WeaknessCategory,
  WeaknessSeverity,
  WeaknessStatus,
} from "../api/learning.js";
import { LearningHexagonCanvas } from "./LearningHexagonCanvas.js";
import { subjectLabels } from "./learningHexagon.js";

interface LearningProfilePanelProps {
  profile?: ChildProfileDto;
  weaknesses?: LearningWeaknessDto[];
  loading: boolean;
  error?: string;
  onRetry: () => void;
}

const categoryLabels: Record<WeaknessCategory, string> = {
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
};

const severityLabels: Record<WeaknessSeverity, string> = {
  mild: "轻微",
  medium: "中等",
  high: "明显",
};

const statusLabels: Record<WeaknessStatus, string> = {
  active: "进行中",
  improving: "改善中",
  resolved: "已解决",
};

function gradeLabel(grade?: string): string {
  if (grade === "first_grade") return "一年级";
  return "一年级";
}

function formatUpdatedAt(updatedAt: string): string {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hour}:${minute}`;
}

function activeWeaknessCount(weaknesses: LearningWeaknessDto[]): number {
  return weaknesses.filter((item) => item.status !== "resolved").length;
}

export function LearningProfilePanel({
  profile,
  weaknesses = [],
  loading,
  error,
  onRetry,
}: LearningProfilePanelProps) {
  const activeCount = activeWeaknessCount(weaknesses);

  return (
    <section className="learning-profile-panel" aria-label="学习画像">
      <div className="learning-profile-header">
        <span>学习画像</span>
        <span>{gradeLabel(profile?.grade)}</span>
      </div>

      {error && (
        <div className="learning-profile-error">
          <span>{error}</span>
          <button type="button" onClick={onRetry}>
            重试
          </button>
        </div>
      )}

      {loading && <div className="learning-profile-loading">加载中...</div>}

      {!loading && !error && (
        <>
          <LearningHexagonCanvas weaknesses={weaknesses} />

          <div className="learning-profile-metrics">
            <div>
              <strong>{activeCount}</strong>
              <span>进行中</span>
            </div>
            <div>
              <strong>{weaknesses.length}</strong>
              <span>累计记录</span>
            </div>
          </div>

          {weaknesses.length === 0 && (
            <div className="learning-profile-empty">暂无薄弱点记录</div>
          )}

          {weaknesses.length > 0 && (
            <ol className="learning-weakness-list">
              {weaknesses.map((weakness) => (
                <li className="learning-weakness-row" key={weakness.weaknessId}>
                  <div className="learning-weakness-main">
                    <span>{weakness.title}</span>
                    <p>{weakness.evidence}</p>
                  </div>
                  <div className="learning-weakness-meta">
                    <span>{subjectLabels[weakness.subject]}</span>
                    <span>{categoryLabels[weakness.category]}</span>
                    <span>{severityLabels[weakness.severity]}</span>
                    <span>{statusLabels[weakness.status]}</span>
                    <span className="learning-weakness-time">
                      更新 {formatUpdatedAt(weakness.updatedAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
