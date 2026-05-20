import httpx
import asyncio
import os
from fastmcp import FastMCP
from typing import Optional, List, Dict, Any

# Create an MCP server
mcp = FastMCP("Jobs & Tasks Management")

PORT = os.getenv("PORT", "3000")
API_BASE_URL = f"http://localhost:{PORT}/api"
TEST_USER_EMAIL = "test@example.com"
_token: Optional[str] = None

async def get_token():
    global _token
    if _token:
        return _token
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(f"{API_BASE_URL}/test-token", json={"email": TEST_USER_EMAIL})
            resp.raise_for_status()
            data = resp.json()
            _token = data.get("token")
            return _token
        except Exception as e:
            print(f"Error getting token: {e}")
            return None

async def api_request(method: str, path: str, **kwargs):
    token = await get_token()
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    async with httpx.AsyncClient() as client:
        url = f"{API_BASE_URL}{path}"
        resp = await client.request(method, url, headers=headers, **kwargs)
        resp.raise_for_status()
        if resp.status_code == 204:
            return {"success": True}
        return resp.json()

@mcp.tool()
async def search_for_jobs(query: str) -> Dict[str, Any]:
    """
    Search for jobs by title or customer name to find their unique job_id (UUID).
    YOU MUST ALWAYS DO THIS FIRST to find the UUID before calling any other tool that requires one.
    """
    params = {"search": query}
    return await api_request("GET", "/jobs", params=params)

@mcp.tool()
async def get_full_job_details(job_id: str) -> Dict[str, Any]:
    """
    Get all information for a specific job, including its tasks and current estimate.
    Requires a valid job_id UUID.
    """
    return await api_request("GET", f"/jobs/{job_id}")

@mcp.tool()
async def add_new_task_to_job(job_id: str, name: str, task_type: str, quantity: float, price_per_unit: float, notes: Optional[str] = None) -> Dict[str, Any]:
    """
    Add a task or line item to a job.
    Requires a valid job_id UUID.
    task_type must be 'labour' or 'material'.
    """
    payload = {
        "name": name,
        "type": task_type,
        "qty": quantity,
        "unit_rate": price_per_unit,
        "notes": notes,
        "taxable": True # Default to true as per backend logic
    }
    return await api_request("POST", f"/jobs/{job_id}/tasks", json=payload)

@mcp.tool()
async def create_new_service_job(title: str, customer: str, priority: str = "normal", notes: Optional[str] = None) -> Dict[str, Any]:
    """
    Create a brand new service job.
    priority can be 'low', 'normal', or 'high'.
    """
    payload = {
        "title": title,
        "customer": customer,
        "priority": priority,
        "notes": notes
    }
    return await api_request("POST", "/jobs", json=payload)

@mcp.tool()
async def remove_job_from_system(job_id: str) -> Dict[str, Any]:
    """
    Permanently delete a job and all its tasks.
    Requires a valid job_id UUID.
    """
    return await api_request("DELETE", f"/jobs/{job_id}")

@mcp.tool()
async def update_existing_job(job_id: str, title: Optional[str] = None, status: Optional[str] = None, priority: Optional[str] = None) -> Dict[str, Any]:
    """
    Update basic fields of an existing job.
    Requires a valid job_id UUID.
    status can be 'open', 'in_progress', or 'closed'.
    """
    updates = {}
    if title: updates["title"] = title
    if status: updates["status"] = status
    if priority: updates["priority"] = priority
    return await api_request("PATCH", f"/jobs/{job_id}", json=updates)

@mcp.tool()
async def lock_and_approve_estimate(job_id: str, approved_by_name: str) -> Dict[str, Any]:
    """
    Approve the estimate for a job, which locks it from further editing.
    Requires a valid job_id UUID.
    """
    return await api_request("POST", f"/jobs/{job_id}/estimate/approve", json={"approved_by": approved_by_name})

if __name__ == "__main__":
    mcp.run()
