from typing import Dict, List, Iterable, Literal, Optional, Tuple
import psycopg

def execute_query(q:str, conn_info:Dict):
    """
    Execute a SQL statement string

    Parameters
    ----------
    q : string
       SQL statement string
    conn_info : dict
        A dictionary containing the connection information for PostgreSQL.

    Returns
    -------
    res or None
    """
    with psycopg.connect(**conn_info) as conn:
        res = None
        if "select" in q.lower():
            res = conn.execute(q).fetchall()
        else:
            conn.execute(q)
        print("Query executed!")
        return res

def create_tables_if_not_exists(conn_info: dict):
    sql = """
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
    """
    execute_query(sql, conn_info)
    print("Tables created successfully or already exist!")

def bulk_upsert_documents(documents, conn_info: dict, upsert=True):
    """
    Bulk upsert documents into the documents table.

    Parameters
    ----------
    documents : list of tuples
        Each tuple contains (html_url, year, title, doc_type, pdf_url, doc_language, event_year, event_subject, last_updated).
    conn_info : dict
        A dictionary containing the connection information for PostgreSQL.
    upsert : bool, optional
        Whether to update existing records on conflict. Defaults to True.
    """
    sql = """
    INSERT INTO documents (html_url, year, title, doc_type, pdf_url, doc_language, event_year, event_subject, last_updated)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (html_url)
    """
    if upsert:
        sql += """
        DO UPDATE SET
            year = EXCLUDED.year,
            title = EXCLUDED.title,
            doc_type = EXCLUDED.doc_type,
            pdf_url = EXCLUDED.pdf_url,
            doc_language = EXCLUDED.doc_language,
            event_year = EXCLUDED.event_year,
            event_subject = EXCLUDED.event_subject,
            last_updated =  EXCLUDED.last_updated;
        """
    else:
        sql += "DO NOTHING;"

    with psycopg.connect(**conn_info) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, documents)
        conn.commit()


def bulk_upsert_csas_events(events, conn_info: dict, upsert=True):
    sql = """
    INSERT INTO csas_events (event_year, event_subject, last_updated)
    VALUES (%s, %s, %s)
    ON CONFLICT (event_year, event_subject)
    """
    if upsert:
        sql += """
        DO UPDATE SET
            last_updated = EXCLUDED.last_updated;
        """
    else:
        sql += "DO NOTHING;"

    with psycopg.connect(**conn_info) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, events)
        conn.commit()


def bulk_upsert_mandates(mandates, conn_info: dict, upsert=True):
    sql = """
    INSERT INTO mandates (mandate_name, last_updated)
    VALUES (%s, %s)
    ON CONFLICT (mandate_name)
    """
    if upsert:
        sql += "DO UPDATE SET last_updated = EXCLUDED.last_updated;"
    else:
        sql += "DO NOTHING;"

    with psycopg.connect(**conn_info) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, mandates)
        conn.commit()


def bulk_upsert_topics(topics, conn_info: dict, upsert=True):
    sql = """
    INSERT INTO topics ("topic_name", "subcategory_name", "mandate_name", "last_updated")
    VALUES (%s, %s, %s, %s)
    ON CONFLICT (topic_name)
    """
    if upsert:
        sql += '''
        DO UPDATE SET 
            "subcategory_name" = EXCLUDED."subcategory_name",
            "mandate_name" = EXCLUDED."mandate_name",
            "last_updated" = EXCLUDED.last_updated;
        '''
    else:
        sql += "DO NOTHING;"

    with psycopg.connect(**conn_info) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, topics)
        conn.commit()


def bulk_upsert_subcategories(subcategories, conn_info: dict, upsert=True):
    sql = """
    INSERT INTO subcategories (subcategory_name, mandate_name, last_updated)
    VALUES (%s, %s, %s)
    ON CONFLICT (subcategory_name)
    """
    if upsert:
        sql += """
        DO UPDATE SET
            mandate_name = EXCLUDED.mandate_name, 
            last_updated = EXCLUDED.last_updated;
        """
    else:
        sql += "DO NOTHING;"
    
    with psycopg.connect(**conn_info) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, subcategories)
        conn.commit()


def bulk_upsert_documents_mandates(documents_mandates, conn_info: dict, upsert=True):
    sql = """
    INSERT INTO documents_mandates (html_url, mandate_name, llm_belongs, llm_score, llm_explanation, semantic_score, last_updated)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (html_url, mandate_name)
    """
    if upsert:
        sql += """
        DO UPDATE SET
            llm_belongs = EXCLUDED.llm_belongs,
            llm_score = EXCLUDED.llm_score,
            llm_explanation = EXCLUDED.llm_explanation,
            semantic_score = EXCLUDED.semantic_score,
            last_updated = EXCLUDED.last_updated;
        """
    else:
        sql += "DO NOTHING;"

    with psycopg.connect(**conn_info) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, documents_mandates)
        conn.commit()


def bulk_upsert_documents_topics(documents_topics, conn_info: dict, upsert=True):
    sql = """
    INSERT INTO documents_topics (html_url, topic_name, llm_belongs, llm_score, llm_explanation, semantic_score, "isPrimary", last_updated)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (html_url, topic_name)
    """
    if upsert:
        sql += """
        DO UPDATE SET
            llm_belongs = EXCLUDED.llm_belongs,
            llm_score = EXCLUDED.llm_score,
            llm_explanation = EXCLUDED.llm_explanation,
            semantic_score = EXCLUDED.semantic_score,
            "isPrimary" = EXCLUDED."isPrimary",
            last_updated = EXCLUDED.last_updated;
        """
    else:
        sql += "DO NOTHING;"

    with psycopg.connect(**conn_info) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, documents_topics)
        conn.commit()

def test_connection(conn_info: dict) -> bool:
    """
    Test database connection.

    Parameters
    ----------
    conn_info : dict
        A dictionary containing the connection information for PostgreSQL.

    Returns
    -------
    bool
        True if connection successful, False otherwise
    """
    try:
        with psycopg.connect(**conn_info) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                return True
    except Exception as e:
        print(f"Connection test failed: {str(e)}")
        return False

def get_all_tables(conn_info: dict) -> List[str]:
    """
    Get list of all tables in the database.

    Parameters
    ----------
    conn_info : dict
        A dictionary containing the connection information for PostgreSQL.

    Returns
    -------
    list
        List of table names
    """
    if not test_connection(conn_info):
        raise ConnectionError("Could not connect to the database. Please check your connection parameters and network access.")

    sql = """
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name;
    """
    try:
        with psycopg.connect(**conn_info) as conn:
            with conn.cursor() as cur:
                cur.execute(sql)
                return [row[0] for row in cur.fetchall()]
    except Exception as e:
        print(f"Error getting tables: {str(e)}")
        return []

def get_row_count(table_name: str, conn_info: dict) -> int:
    """
    Get row count for a specific table.

    Parameters
    ----------
    table_name : str
        Name of the table
    conn_info : dict
        A dictionary containing the connection information for PostgreSQL.

    Returns
    -------
    int
        Number of rows in the table
    """
    sql = f'SELECT COUNT(*) FROM "{table_name}";'
    with psycopg.connect(**conn_info) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            return cur.fetchone()[0]

def get_first_row(table_name: str, conn_info: dict) -> Dict:
    """
    Get first row from a specific table.

    Parameters
    ----------
    table_name : str
        Name of the table
    conn_info : dict
        A dictionary containing the connection information for PostgreSQL.

    Returns
    -------
    dict
        First row as a dictionary
    """
    sql = f'SELECT * FROM "{table_name}" LIMIT 1;'
    with psycopg.connect(**conn_info) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            columns = [desc[0] for desc in cur.description]
            row = cur.fetchone()
            if row:
                return dict(zip(columns, row))
            return {}



