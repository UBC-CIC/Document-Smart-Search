FROM public.ecr.aws/lambda/python:3.11

# Install system dependencies (only if needed)
# RUN yum -y install postgresql-devel gcc libpq  # uncomment if using psycopg2 or similar

# Copy and install Python dependencies
COPY requirements.txt ${LAMBDA_TASK_ROOT}
RUN pip install --no-cache-dir -r requirements.txt

# Copy your source code
COPY src/ ${LAMBDA_TASK_ROOT}

# Default command to run
CMD ["main.handler"]
