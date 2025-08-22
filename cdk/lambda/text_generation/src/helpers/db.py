import logging
from typing import Any, Dict, List, Optional, Tuple

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()

def execute_query(q: str, conn, verbose=False) -> Optional[List[Tuple]]:
    """
    Execute a SQL statement string using an existing connection.
    
    Parameters:
    -----------
    q : str
        SQL statement string
    conn : psycopg connection object
        An existing database connection
    verbose : bool, default=False
        Whether to log query execution
        
    Returns:
    --------
    List of tuples or None
        Query results if SELECT, None otherwise
    """
    res = None
    if "select" in q.lower():
        with conn.cursor() as cur:
            cur.execute(q)
            res = cur.fetchall()
    else:
        with conn.cursor() as cur:
            cur.execute(q)
    if verbose:
        logger.info("Query executed!")
    return res
