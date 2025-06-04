import json
import boto3
import logging
from typing import Dict, List, Tuple
import psycopg
import re

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()

# Constants
REGION_NAME = "us-west-2"
RDS_SEC = "rds/dfo-db-glue-test"

# AWS Clients
secrets_manager_client = boto3.client("secretsmanager", region_name=REGION_NAME)
ssm_client = boto3.client("ssm", region_name=REGION_NAME)

def get_secret(secret_name: str) -> Dict:
    try:
        response = secrets_manager_client.get_secret_value(SecretId=secret_name)["SecretString"]
        return json.loads(response)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to decode JSON for secret {secret_name}: {e}")
        raise ValueError(f"Secret {secret_name} is not properly formatted as JSON.")
    except Exception as e:
        logger.error(f"Error fetching secret {secret_name}: {e}")
        raise

def sanitize_pg_identifier(label: str) -> str:
    escaped = label.replace('"', '""')
    return escaped[:63]

def execute_chart_query(pgsql_conn, query: str) -> List[Dict]:
    with pgsql_conn.cursor() as cursor:
        cursor.execute(query)
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()
        return [dict(zip(columns, row)) for row in rows]

def remap_result_aliases(result: List[Dict], alias_map: Dict[str, str]) -> List[Dict]:
    remapped = []
    for row in result:
        new_row = {}
        for key, value in row.items():
            new_row[alias_map.get(key, key)] = value
        remapped.append(new_row)
    return remapped

def build_chart_query(base_table: str, join_table: str, key_field: str, filters: List[str],
                      from_year: int, to_year: int, doc_types: List[str], language: str) -> Tuple[str, Dict[str, str]]:
    query = f"""
    WITH years AS (
        SELECT generate_series({from_year}, {to_year}) AS year
    ),
    """

    subqueries = []
    alias_map = {}

    for i, val in enumerate(filters):
        alias = f"t{i}"
        alias_map[alias] = val

        subquery = f"""
    q_{i}_counts AS (
        SELECT d.event_year AS year, COUNT(*) AS count
        FROM documents d
        INNER JOIN {join_table} jt ON d.html_url = jt.html_url
        WHERE jt.{key_field} = '{val}'
        AND d.doc_language = '{language}'
        AND d.event_year BETWEEN {from_year} AND {to_year}
        """
        if doc_types:
            quoted = ", ".join([f"'{dt}'" for dt in doc_types])
            subquery += f"AND d.doc_type IN ({quoted})\n"
        subquery += "GROUP BY d.event_year\n    )"
        subqueries.append(subquery)

    query += ",\n".join(subqueries)
    query += "\nSELECT y.year"

    for i in range(len(filters)):
        query += f', COALESCE(t{i}.count, 0) AS "t{i}"'

    query += "\nFROM years y"
    for i in range(len(filters)):
        query += f"\nLEFT JOIN q_{i}_counts t{i} ON y.year = t{i}.year"

    query += "\nORDER BY y.year"

    return query, alias_map

def build_mandate_chart_query(mandates: List[str], from_year: int, to_year: int,
                               doc_types: List[str], language: str) -> Tuple[str, Dict[str, str]]:
    return build_chart_query("documents", "documents_mandates", "mandate_name",
                             mandates, from_year, to_year, doc_types, language)

def build_topic_chart_query(topics: List[str], from_year: int, to_year: int,
                             doc_types: List[str], language: str) -> Tuple[str, Dict[str, str]]:
    return build_chart_query("documents", "documents_topics", "topic_name",
                             topics, from_year, to_year, doc_types, language)

def build_derived_topic_chart_query(topics: List[str], from_year: int, to_year: int,
                                    doc_types: List[str], language: str) -> Tuple[str, Dict[str, str]]:
    return build_chart_query("documents", "documents_derived_topic", "topic_name",
                             topics, from_year, to_year, doc_types, language)

def handler(event, context):
    try:
        query_params = event.get("queryStringParameters", {}) or {}
        from_year = query_params.get("fromYear")
        to_year = query_params.get("toYear")

        if not from_year or not to_year:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Missing year range parameters"}),
                "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}
            }

        try:
            from_year = int(from_year)
            to_year = int(to_year)
        except ValueError:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Year parameters must be integers"}),
                "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}
            }

        mandates = query_params.get("mandates", "").split(",") if query_params.get("mandates") else []
        topics = query_params.get("topics", "").split(",") if query_params.get("topics") else []
        derived_topics = query_params.get("derived_topics", "").split(",") if query_params.get("derived_topics") else []
        doc_types = query_params.get("document_types", "").split(",") if query_params.get("document_types") else []
        language = query_params.get("language", "English")

        if not any([mandates, topics, derived_topics]):
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Either mandates, topics, or derived_topics must be provided"}),
                "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}
            }

        rds_secret = get_secret(RDS_SEC)
        rds_conn_info = {
            "host": rds_secret['host'],
            "port": rds_secret['port'],
            "dbname": rds_secret['dbname'],
            "user": rds_secret['username'],
            "password": rds_secret['password']
        }

        with psycopg.connect(**rds_conn_info) as conn:
            if mandates:
                query, alias_map = build_mandate_chart_query(mandates, from_year, to_year, doc_types, language)
            elif topics:
                query, alias_map = build_topic_chart_query(topics, from_year, to_year, doc_types, language)
            else:
                query, alias_map = build_derived_topic_chart_query(derived_topics, from_year, to_year, doc_types, language)

            raw_result = execute_chart_query(conn, query)
            result = remap_result_aliases(raw_result, alias_map)

            return {
                "statusCode": 200,
                "body": json.dumps(result),
                "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}
            }

    except Exception as e:
        import traceback
        logger.error(f"Unhandled error: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({
                "error": str(e),
                "trace": traceback.format_exc()
            }),
            "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}
        }
