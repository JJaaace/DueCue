import type { CourseProvider, ProviderCourse, ProviderSyncResult, ProviderTask } from "../../types/provider.js";

const at = (days: number, hour = 23, minute = 59) => {
  const date = new Date();
  date.setUTCHours(hour, minute, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
};

const courses: ProviderCourse[] = [
  { externalId: "cse-2221", code: "CSE 2221", name: "Software I", instructorName: "Prof. Rivera", term: "Autumn 2026", color: "#60A5FA", difficulty: "hard" },
  { externalId: "math-1151", code: "MATH 1151", name: "Calculus I", instructorName: "Dr. Patel", term: "Autumn 2026", color: "#A78BFA", difficulty: "hard" },
  { externalId: "english-1110", code: "ENGLISH 1110", name: "Writing & Information Literacy", instructorName: "Prof. Morgan", term: "Autumn 2026", color: "#F59E0B", difficulty: "normal" },
  { externalId: "stat-3470", code: "STAT 3470", name: "Introduction to Statistics", instructorName: "Dr. Kim", term: "Autumn 2026", color: "#34D399", difficulty: "normal" },
  { externalId: "spanish-1103", code: "SPANISH 1103", name: "Intermediate Spanish", instructorName: "Prof. Flores", term: "Autumn 2026", color: "#FB7185", difficulty: "normal" },
];

const task = (externalId: string, courseExternalId: string, title: string, type: ProviderTask["type"], days: number, points: number, estimatedMinutes: number, difficulty: ProviderTask["difficulty"] = "medium"): ProviderTask => ({
  externalId, courseExternalId, title, type, dueAt: at(days), pointsPossible: points, estimatedMinutes, difficulty,
  description: `Imported from the simulated Canvas course feed for ${courseExternalId}.`,
  sourceUrl: `https://canvas.example.edu/courses/${courseExternalId}/assignments/${externalId}`,
  rawSource: { provider: "mock_canvas", demo: true, externalId },
});

function stageTasks(stage: number): ProviderTask[] {
  const tasks: ProviderTask[] = [
    task("cse-lab-01", "cse-2221", "Lab 01: Boolean Expressions", "lab", 1, 20, 90, "medium"),
    task("cse-hw-02", "cse-2221", "Homework 02: Iteration", "assignment", 3, 35, 150, "high"),
    task("cse-project-01", "cse-2221", "Project 1: Component-Based Program", "project", 5, 100, 420, "high"),
    task("cse-reading-03", "cse-2221", "Reading: Design by Contract", "reading", 6, 10, 50, "low"),
    task("cse-midterm-review", "cse-2221", "Midterm Review", "exam", 14, 150, 360, "high"),
    task("math-webassign-03", "math-1151", "WebAssign Set 3", "assignment", 2, 25, 120, "medium"),
    task("math-quiz-02", "math-1151", "Quiz 2: Derivatives", "quiz", stage >= 3 ? 2 : 7, 30, 100, "medium"),
    task("math-discussion-02", "math-1151", "Recitation Discussion 2", "discussion", 4, 10, 45, "low"),
    task("math-midterm-01", "math-1151", "Midterm 1", "exam", 12, 120, 300, "high"),
    task("english-reading-rhetoric", "english-1110", "Reading: Rhetorical Situations", "reading", 2, 10, 60, "low"),
    task("english-discussion-01", "english-1110", "Discussion: Source Credibility", "discussion", 5, 15, 60, "medium"),
    task("english-essay-draft", "english-1110", "Essay Draft: Literacy Narrative", "project", 10, stage >= 4 ? 100 : 75, 300, "high"),
    task("english-peer-review", "english-1110", "Peer Review Workshop", "assignment", 11, 20, 90, "medium"),
    task("stat-homework-02", "stat-3470", "Homework 2: Describing Data", "assignment", 3, 25, 100, "medium"),
    task("stat-quiz-02", "stat-3470", "Quiz 2: Probability", "quiz", 7, 30, 90, "medium"),
    task("stat-lab-01", "stat-3470", "Lab: Data Visualization", "lab", 9, 40, 150, "medium"),
    task("stat-exam-01", "stat-3470", "Exam 1", "exam", 15, 100, 240, "high"),
    task("spanish-oral-practice", "spanish-1103", "Oral Practice: La Vida Diaria", "assignment", 4, 15, 60, "medium"),
    task("spanish-vocabulary-quiz", "spanish-1103", "Vocabulary Quiz 3", "quiz", 6, 20, 75, "medium"),
    task("spanish-reading-04", "spanish-1103", "Reading: Una nueva ciudad", "reading", 8, 10, 45, "low"),
    task("spanish-composition", "spanish-1103", "Composition: Mi Comunidad", "project", 13, 50, 180, "medium"),
  ];
  if (stage >= 2) tasks.push(task("cse-project-02", "cse-2221", "Project 2: Data Representation", "project", 18, 120, 480, "high"));
  return tasks;
}

export class MockCanvasProvider implements CourseProvider {
  providerId = "mock_canvas";
  displayName = "Simulated Canvas / Carmen";

  async sync(_userId: string, _connectionId: string, config?: Record<string, unknown>): Promise<ProviderSyncResult> {
    const stage = Math.min(4, Math.max(1, Number(config?.mockStage ?? 1)));
    return { courses, tasks: stageTasks(stage), metadata: { demoStage: stage, source: "simulated_canvas", generatedAt: new Date().toISOString() } };
  }
}

