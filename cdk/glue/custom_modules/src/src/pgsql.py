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
    INSERT INTO topics ("topic_name", "subcategory_name", "mandate_name", "isDFO", "last_updated")
    VALUES (%s, %s, %s, %s, %s)
    ON CONFLICT (topic_name)
    """
    if upsert:
        sql += '''
        DO UPDATE SET 
            "subcategory_name" = EXCLUDED."subcategory_name",
            "mandate_name" = EXCLUDED."mandate_name",
            "isDFO" = EXCLUDED."isDFO", 
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



