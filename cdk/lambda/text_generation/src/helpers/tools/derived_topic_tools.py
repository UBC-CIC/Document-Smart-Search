import json
from typing import Dict, List, Any, Tuple
from opensearchpy import OpenSearch

# Import this at the module level
from helpers.db import execute_query

# Configuration variables
TERMS_OF_REFERENCE_LIMIT = 10  # Number of "Terms of Reference" documents to return
OTHER_DOCS_LIMIT = 10  # Number of other document types to return

class DerivedTopicTools:
    """Tools for working with DFO derived topic information (stored in SQL database)."""
    
    def __init__(
        self, 
        opensearch_client: OpenSearch,
        html_index_name: str,
        region: str,
        conn 
    ):
        self.opensearch_client = opensearch_client
        self.html_index_name = html_index_name
        self.region = region
        self.conn = conn
    
    def _get_all_derived_topic_names(self) -> List[Tuple[str, int]]:
        """
        Get all derived topic names and their document counts from the database.
        Returns a list of tuples (topic_name, document_count).
        """
        query = """
        SELECT DISTINCT topic_name, COUNT(html_url) as doc_count
        FROM documents_derived_topic
        GROUP BY topic_name
        ORDER BY topic_name;
        """
        
        try:
            results = execute_query(query, self.conn)
            return [(topic_name, doc_count) for topic_name, doc_count in results]
        except Exception as e:
            print(f"Error retrieving derived topics: {e}")
            return []
    
    def get_combined_derived_topics(self) -> str:
        """
        Combine derived topics into a single text string with document counts.
        """
        topics_with_counts = self._get_all_derived_topic_names()
        
        combined_items = ""
        for topic_name, doc_count in topics_with_counts:
            combined_items += f"- {topic_name}: Total Related Documents: {doc_count}\n"
        
        return combined_items
    
    def get_all_dfo_derived_topics_and_counts(self, _: Any) -> str:
        """
        Returns all DFO derived topics with their document counts.
        This is a tool function for the agent.
        """
        combined_topics = self.get_combined_derived_topics()
        return json.dumps({
            "output": combined_topics,
            "metadata": {
                "description": "DFO Derived Topics with Document Counts"
            }
        })

    def _count_derived_topic_documents(self, topic_name: str) -> int:
        """Count total number of documents related to a derived topic."""
        count_query = f"""
        SELECT COUNT(*)
        FROM documents d
        INNER JOIN documents_derived_topic ddt
          ON d.html_url = ddt.html_url
        WHERE ddt.topic_name = '{topic_name}';
        """
        result = execute_query(count_query, self.conn)
        return result[0][0] if result else 0
    
    def _get_document_content(self, doc_id: str) -> Dict[str, Any]:
        """Get document content by ID from OpenSearch."""
        try:
            resp = self.opensearch_client.get(
                index=self.html_index_name,
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

    def _derived_topic_exists(self, topic_name: str) -> bool:
        """Check if a derived topic exists in the database."""
        query = f"""
        SELECT COUNT(*) 
        FROM derived_topics
        WHERE topic_name = '{topic_name}';
        """
        result = execute_query(query, self.conn)
        return result[0][0] > 0 if result else False

    def derived_topic_related_documents_tool(self, topic_name: str) -> str:
        """
        Return documents linked to a derived topic as a formatted string.
        Include document counts by year and full document content.
        Returns Terms of Reference documents and other document types separately.
        Returns error message if topic not found.
        """
        # First check if derived topic exists
        if not self._derived_topic_exists(topic_name):
            return json.dumps({
                "output": f"Derived topic '{topic_name}' not found. Please check the topic name and try again.",
                "metadata": {
                    "description": f"Error: Derived topic not found",
                    "sources": []
                }
            })
        
        # Query to get Terms of Reference documents
        terms_query = f"""
        SELECT d.doc_id,
               d.html_url,
               d.title,
               d.doc_type,
               d.year,
               d.event_year,
               d.event_subject,
               ddt.confidence_score AS semantic_score
        FROM documents d
        INNER JOIN documents_derived_topic ddt
          ON d.html_url = ddt.html_url
        WHERE ddt.topic_name = '{topic_name}'
          AND d.doc_type = 'Terms of Reference'
        ORDER BY ddt.confidence_score DESC
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
               ddt.confidence_score AS semantic_score
        FROM documents d
        INNER JOIN documents_derived_topic ddt
          ON d.html_url = ddt.html_url
        WHERE ddt.topic_name = '{topic_name}'
          AND d.doc_type != 'Terms of Reference'
        ORDER BY ddt.confidence_score DESC
        LIMIT {OTHER_DOCS_LIMIT};
        """
        
        # Query to count total documents for this derived topic
        count_query = f"""
        SELECT COUNT(*) 
        FROM documents_derived_topic
        WHERE topic_name = '{topic_name}';
        """
        
        # Query to get document counts by year
        year_query = f"""
        SELECT d.event_year, COUNT(*) 
        FROM documents d
        INNER JOIN documents_derived_topic ddt
          ON d.html_url = ddt.html_url
        WHERE ddt.topic_name = '{topic_name}'
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
            output += f"\nTop {TERMS_OF_REFERENCE_LIMIT} Terms of Reference documents by confidence score:\n"
            for doc_id, url, title, doc_type, year, event_year, event_subject, confidence_score in terms_rows:
                # Get full document content
                doc_content = self._get_document_content(doc_id)
                
                # Add document to output
                html_subject = doc_content.get('document_subject', '')
                output += f"\nDocument: {title}, Subject: {html_subject}\n"
                output += f"Document Type: {doc_type}\n"
                output += f"Confidence Score: {confidence_score}\n"
                output += f"CSAS Event: {event_subject}, Year: {event_year or year or 'Unknown'}\n"
                text_content = doc_content.get('text', '').replace('\n', ' ')
                output += f"Content: {text_content}\n"
                
                # Add to sources
                sources.append({
                    "name": title,
                    "url": url,
                    "document_id": doc_id,
                    "relevancy_score": float(confidence_score) if confidence_score is not None else 0,
                })
            
            # Process other document types
            output += f"\n\nTop {OTHER_DOCS_LIMIT} other document types by confidence score:\n"
            for doc_id, url, title, doc_type, year, event_year, event_subject, confidence_score in other_rows:
                # Get full document content
                doc_content = self._get_document_content(doc_id)
                
                # Add document to output
                html_subject = doc_content.get('document_subject', '')
                output += f"\nDocument: {title}, Subject: {html_subject}\n"
                output += f"Document Type: {doc_type}\n"
                output += f"Confidence Score: {confidence_score}\n"
                output += f"CSAS Event: {event_subject}, Year: {event_year or year or 'Unknown'}\n"
                text_content = doc_content.get('text', '').replace('\n', ' ')
                output += f"Content: {text_content}\n"
                
                # Add to sources
                sources.append({
                    "name": title,
                    "url": url,
                    "document_id": doc_id,
                    "relevancy_score": float(confidence_score) if confidence_score is not None else 0,
                })
                
            # Return the formatted string, but still embed source metadata as JSON
            result = {
                "output": output,
                "metadata": {
                    "description": f"Documents related to derived topic: {topic_name}",
                    "sources": sources,
                },
            }
            
            return json.dumps(result)
        except Exception as e:
            error_output = f"Error retrieving documents for derived topic '{topic_name}': {str(e)}"
            return json.dumps({
                "output": error_output,
                "metadata": {
                    "description": f"Documents related to derived topic: {topic_name}",
                    "sources": []
                }
            })
