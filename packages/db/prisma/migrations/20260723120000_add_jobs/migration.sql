-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "job_status" NOT NULL DEFAULT 'queued',
    "input" JSONB NOT NULL,
    "workflow_run_id" TEXT,
    "failure_code" TEXT,
    "failure_message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jobs_idempotency_key_key" ON "jobs"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_workflow_run_id_key" ON "jobs"("workflow_run_id");

-- Support inexpensive scans for queued work and operational status pages.
CREATE INDEX "jobs_status_created_at_idx" ON "jobs"("status", "created_at");
