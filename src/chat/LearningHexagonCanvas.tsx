import { useEffect, useMemo, useRef } from "react";

import type { LearningSubject, LearningWeaknessDto } from "../api/learning.js";
import {
  calculateSubjectHexagonScores,
  categoryLabels,
  subjectLabels,
  type SubjectHexagonScore,
} from "./learningHexagon.js";

interface LearningHexagonCanvasProps {
  weaknesses: LearningWeaknessDto[];
}

const subjectColors: Record<LearningSubject, string> = {
  chinese: "#2563eb",
  english: "#0f9f7a",
  math: "#d97706",
};

const subjects: LearningSubject[] = ["chinese", "english", "math"];

function hexPoint(
  centerX: number,
  centerY: number,
  radius: number,
  index: number,
  total: number,
) {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / total;
  return {
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius,
  };
}

function drawPolygon(
  context: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
) {
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.closePath();
}

function drawSubjectHexagon(
  context: CanvasRenderingContext2D,
  score: SubjectHexagonScore,
  centerX: number,
  centerY: number,
  radius: number,
) {
  const color = subjectColors[score.subject];
  const axisPoints = score.axes.map((_, index) =>
    hexPoint(centerX, centerY, radius, index, score.axes.length),
  );
  context.save();
  context.strokeStyle = "#dbe4ee";
  context.lineWidth = 1;
  context.beginPath();
  drawPolygon(context, axisPoints);
  context.stroke();

  context.strokeStyle = "#e8eef6";
  axisPoints.forEach((point) => {
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(point.x, point.y);
    context.stroke();
  });

  const valuePoints = score.axes.map((axis, index) => {
    const value = score.dimensions[axis] ?? 100;
    return hexPoint(centerX, centerY, (radius * value) / 100, index, score.axes.length);
  });
  context.beginPath();
  drawPolygon(context, valuePoints);
  context.fillStyle = `${color}24`;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.fill();
  context.stroke();

  context.fillStyle = "#1f2a3d";
  context.font = "600 12px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText(score.label, centerX, centerY + radius + 24);

  context.fillStyle = "#64748b";
  context.font = "10px system-ui, sans-serif";
  score.axes.forEach((axis, index) => {
    const point = hexPoint(centerX, centerY, radius + 12, index, score.axes.length);
    context.fillText(categoryLabels[axis] ?? axis, point.x, point.y + 3);
  });
  context.restore();
}

export function LearningHexagonCanvas({ weaknesses }: LearningHexagonCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scores = useMemo(
    () => calculateSubjectHexagonScores(weaknesses),
    [weaknesses],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#fbfcfe";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const centers = [
      { x: 76, y: 86 },
      { x: 180, y: 86 },
      { x: 284, y: 86 },
    ];
    subjects.forEach((subject, index) => {
      drawSubjectHexagon(context, scores[subject], centers[index].x, centers[index].y, 42);
    });

    if (weaknesses.length === 0) {
      context.fillStyle = "#64748b";
      context.font = "12px system-ui, sans-serif";
      context.textAlign = "center";
      context.fillText("暂无明显薄弱点", canvas.width / 2, canvas.height - 16);
    }
  }, [scores, weaknesses.length]);

  return (
    <div className="learning-hexagon-block">
      <p className="learning-hexagon-summary">按语文、英语、数学展示学习关注点</p>
      <canvas
        ref={canvasRef}
        className="learning-hexagon-canvas"
        width={360}
        height={220}
        aria-label="语文、英语、数学学习画像六边形图"
      />
      <div className="learning-hexagon-legend" aria-hidden="true">
        {subjects.map((subject) => (
          <span key={subject}>{subjectLabels[subject]}</span>
        ))}
      </div>
    </div>
  );
}
