import json
from typing import Dict, List, Any
from collections import defaultdict
from langchain_core.documents import Document
from opensearchpy import OpenSearch

# Import this at the module level
from helpers.db import execute_query

class MandateTools:
    """Tools for working with DFO mandate information."""
    
    def __init__(
        self, 
        opensearch_client: OpenSearch,
        mandate_index_name: str,
        region: str,
        conn 
    ):
        self.opensearch_client = opensearch_client
        self.mandate_index_name = mandate_index_name
        self.region = region
        self.conn = conn 
    
    def get_all_items(self) -> Dict[str, List[Document]]:
        """
        Retrieve mandate items from OpenSearch and group them by name.
        Returns a dict grouping items by name.
        """
        response = self.opensearch_client.search(
            index=self.mandate_index_name, 
            body={"size": 1000, "query": {"match_all": {}}}
        )
        matches = response["hits"]["hits"]

        items_by_name = defaultdict(list)
        for hit in matches:
            source = hit["_source"]
            name = source.get("name", "N/A")

            # Create document object with necessary metadata
            metadata = {
                'description': source.get('description', 'No description')
            }
            text = source.get('name_and_description', '')
            document = Document(page_content=text, metadata=metadata)

            items_by_name[name].append(document)

        return items_by_name
    
    def get_combined_mandates(self) -> str:
        """
        Combine mandates into a single text string.
        """
        items_by_name = self.get_all_items()
        combined_items = ""
        for item_name, docs in items_by_name.items():
            combined_items += f"-> {item_name}:"
            for doc in docs:
                description = doc.metadata.get('description', 'No description').replace(":", " -")
                combined_items += f" {description}"
                break  # Only include one description per item
            combined_items += "\n"
        return combined_items
    
    def get_all_dfo_mandates_and_descriptions(self, _: Any) -> str:
        """
        Returns all DFO mandates with their descriptions.
        This is a tool function for the agent.
        """
        combined_mandates = self.get_combined_mandates()
        return json.dumps({
            "output": combined_mandates,
            "metadata": {
                "description": "Official DFO Mandates and Descriptions"
            }
        })

    def mandate_related_documents_tool(self, mandate_name: str) -> str:
        """
        Return documents linked to a mandate.
        Maintains the original logic (LLM score ≥ 4, ordered by LLM score).
        """
        limit = 10  # Default limit
        
        def _count_sql(name: str) -> str:
            return (
                "SELECT COUNT(*) "
                "FROM documents_mandates "
                f"WHERE mandate_name = '{name}' "
                "AND llm_belongs = 'Yes';"
            )

        def _top_docs_sql(name: str, n: int) -> str:
            return f"""
            SELECT d.html_url,
                   d.title,
                   dm.semantic_score,
                   dm.llm_score
            FROM documents d
            INNER JOIN documents_mandates dm
              ON d.html_url = dm.html_url
            WHERE dm.mandate_name = '{name}'
              AND dm.llm_belongs = 'Yes'
            ORDER BY dm.llm_score DESC
            LIMIT {n};
            """
        
        try:
            # Use the connection directly
            total_count = execute_query(_count_sql(mandate_name), self.conn)[0][0]
            rows = execute_query(_top_docs_sql(mandate_name, limit), self.conn)

            documents = [
                {
                    "document_name": title,
                    "html_url": url,
                    "relevancy_score": llm_score / 10,
                }
                for url, title, _, llm_score in rows
            ]

            sources = [
                {
                    "name": doc["document_name"],
                    "url": doc["html_url"],
                    "relevancy_score": doc["relevancy_score"],
                }
                for doc in documents
            ]

            return json.dumps({
                "output": {
                    "total_number_of_related_documents": total_count,
                    "top_related_documents": documents,
                },
                "metadata": {
                    "description": f"LLM‑categorized documents that relate to mandate: {mandate_name}",
                    "sources": sources,
                },
            })
        except Exception as e:
            return json.dumps({
                "output": {
                    "total_number_of_related_documents": 0,
                    "top_related_documents": [],
                    "error": str(e)
                },
                "metadata": {
                    "description": f"LLM‑categorized documents that relate to mandate: {mandate_name}",
                    "sources": []
                }
            })
