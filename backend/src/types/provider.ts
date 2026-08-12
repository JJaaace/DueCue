export type ProviderTaskType = "assignment" | "quiz" | "exam" | "project" | "reading" | "discussion" | "lab" | "other";

export type ProviderCourse = {
  externalId: string;
  code: string;
  name: string;
  instructorName?: string;
  term?: string;
  color?: string;
  difficulty?: "easy" | "normal" | "hard";
};

export type ProviderTask = {
  externalId: string;
  courseExternalId: string;
  title: string;
  description?: string;
  type?: ProviderTaskType;
  dueAt: string;
  availableAt?: string;
  pointsPossible?: number;
  estimatedMinutes?: number;
  difficulty?: "low" | "medium" | "high";
  sourceUrl?: string;
  rawSource?: Record<string, unknown>;
};

export type ProviderSyncResult = {
  courses: ProviderCourse[];
  tasks: ProviderTask[];
  metadata?: Record<string, unknown>;
};

export interface CourseProvider {
  providerId: string;
  displayName: string;
  sync(userId: string, connectionId: string, config?: Record<string, unknown>): Promise<ProviderSyncResult>;
}

