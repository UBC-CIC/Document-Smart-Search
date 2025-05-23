import json
from typing import Dict, List, Any, Tuple, Optional
from opensearchpy import OpenSearch
from langchain_aws import BedrockEmbeddings

class SearchTools:
    """Tools for searching DFO content."""
    
    def __init__(
        self, 
        opensearch_client: OpenSearch,
        embedder: BedrockEmbeddings,
        html_index_name: str,
        search_pipeline: str,
        keyword_ratio: float = 0.3,
        semantic_ratio: float = 0.7
    ):
        self.opensearch_client = opensearch_client
        self.embedder = embedder
        self.html_index_name = html_index_name
        self.search_pipeline = search_pipeline
        self.keyword_ratio = keyword_ratio
        self.semantic_ratio = semantic_ratio
    
    def semantic_html_search_tool(self, user_query: str) -> str:
        """
        Hybrid (semantic + lexical) search over CSAS HTML documents.
        Uses two searches: one for Terms‑of‑Reference (TOR) only and
        another for all other docs (non‑TOR).
        """
        num_docs = 10  # Default num_docs per search
        language = "English"  # Default language filter
        
        def _post_filter(tor_only: bool) -> Dict[str, Any]:
            """Construct post‑filter for TOR / non‑TOR cases."""
            must = [{"term": {"language": language}}]
            if tor_only:
                must.append({"term": {"html_doc_type": "Terms of Reference"}})
                return {"bool": {"must": must}}
            return {
                "bool": {
                    "must": must,
                    "must_not": [{"term": {"html_doc_type": "Terms of Reference"}}],
                }
            }
        
        def _search(filter_body: Dict[str, Any]) -> List[Dict[str, Any]]:
            """Run the hybrid search and normalise results."""
            hits = self.hybrid_similarity_search_with_score(
                query=user_query,
                k=num_docs,
                post_filter=filter_body,
            )
            return [
                {
                    "document_name": doc["csas_html_title"],
                    "html_url": doc["html_url"],
                    "content": doc["page_content"],
                    "relevancy_score": score,
                }
                for doc, score in hits
            ]
        
        try:
            # Aggregate TOR + non‑TOR results
            documents = _search(_post_filter(tor_only=True)) + _search(_post_filter(tor_only=False))

            # Simplified provenance list (name, url, score)
            sources = [
                {
                    "name": d["document_name"],
                    "url": d["html_url"],
                    "relevancy_score": d["relevancy_score"],
                }
                for d in documents
            ]

            return json.dumps(
                {
                    "output": {"documents": documents},
                    "metadata": {
                        "description": f"Semantic search of HTML documents by query: {user_query}",
                        "sources": sources,
                    },
                }
            )
        except Exception as e:
            return json.dumps(
                {
                    "output": {"documents": [], "error": str(e)},
                    "metadata": {
                        "description": f"Semantic search of HTML documents by query: {user_query}",
                        "sources": []
                    }
                }
            )
    
    def _default_hybrid_search_query(
        self,
        query_text: str,
        query_vector: List[float],
        k: int = 4,
        text_field: str = "page_content",
        vector_field: str = "chunk_embedding",
        source: Optional[Dict] = None,
        highlight: Optional[Dict] = None,
        post_filter: Optional[Dict] = None,
    ) -> Dict:
        """
        Returns the payload for performing a hybrid search.
        """
        if source is None:
            source = {"exclude": [vector_field]}
        
        payload = {
            "_source": source,
            "query": {
                "hybrid": {
                    "queries": [
                        {"match": {text_field: {"query": query_text}}},
                        {"knn": {vector_field: {"vector": query_vector, "k": k}}},
                    ]
                }
            },
            "size": k,
        }
        if highlight:
            payload["highlight"] = highlight
        if post_filter:
            payload["post_filter"] = post_filter
        return payload

    def hybrid_similarity_search_with_score(
        self,
        query: str,
        k: int = 4,
        post_filter: Optional[Dict] = None,
        text_field: str = "page_content",
        vector_field: str = "chunk_embedding",
        source: Optional[Dict] = None,
        highlight: Optional[Dict] = None,
    ) -> List[Tuple[Dict, float]]:
        """
        Performs a hybrid similarity search and returns results with scores.
        """
        # 1. Compute the vector representation for the query.
        query_vector = self.embedder.embed_query(query)

        # 2. Build the query payload
        payload = self._default_hybrid_search_query(
            query_text=query,
            query_vector=query_vector,
            k=k,
            text_field=text_field,
            vector_field=vector_field,
            source=source,
            highlight=highlight,
            post_filter=post_filter,
        )

        # 3. Define the endpoint path with the search pipeline.
        path = f"/{self.html_index_name}/_search?search_pipeline={self.search_pipeline}"

        # 4. Execute the search request.
        response = self.opensearch_client.transport.perform_request(method="GET", url=path, body=payload)

        # 5. Parse the response hits and return tuples (result, score).
        results = []
        for hit in response.get("hits", {}).get("hits", []):
            source_data = hit["_source"]
            if "highlight" in hit:
                source_data["highlight"] = hit["highlight"]
            score = hit.get("_score", 0)
            results.append((source_data, score))
        
        return results
