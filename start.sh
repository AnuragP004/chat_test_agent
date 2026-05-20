#!/bin/bash
set -e

echo "Starting Python LangGraph Agent on port 5001..."
# We run the agent in the background
python backend/chat_agent.py &

# Wait a brief moment to ensure Python has started
sleep 3

echo "Starting Node.js Express server on port ${PORT:-3000}..."
# We run Node in the foreground so Render can monitor it
node backend/server.js
