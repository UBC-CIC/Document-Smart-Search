import json
from typing import Dict, List, Any, Tuple, Optional
from opensearchpy import OpenSearch
from langchain_aws import BedrockEmbeddings

# Configuration variables
TOR_DOCS_LIMIT = 10  # Number of "Terms of Reference" documents to return
OTHER_DOCS_LIMIT = 10  # Number of other document types to return

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
        Uses two searches: one for Terms of Reference (TOR) only and
        another for all other docs (non TOR).
        Returns formatted text results with full document content.
        """
        language = "English"  # Default language filter
        
        def _post_filter(tor_only: bool) -> Dict[str, Any]:
            """Construct post filter for TOR / non TOR cases."""
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
        
        def _search(filter_body: Dict[str, Any], limit: int) -> List[Tuple[Dict[str, Any], float, str]]:
            """Run the hybrid search and return results with document IDs."""
            hits = self.hybrid_similarity_search_with_score(
                query=user_query,
                k=limit,
                post_filter=filter_body,
            )
            # Extract document IDs
            return [(doc, score, hit_id) for doc, score, hit_id in hits]
        
        try:
            # Search for both document types
            tor_docs = _search(_post_filter(tor_only=True), TOR_DOCS_LIMIT)
            other_docs = _search(_post_filter(tor_only=False), OTHER_DOCS_LIMIT)
            
            # Format the output string
            total_docs = len(tor_docs) + len(other_docs)
            output = f"Top {total_docs} most related documents to query:\n\n"
            
            # Create sources for metadata
            sources = []
            
            # Process Terms of Reference documents
            output += f"\nTop {len(tor_docs)} Terms of Reference documents by relevancy score:\n"
            for doc, score, doc_id in tor_docs:
                # Add document to output
                title = doc.get("csas_html_title") or doc.get("html_page_title") or doc.get("doc_title") or "Unknown"
                html_subject = doc.get("html_subject", "")
                doc_type = doc.get("html_doc_type", "Unknown")
                event = doc.get("csas_event", "Unknown")
                year = doc.get("csas_html_year") or doc.get("html_year") or doc.get("year") or "Unknown"
                
                output += f"\nDocument: {title}, Subject: {html_subject}\n"
                output += f"Document Type: {doc_type}\n"
                output += f"Similarity Score: {score:.4f}\n"
                output += f"CSAS Event: {event}, Year: {year}\n"
                text_content = doc.get('page_content', '').replace('\n', ' ')
                output += f"Content: {text_content}\n"
                
                # Add to sources
                sources.append({
                    "name": title,
                    "url": doc.get("html_url", ""),
                    "document_id": doc_id,
                    "relevancy_score": score,
                })
            
            # Process other document types
            output += f"\n\nTop {len(other_docs)} other document types by relevancy score:\n"
            for doc, score, doc_id in other_docs:
                # Add document to output
                title = doc.get("csas_html_title") or doc.get("html_page_title") or doc.get("doc_title") or "Unknown"
                html_subject = doc.get("html_subject", "")
                doc_type = doc.get("html_doc_type", "Unknown")
                event = doc.get("csas_event", "Unknown")
                year = doc.get("csas_html_year") or doc.get("html_year") or doc.get("year") or "Unknown"
                
                output += f"\nDocument: {title}, Subject: {html_subject}\n"
                output += f"Document Type: {doc_type}\n"
                output += f"Similarity Score: {score:.4f}\n"
                output += f"CSAS Event: {event}, Year: {year}\n"
                text_content = doc.get('page_content', '').replace('\n', ' ')
                output += f"Content: {text_content}\n"
                
                # Add to sources
                sources.append({
                    "name": title,
                    "url": doc.get("html_url", ""),
                    "document_id": doc_id,
                    "relevancy_score": score,
                })
                
            # Return the formatted string, with metadata as JSON
            result = {
                "output": output,
                "metadata": {
                    "description": f"Search results for query: {user_query}",
                    "sources": sources,
                },
            }
            
            return json.dumps(result)
        except Exception as e:
            error_output = f"Error searching for '{user_query}': {str(e)}"
            return json.dumps({
                "output": error_output,
                "metadata": {
                    "description": f"Search error for query: {user_query}",
                    "sources": []
                }
            })
    
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
    ) -> List[Tuple[Dict, float, str]]:
        """
        Performs a hybrid similarity search and returns results with scores and document IDs.
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

        # 5. Parse the response hits and return tuples (result, score, doc_id).
        results = []
        for hit in response.get("hits", {}).get("hits", []):
            source_data = hit["_source"]
            if "highlight" in hit:
                source_data["highlight"] = hit["highlight"]
            score = hit.get("_score", 0)
            doc_id = hit.get("_id", "unknown_id")
            results.append((source_data, score, doc_id))
        
        return results
