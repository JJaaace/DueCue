CREATE TYPE "GradeGoalLabel" AS ENUM ('maintain_a', 'raise_grade', 'pass_safely', 'custom');
CREATE TYPE "CourseImportance" AS ENUM ('normal', 'important', 'critical');
CREATE TYPE "GradeDataSource" AS ENUM ('manual', 'future_canvas', 'unknown');

ALTER TABLE "Course"
  ADD COLUMN "currentGradePercent" DOUBLE PRECISION,
  ADD COLUMN "targetGradePercent" DOUBLE PRECISION,
  ADD COLUMN "gradeGoalLabel" "GradeGoalLabel",
  ADD COLUMN "courseImportance" "CourseImportance" NOT NULL DEFAULT 'normal',
  ADD COLUMN "gradeDataSource" "GradeDataSource" NOT NULL DEFAULT 'unknown';

ALTER TABLE "AcademicTask"
  ADD COLUMN "gradeWeight" DOUBLE PRECISION,
  ADD COLUMN "affectsGrade" BOOLEAN NOT NULL DEFAULT true;
