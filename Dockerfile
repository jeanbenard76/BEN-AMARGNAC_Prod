FROM python:3.12-slim

# Prevent Python from writing .pyc files and enable buffered stdout
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=5000

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Ensure data directory exists for SQLite
RUN mkdir -p /app/data

EXPOSE 5000

# Run with Gunicorn production server with 4 worker threads
CMD ["gunicorn", "--workers=4", "--bind=0.0.0.0:5000", "--timeout=120", "app:app"]

