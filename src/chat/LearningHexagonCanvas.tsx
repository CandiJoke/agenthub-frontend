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

const CANVAS_HEIGHT = 248;
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

  context.fillStyle = "#64748b";
  context.font = "10px system-ui, sans-serif";
  context.textBaseline = "middle";
  score.axes.forEach((axis, index) => {
    const point = hexPoint(centerX, centerY, radius + 13, index, score.axes.length);
    const offsetX = point.x - centerX;
    context.textAlign = Math.abs(offsetX) < 4 ? "center" : offsetX < 0 ? "right" : "left";
    context.fillText(categoryLabels[axis] ?? axis, point.x, point.y, 36);
  });
  context.restore();
}

function drawSubjectLabel(
  context: CanvasRenderingContext2D,
  score: SubjectHexagonScore,
  centerX: number,
  centerY: number,
  radius: number,
) {
  context.save();
  context.fillStyle = subjectColors[score.subject];
  context.font = "700 12px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(score.label, centerX, centerY + radius + 46);
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

    const draw = () => {
      const cssWidth = Math.max(
        260,
        Math.round(canvas.getBoundingClientRect().width || canvas.clientWidth || 300),
      );
      const pixelRatio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = Math.round(cssWidth * pixelRatio);
      canvas.height = Math.round(CANVAS_HEIGHT * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, cssWidth, CANVAS_HEIGHT);
      context.fillStyle = "#fbfcfe";
      context.fillRect(0, 0, cssWidth, CANVAS_HEIGHT);

      const chartWidth = cssWidth / subjects.length;
      const radius = Math.min(34, Math.max(28, chartWidth * 0.28));
      const centerY = 96;
      subjects.forEach((subject, index) => {
        const score = scores[subject];
        const centerX = chartWidth * index + chartWidth / 2;
        drawSubjectHexagon(
          context,
          score,
          centerX,
          centerY,
          radius,
        );
        drawSubjectLabel(context, score, centerX, centerY, radius);
      });

      if (weaknesses.length === 0) {
        context.fillStyle = "#64748b";
        context.font = "12px system-ui, sans-serif";
        context.textAlign = "center";
        context.textBaseline = "alphabetic";
        context.fillText("暂无明显薄弱点", cssWidth / 2, CANVAS_HEIGHT - 18);
      }
    };

    draw();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", draw);
      return () => window.removeEventListener("resize", draw);
    }

    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [scores, weaknesses.length]);

  return (
    <div className="learning-hexagon-block">
      <p className="learning-hexagon-summary">按语文、英语、数学展示学习关注点</p>
      <canvas
        ref={canvasRef}
        className="learning-hexagon-canvas"
        width={360}
        height={CANVAS_HEIGHT}
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
