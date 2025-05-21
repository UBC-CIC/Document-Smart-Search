import json

def handler(event, context):
    try:
        body = json.loads(event.get("body", "{}"))
        filters_requested = body.get("filters", [])

        # Example static response (replace with dynamic logic as needed)
        all_filters = {
            "years": [2019, 2020, 2021, 2022],
            "topics": ["climate", "fisheries", "pollution"],
            "mandates": ["DFO", "EPA", "NOAA"],
            "authors": ["Jane Doe", "John Smith"],
            "documentTypes": ["report", "policy", "brief"]
        }

        response_data = {key: all_filters.get(key) for key in filters_requested if key in all_filters}

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS"
            },
            "body": json.dumps(response_data)
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }
