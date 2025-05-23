-- CSAS Events Table (Composite Primary Key)
    CREATE TABLE IF NOT EXISTS "csas_events" (
        "event_year" INT NOT NULL,
        "event_subject" TEXT NOT NULL,
        "last_updated" TIMESTAMP,
        PRIMARY KEY ("event_year", "event_subject")
    );

    -- Documents Table
    CREATE TABLE IF NOT EXISTS "documents" (
        "html_url" TEXT PRIMARY KEY,
        "year" INT,
        "title" TEXT,
        "doc_type" TEXT,
        "pdf_url" TEXT,
        "doc_language" TEXT,
        "event_year" INT,
        "event_subject" TEXT,
        "last_updated" TIMESTAMP,
        FOREIGN KEY ("event_year", "event_subject") REFERENCES "csas_events" ("event_year", "event_subject") ON DELETE SET NULL
    );

    -- Mandates Table
    CREATE TABLE IF NOT EXISTS "mandates" (
        "mandate_name" TEXT PRIMARY KEY,
        "last_updated" TIMESTAMP
    );

    -- Subcategories Table
    CREATE TABLE IF NOT EXISTS "subcategories" (
        "subcategory_name" TEXT PRIMARY KEY,
        "mandate_name" TEXT NOT NULL,
        "last_updated" TIMESTAMP,
        FOREIGN KEY ("mandate_name") REFERENCES "mandates" ("mandate_name") ON DELETE CASCADE
    );

    -- Topics Table
    CREATE TABLE IF NOT EXISTS "topics" (
        "topic_name" TEXT PRIMARY KEY,
        "subcategory_name" TEXT,
        "mandate_name" TEXT NOT NULL, 
        "last_updated" TIMESTAMP,
        FOREIGN KEY ("subcategory_name") REFERENCES "subcategories" ("subcategory_name") ON DELETE SET NULL,
        FOREIGN KEY ("mandate_name") REFERENCES "mandates" ("mandate_name") ON DELETE CASCADE
    );

    -- Derived Topics Table
    CREATE TABLE IF NOT EXISTS "derived_topics" (
        "topic_name" TEXT PRIMARY KEY,
        "representation" TEXT[],
        "representative_docs" TEXT[],
        "last_updated" TIMESTAMP
    );

    -- Document-Derived_topics Many-to-One Table
    CREATE TABLE IF NOT EXISTS "documents_derived_topic" (
        "html_url" TEXT NOT NULL,
        "topic_name" TEXT NOT NULL,
        "confidence_score" NUMERIC,
        "last_updated" TIMESTAMP,
        PRIMARY KEY("html_url", "topic_name"),
        FOREIGN KEY ("html_url") REFERENCES "documents" ("html_url") ON DELETE CASCADE,
        FOREIGN KEY ("topic_name") REFERENCES "derived_topics" ("topic_name") ON DELETE CASCADE
    );

    -- Document-Mandates Many-to-Many Table
    CREATE TABLE IF NOT EXISTS "documents_mandates" (
        "html_url" TEXT NOT NULL,
        "mandate_name" TEXT NOT NULL,
        "llm_belongs" TEXT,
        "llm_score" INT,
        "llm_explanation" TEXT,
        "semantic_score" NUMERIC,
        "last_updated" TIMESTAMP,
        PRIMARY KEY ("html_url", "mandate_name"),
        FOREIGN KEY ("html_url") REFERENCES "documents" ("html_url") ON DELETE CASCADE,
        FOREIGN KEY ("mandate_name") REFERENCES "mandates" ("mandate_name") ON DELETE CASCADE
    );

    -- Document-Topics Many-to-Many Table
    CREATE TABLE IF NOT EXISTS "documents_topics" (
        "html_url" TEXT NOT NULL,
        "topic_name" TEXT NOT NULL,
        "llm_belongs" TEXT,
        "llm_score" INT,
        "llm_explanation" TEXT,
        "semantic_score" NUMERIC,
        "isPrimary" BOOLEAN NOT NULL,
        "last_updated" TIMESTAMP,
        PRIMARY KEY ("html_url", "topic_name"),
        FOREIGN KEY ("html_url") REFERENCES "documents" ("html_url") ON DELETE CASCADE,
        FOREIGN KEY ("topic_name") REFERENCES "topics" ("topic_name") ON DELETE CASCADE
    );