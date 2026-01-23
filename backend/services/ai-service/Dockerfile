FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY prompts/ ./prompts/

# Set environment
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Run the service
CMD ["python", "-m", "src"]
