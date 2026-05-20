import os
import sys
import asyncio
import json
import threading
from typing import Annotated, List, Union, Dict, Any, Optional
from typing_extensions import TypedDict

import httpx
from flask import Flask, request, jsonify
from dotenv import load_dotenv

from langchain_groq import ChatGroq
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_mcp_adapters.tools import load_mcp_tools

load_dotenv()

# ==========================================
# Background Event Loop Setup
# ==========================================

_loop = asyncio.new_event_loop()
def run_event_loop(loop):
    asyncio.set_event_loop(loop)
    loop.run_forever()

_thread = threading.Thread(target=run_event_loop, args=(_loop,), daemon=True)
_thread.start()

# ==========================================
# LangGraph Agent Implementation
# ==========================================

class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    intent: Optional[str]
    retrieved_records: Optional[List[Dict[str, Any]]]

SYSTEM_PROMPT = """You are the AI Project Manager for the Jobs & Tasks Management System.
To perform actions on jobs (details, update, delete, add task), you MUST first find the job_id.
Call 'search_for_jobs' with a query to find the job.
Once you have the UUID from the results, you can call the other tools in the NEXT turn.
Do not guess IDs. Do not nest tools.
"""

_graph = None
_graph_lock = threading.Lock()

async def get_graph():
    global _graph
    if _graph is not None:
        return _graph

    # Load tools via MCP client from mcp_tools.py
    current_dir = os.path.dirname(os.path.abspath(__file__))
    mcp_path = os.path.join(current_dir, "mcp_tools.py")
    
    connection = {
        "transport": "stdio",
        "command": sys.executable,
        "args": [mcp_path]
    }
    mcp_tools = await load_mcp_tools(None, connection=connection)

    llm = ChatGroq(model="meta-llama/llama-4-scout-17b-16e-instruct", temperature=0)

    async def chatbot_node(state: AgentState):
        """Reasoning node that decides next steps."""
        messages = state["messages"]
        if not any(isinstance(m, SystemMessage) for m in messages):
            messages = [SystemMessage(content=SYSTEM_PROMPT)] + messages
        
        # Simple binding
        llm_with_tools = llm.bind_tools(mcp_tools)
        response = await llm_with_tools.ainvoke(messages)
        return {"messages": [response]}

    # Build Graph
    builder = StateGraph(AgentState)
    builder.add_node("chatbot", chatbot_node)
    builder.add_node("tools", ToolNode(mcp_tools))

    builder.add_edge(START, "chatbot")
    builder.add_conditional_edges("chatbot", tools_condition)
    builder.add_edge("tools", "chatbot")

    _graph = builder.compile()
    return _graph

# = Flask Service =
app = Flask(__name__)

@app.route('/chat', methods=['POST'])
def chat_handler():
    data = request.json
    user_msg = data.get("message")
    history = data.get("history", [])
    
    print(f"DEBUG: Received message: {user_msg}")
    
    # Convert history to LangChain messages
    messages = []
    for h in history:
        if h['role'] == 'user': messages.append(HumanMessage(content=h['content']))
        else: messages.append(AIMessage(content=h['content']))
    
    messages.append(HumanMessage(content=user_msg))
    
    try:
        # Run graph in the background loop
        async def run_agent():
            graph = await get_graph()
            return await graph.ainvoke({"messages": messages})
        
        future = asyncio.run_coroutine_threadsafe(run_agent(), _loop)
        final_state = future.result(timeout=60) # Wait for result
        last_msg = final_state["messages"][-1]
        
        return jsonify({"text": last_msg.content})
    except Exception as e:
        print(f"ERROR in chat_handler: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    print("Starting LangGraph AI Project Manager (MCP Client mode) on port 5001...")
    app.run(port=5001, debug=False)
