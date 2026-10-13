-- Mission Control tables. Review only. Do NOT run against any database from tooling;
-- Thomas applies schema changes himself.
CREATE TABLE IF NOT EXISTS "mission_tasks" (
  "id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "column" text DEFAULT 'not_yet' NOT NULL,
  "rank" double precision DEFAULT 0 NOT NULL,
  "agent" text,
  "lane" text NOT NULL,
  "priority" text DEFAULT 'med' NOT NULL,
  "recurring" boolean DEFAULT false NOT NULL,
  "due_date" text,
  "ask" text,
  "links" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_by" text NOT NULL,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL,
  "done_at" text,
  "notion_page_id" text
);
CREATE INDEX IF NOT EXISTS "mission_tasks_column_rank_idx" ON "mission_tasks" ("column", "rank");
CREATE INDEX IF NOT EXISTS "mission_tasks_due_idx" ON "mission_tasks" ("due_date");
CREATE TABLE IF NOT EXISTS "mission_task_events" (
  "id" text PRIMARY KEY NOT NULL,
  "task_id" text NOT NULL,
  "kind" text NOT NULL,
  "actor" text NOT NULL,
  "via" text NOT NULL,
  "changes" jsonb,
  "note" text,
  "at" text NOT NULL
);
CREATE INDEX IF NOT EXISTS "mission_task_events_task_idx" ON "mission_task_events" ("task_id", "at");
