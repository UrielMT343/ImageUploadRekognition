# Stage 1 - Builder
FROM python:3.9-slim as builder

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Stage 2 - Minimal Runtime
FROM python:3.9-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*
    
COPY --from=builder /usr/local/lib/python3.9/site-packages /usr/local/lib/python3.9/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY --from=builder /app .

HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

EXPOSE 5000
CMD ["sh", "-c", \
    "echo 'Starting model loading...' && \
     uvicorn app:app --host 0.0.0.0 --port 5000 --log-level debug & \
     while ! curl -s http://localhost:5000/health | grep -q 'Nice and healthy'; do \
       sleep 2; \
       echo 'Waiting for model to load...'; \
     done; \
     echo 'Service fully ready'; \
     wait"]