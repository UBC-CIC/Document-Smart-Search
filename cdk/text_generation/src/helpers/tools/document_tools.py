import json
from typing import Dict, Any, List, Tuple
from opensearchpy import OpenSearch

# Import this at the module level
from helpers.db import execute_query

class DocumentTools:
    """Tools for working with DFO documents."""
    
    def __init__(
        self, 
        opensearch_client: OpenSearch,
        html_index_name: str,
        conn 
    ):
        self.opensearch_client = opensearch_client
        self.html_index_name = html_index_name
        self.conn = conn 
    
    def document_html_raw_text_tool(self, document_url: str) -> str:
        """
        Retrieve the raw HTML text (page_content) for a single document identified by
        its URL.
        """
        def _build_os_query(url: str) -> Dict[str, Any]:
            """Construct the OpenSearch term query."""
            return {
                "size": 1,
                "_source": ["csas_html_title", "page_content"],
                "query": {"bool": {"must": [{"match_phrase": {"html_url": url}}]}},
            }

        def _fetch_from_opensearch(url: str) -> Dict[str, str]:
            """Run query and normalise the OpenSearch response."""
            resp = self.opensearch_client.search(index=self.html_index_name, body=_build_os_query(url))
            if resp["hits"]["hits"]:
                src = resp["hits"]["hits"][0]["_source"]
                return {
                    "document_name": src.get("csas_html_title", "Unknown"),
                    "text": src.get("page_content", "No text found"),
                }
            return {
                "document_name": "Document not found",
                "text": "The requested document was not found in the index.",
            }

        result = _fetch_from_opensearch(document_url)

        return json.dumps(
            {
                "output": result,
                "metadata": {
                    "description": "HTML content of web page.",
                    "sources": [{"name": result["document_name"], "url": document_url}],
                },
            }
        )

    def document_categorization_results_tool(self, document_url: str) -> str:
        """
        Look up a CSAS document by URL, then enrich the result with mandate / topic
        classifications stored in Postgres.
        """
        def _build_os_query(url: str) -> Dict[str, Any]:
            return {
                "size": 1,
                "_source": [
                    "csas_html_title",
                    "csas_event",
                    "csas_html_year",
                    "html_year",
                    "html_doc_type",
                    "pdf_url",
                ],
                "query": {"bool": {"must": [{"match_phrase": {"html_url": url}}]}},
            }

        def _fetch_document_metadata(url: str) -> Dict[str, Any]:
            resp = self.opensearch_client.search(
                index=self.html_index_name, body=_build_os_query(url)
            )
            if resp["hits"]["hits"]:
                src = resp["hits"]["hits"][0]["_source"]
                return {
                    "document_name": src.get("csas_html_title", "Unknown"),
                    "csas_event_name": src.get("csas_event", ""),
                    "csas_event_year": src.get("csas_html_year", ""),
                    "publish_date": src.get("html_year", ""),
                    "document_type": src.get("html_doc_type", ""),
                    "full_pdf_document_url": src.get("pdf_url", ""),
                }
            return {"Error": "Document not found in Opensearch"}

        def _classification_sql(url: str) -> str:
            # Raw f‑string kept: parameters are already trusted / pre‑escaped elsewhere.
            return f"""
            SELECT *
            FROM (
                SELECT 'mandate' AS entity_type,
                       m.mandate_name  AS entity_name,
                       dm.semantic_score,
                       dm.llm_score,
                       dm.llm_explanation
                FROM documents_mandates dm
                JOIN mandates m ON dm.mandate_name = m.mandate_name
                WHERE dm.html_url = '{url}' AND dm.llm_score >= 4

                UNION ALL

                SELECT 'dfo_topic',
                       t.topic_name,
                       dt.semantic_score,
                       dt.llm_score,
                       dt.llm_explanation
                FROM documents_topics dt
                JOIN topics t ON dt.topic_name = t.topic_name
                WHERE dt.html_url = '{url}' AND dt.llm_score >= 4

                UNION ALL

                SELECT 'non_dfo_topic',
                       t.topic_name,
                       dt.semantic_score,
                       dt.llm_score,
                       dt.llm_explanation
                FROM documents_topics dt
                JOIN topics t ON dt.topic_name = t.topic_name
                WHERE dt.html_url = '{url}' AND dt.llm_score >= 4
            ) AS combined_results
            ORDER BY llm_score DESC;
            """

        def _fetch_classifications(url: str) -> Tuple[List[Dict], List[Dict], List[Dict]]:
            rows = execute_query(_classification_sql(url), self.conn)

            mandates, dfo_topics, non_dfo = [], [], []
            for entity_type, name, sem_score, llm_score, explain in rows:
                if entity_type == "mandate":
                    mandates.append(
                        {"name": name, "llm_score": llm_score / 10, "llm_explaination": explain}
                    )
                elif entity_type == "dfo_topic":
                    dfo_topics.append(
                        {"name": name, "llm_score": llm_score / 10, "llm_explaination": explain}
                    )
                else:  # non_dfo_topic
                    non_dfo.append({"name": name, "semantic_score": float(llm_score)})

            return mandates, dfo_topics, non_dfo

        try:
            base_results = _fetch_document_metadata(document_url)
            # Use the connection directly
            mandates, dfo_topics, other_topics = _fetch_classifications(document_url)

            base_results.update(
                {
                    "dfo_mandates": mandates,
                    "dfo_topics": dfo_topics,
                    "other_topics": other_topics,
                }
            )

            return json.dumps(
                {
                    "output": base_results,
                    "metadata": {
                        "description": (
                            "Opensearch and SQL query of LLM‑categorized documents "
                            f"that relate to document: {document_url}"
                        ),
                        "sources": [
                            {"name": base_results.get("document_name", "Unknown"), "url": document_url}
                        ],
                    },
                }
            )
        except Exception as e:
            return json.dumps({
                "output": {"Error": f"Document categorization failed: {str(e)}"},
                "metadata": {
                    "description": f"Opensearch and SQL query of LLM‑categorized documents that relate to document: {document_url}",
                    "sources": [{"name": "Unknown", "url": document_url}]
                }
            })
