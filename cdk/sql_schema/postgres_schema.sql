CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE "users" (
  "user_id" uuid PRIMARY KEY DEFAULT (uuid_generate_v4()),
  "user_email" varchar,
  "time_account_created" timestamp,
  "last_sign_in" timestamp
);

CREATE TABLE "prompts" (
  "public" text,
  "internal_researcher" text,
  "policy_maker" text,
  "external_researcher" text,
  "time_created" timestamp
);

CREATE TABLE "sessions" (
  "session_id" uuid PRIMARY KEY DEFAULT (uuid_generate_v4()),
  "time_created" timestamp
);

CREATE TABLE "user_engagement_log" (
  "log_id" uuid PRIMARY KEY,
  "session_id" uuid,
  "document_id" uuid,
  "engagement_type" varchar,
  "engagement_details" text,
  "user_role" varchar,
  "user_info" text,
  "timestamp" timestamp
);

CREATE TABLE "feedback" (
  "feedback_id" uuid PRIMARY KEY,
  "session_id" uuid,
  "feedback_rating" integer,
  "timestamp" timestamp,
  "feedback_description" varchar
);

CREATE TABLE "csas_events" (
  "event_year" "INT" NOT NULL,
  "event_subject" "TEXT" NOT NULL,
  "last_updated" "TIMESTAMP",
  PRIMARY KEY ("event_year", "event_subject")
);

CREATE TABLE "documents" (
  "doc_id" "TEXT" PRIMARY KEY,
  "html_url" "TEXT" UNIQUE NOT NULL,
  "year" "INT",
  "title" "TEXT",
  "doc_type" "TEXT",
  "pdf_url" "TEXT",
  "doc_language" "TEXT",
  "event_year" "INT",
  "event_subject" "TEXT",
  "last_updated" "TIMESTAMP"
);

CREATE TABLE "mandates" (
  "mandate_name" "TEXT" PRIMARY KEY,
  "last_updated" "TIMESTAMP"
);

CREATE TABLE "subcategories" (
  "subcategory_name" "TEXT" PRIMARY KEY,
  "mandate_name" "TEXT" NOT NULL,
  "last_updated" "TIMESTAMP"
);

CREATE TABLE "topics" (
  "topic_name" "TEXT" PRIMARY KEY,
  "subcategory_name" "TEXT",
  "mandate_name" "TEXT" NOT NULL,
  "last_updated" "TIMESTAMP"
);

CREATE TABLE "derived_topics" (
  "topic_name" "TEXT" PRIMARY KEY,
  "representation" "TEXT[]",
  "representative_docs" "TEXT[]",
  "last_updated" "TIMESTAMP"
);

CREATE TABLE "documents_derived_topic" (
  "doc_id" "TEXT" NOT NULL,
  "html_url" "TEXT" NOT NULL,
  "topic_name" "TEXT" NOT NULL,
  "confidence_score" "NUMERIC",
  "last_updated" "TIMESTAMP",
  PRIMARY KEY ("doc_id", "topic_name")
);

CREATE TABLE "documents_mandates" (
  "doc_id" "TEXT" NOT NULL,
  "html_url" "TEXT" NOT NULL,
  "mandate_name" "TEXT" NOT NULL,
  "llm_belongs" "TEXT",
  "llm_score" "INT",
  "llm_explanation" "TEXT",
  "semantic_score" "NUMERIC",
  "last_updated" "TIMESTAMP",
  PRIMARY KEY ("doc_id", "mandate_name")
);

CREATE TABLE "documents_topics" (
  "doc_id" "TEXT" NOT NULL,
  "html_url" "TEXT" NOT NULL,
  "topic_name" "TEXT" NOT NULL,
  "llm_belongs" "TEXT",
  "llm_score" "INT",
  "llm_explanation" "TEXT",
  "semantic_score" "NUMERIC",
  "isPrimary" "BOOLEAN" NOT NULL,
  "last_updated" "TIMESTAMP",
  PRIMARY KEY ("doc_id", "topic_name")
);

ALTER TABLE "documents" ADD FOREIGN KEY ("event_year", "event_subject") REFERENCES "csas_events" ("event_year", "event_subject") ON DELETE SET NULL;

ALTER TABLE "subcategories" ADD FOREIGN KEY ("mandate_name") REFERENCES "mandates" ("mandate_name") ON DELETE CASCADE;

ALTER TABLE "topics" ADD FOREIGN KEY ("subcategory_name") REFERENCES "subcategories" ("subcategory_name") ON DELETE SET NULL;

ALTER TABLE "topics" ADD FOREIGN KEY ("mandate_name") REFERENCES "mandates" ("mandate_name") ON DELETE CASCADE;

ALTER TABLE "documents_derived_topic" ADD FOREIGN KEY ("doc_id") REFERENCES "documents" ("doc_id") ON DELETE CASCADE;

ALTER TABLE "documents_derived_topic" ADD FOREIGN KEY ("topic_name") REFERENCES "derived_topics" ("topic_name") ON DELETE CASCADE;

ALTER TABLE "documents_mandates" ADD FOREIGN KEY ("doc_id") REFERENCES "documents" ("doc_id") ON DELETE CASCADE;

ALTER TABLE "documents_mandates" ADD FOREIGN KEY ("mandate_name") REFERENCES "mandates" ("mandate_name") ON DELETE CASCADE;

ALTER TABLE "documents_topics" ADD FOREIGN KEY ("doc_id") REFERENCES "documents" ("doc_id") ON DELETE CASCADE;

ALTER TABLE "documents_topics" ADD FOREIGN KEY ("topic_name") REFERENCES "topics" ("topic_name") ON DELETE CASCADE;

ALTER TABLE "user_engagement_log" ADD FOREIGN KEY ("session_id") REFERENCES "sessions" ("session_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "feedback" ADD FOREIGN KEY ("session_id") REFERENCES "sessions" ("session_id") ON DELETE CASCADE ON UPDATE CASCADE;
