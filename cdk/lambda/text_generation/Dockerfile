FROM public.ecr.aws/lambda/python:3.12.2025.08.14.14-x86_64

# Install system dependencies
# This Python 3.12 AWS Lambda Image is based on Amazon Linux 2023, which use dnf instead of yum
RUN dnf -y install postgresql-devel gcc libpq

# Copy requirements.txt
COPY requirements.txt ${LAMBDA_TASK_ROOT}

# Install Python packages
RUN pip install --no-cache-dir -r requirements.txt

# Copy the source code
COPY src/ ${LAMBDA_TASK_ROOT}

# Set the CMD to your handler
CMD [ "main.handler" ]