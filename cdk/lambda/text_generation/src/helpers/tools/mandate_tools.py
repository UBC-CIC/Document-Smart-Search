import json
from typing import Dict, List, Any
from collections import defaultdict
from langchain_core.documents import Document
from opensearchpy import OpenSearch

# Import this at the module level
from helpers.db import execute_query

# Configuration variables
TERMS_OF_REFERENCE_LIMIT = 10  # Number of "Terms of Reference" documents to return
OTHER_DOCS_LIMIT = 10  # Number of other document types to return

class MandateTools:
    """Tools for working with DFO mandate information."""
    
    def __init__(
        self, 
        opensearch_client: OpenSearch,
        mandate_index_name: str,
        html_index_name: str,
        region: str,
        conn 
    ):
        self.opensearch_client = opensearch_client
        self.mandate_index_name = mandate_index_name
        self.html_index_name = html_index_name
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
    
    def _count_mandate_documents(self, mandate_name: str) -> int:
        """Count total number of documents related to a mandate."""
        count_query = f"""
        SELECT COUNT(*)
        FROM documents d
        INNER JOIN documents_mandates dm
          ON d.html_url = dm.html_url
        WHERE dm.mandate_name = '{mandate_name}'
          AND dm.llm_belongs = 'Yes';
        """
        result = execute_query(count_query, self.conn)
        return result[0][0] if result else 0
    
    def get_combined_mandates(self) -> str:
        """
        Combine mandates into a single text string with document counts.
        """
        items_by_name = self.get_all_items()
        combined_items = ""
        for item_name, docs in items_by_name.items():
            # Get document count for this mandate
            doc_count = self._count_mandate_documents(item_name)
            
            combined_items += f"- {item_name}:"
            for doc in docs:
                description = doc.metadata.get('description', 'No description').replace(":", " -")
                combined_items += f" {description} (Number of related documents: {doc_count})"
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

    def _get_document_content(self, doc_id: str) -> Dict[str, Any]:
        """Get document content by ID from OpenSearch."""
        try:
            resp = self.opensearch_client.get(
                index=self.html_index_name,  # Use the instance variable
                id=doc_id,
                _source=[
                    "html_subject",
                    "csas_html_title",
                    "csas_event",
                    "csas_html_year",
                    "html_url",
                    "page_content",
                    "html_doc_type"
                ]
            )
            src = resp["_source"]
            title = src.get("html_subject") or src.get("csas_html_title") or "Unknown"

            return {
                "title": title,
                "document_type": src.get("html_doc_type", "Unknown"),
                "document_subject": src.get("html_subject", "Unknown"),
                "csas_event": src.get("csas_event", "Unknown"),
                "csas_event_year": src.get("csas_html_year", "Unknown"),
                "document_url": src.get("html_url", "Unknown"),
                "text": src.get("page_content", ""),
            }
        except Exception as e:
            return {"title": "Document not found", "text": ""}

    def mandate_related_documents_tool(self, mandate_name: str) -> str:
        """
        Return documents linked to a mandate as a formatted string.
        Include document counts by year and full document content.
        Returns Terms of Reference documents and other document types separately.
        """
        # Query to get Terms of Reference documents
        terms_query = f"""
        SELECT d.doc_id,
               d.html_url,
               d.title,
               d.doc_type,
               d.year,
               d.event_year,
               d.event_subject,
               dm.semantic_score,
               dm.llm_score,
               dm.llm_explanation
        FROM documents d
        INNER JOIN documents_mandates dm
          ON d.html_url = dm.html_url
        WHERE dm.mandate_name = '{mandate_name}'
          AND dm.llm_belongs = 'Yes'
          AND d.doc_type = 'Terms of Reference'
        ORDER BY dm.llm_score DESC
        LIMIT {TERMS_OF_REFERENCE_LIMIT};
        """
        
        # Query to get other document types
        other_query = f"""
        SELECT d.doc_id,
               d.html_url,
               d.title,
               d.doc_type,
               d.year,
               d.event_year,
               d.event_subject,
               dm.semantic_score,
               dm.llm_score,
               dm.llm_explanation
        FROM documents d
        INNER JOIN documents_mandates dm
          ON d.html_url = dm.html_url
        WHERE dm.mandate_name = '{mandate_name}'
          AND dm.llm_belongs = 'Yes'
          AND d.doc_type != 'Terms of Reference'
        ORDER BY dm.llm_score DESC
        LIMIT {OTHER_DOCS_LIMIT};
        """
        
        # Query to count total documents for this mandate
        count_query = f"""
        SELECT COUNT(*) 
        FROM documents_mandates 
        WHERE mandate_name = '{mandate_name}' 
        AND llm_belongs = 'Yes';
        """
        
        # Query to get document counts by year
        year_query = f"""
        SELECT d.event_year, COUNT(*) 
        FROM documents d
        INNER JOIN documents_mandates dm
          ON d.html_url = dm.html_url
        WHERE dm.mandate_name = '{mandate_name}'
          AND dm.llm_belongs = 'Yes'
        GROUP BY d.event_year
        ORDER BY d.event_year DESC;
        """
        
        try:
            # Get total count of documents
            total_count = execute_query(count_query, self.conn)[0][0]
            
            # Get documents by year
            year_counts = execute_query(year_query, self.conn)
            
            # Get Terms of Reference documents
            terms_rows = execute_query(terms_query, self.conn)
            
            # Get other document types
            other_rows = execute_query(other_query, self.conn)
            
            # Format the output string
            output = f"Total Number of related documents: {total_count}\n\n"
            
            # Add documents by years
            output += "Related documents by Years:\n"
            for year, count in year_counts:
                year_str = year if year else "Unknown Year"
                output += f"- {year_str}: {count} documents\n"
            
            # Create sources for metadata
            sources = []
            
            # Process Terms of Reference documents
            output += f"\nTop {TERMS_OF_REFERENCE_LIMIT} Terms of Reference documents by LLM score:\n"
            for doc_id, url, title, doc_type, year, event_year, event_subject, semantic_score, llm_score, _ in terms_rows:
                # Get full document content
                doc_content = self._get_document_content(doc_id)
                
                # Add document to output
                html_subject = doc_content.get('document_subject', '')
                output += f"\nDocument: {title}, Subject: {html_subject}\n"
                output += f"Document Type: {doc_type}\n"
                output += f"LLM Rated Similarity Score: {llm_score}\n"
                output += f"CSAS Event: {event_subject}, Year: {event_year or year or 'Unknown'}\n"
                text_content = doc_content.get('text', '').replace('\n', ' ')
                output += f"Content: {text_content}\n"
                
                # Add to sources
                sources.append({
                    "name": title,
                    "url": url,
                    "document_id": doc_id,
                    "relevancy_score": llm_score / 10,
                })
            
            # Process other document types
            output += f"\n\nTop {OTHER_DOCS_LIMIT} other document types by LLM score:\n"
            for doc_id, url, title, doc_type, year, event_year, event_subject, semantic_score, llm_score, _ in other_rows:
                # Get full document content
                doc_content = self._get_document_content(doc_id)
                
                # Add document to output
                html_subject = doc_content.get('document_subject', '')
                output += f"\nDocument: {title}, Subject: {html_subject}\n"
                output += f"Document Type: {doc_type}\n"
                output += f"LLM Rated Similarity Score: {llm_score}\n"
                output += f"CSAS Event: {event_subject}, Year: {event_year or year or 'Unknown'}\n"
                text_content = doc_content.get('text', '').replace('\n', ' ')
                output += f"Content: {text_content}\n"
                
                # Add to sources
                sources.append({
                    "name": title,
                    "url": url,
                    "document_id": doc_id,
                    "relevancy_score": llm_score / 10,
                })
                
            # Return the formatted string, but still embed source metadata as JSON
            result = {
                "output": output,
                "metadata": {
                    "description": f"LLM categorized documents that relate to mandate: {mandate_name}",
                    "sources": sources,
                },
            }
            
            return json.dumps(result)
        except Exception as e:
            error_output = f"Error retrieving documents for mandate '{mandate_name}': {str(e)}"
            return json.dumps({
                "output": error_output,
                "metadata": {
                    "description": f"LLM categorized documents that relate to mandate: {mandate_name}",
                    "sources": []
                }
            })