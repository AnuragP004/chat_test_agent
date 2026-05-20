FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install system dependencies and Node.js (via Nodesource)
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy root configurations (if any)
COPY package*.json ./

# Install Frontend Dependencies and Build
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Install Backend Node Dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm install

# Install Python Dependencies
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy the rest of the application
COPY . .

# Ensure start script is executable
RUN chmod +x start.sh

# Expose the port (Render provides this via PORT env var, default 3000 here)
EXPOSE 3000

# Start both services
CMD ["./start.sh"]
