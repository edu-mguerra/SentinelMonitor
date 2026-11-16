import pytest
from httpx import AsyncClient
from unittest.mock import patch
from app.models.monitor import MonitorCheck

@pytest.mark.asyncio
async def test_monitor_crud_and_ssrf_protection(client: AsyncClient):
    reg = await client.post("/api/v1/auth/register", json={
        "email": "monitor_test@sentinel.io",
        "password": "Password123!",
        "full_name": "Monitor Tester",
        "organization_name": "Tech Corp"
    })
    assert reg.status_code == 201

    login = await client.post("/api/v1/auth/login", data={
        "username": "monitor_test@sentinel.io",
        "password": "Password123!"
    })
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    orgs_res = await client.get("/api/v1/organizations", headers=headers)
    org_id = orgs_res.json()[0]["id"]

    blocked_payload = {
        "name": "Ataque Localhost",
        "type": "http",
        "target": "http://127.0.0.1:5432/db",
        "interval_seconds": 60,
        "timeout_seconds": 5
    }
    blocked_res = await client.post(
        f"/api/v1/organizations/{org_id}/monitors",
        json=blocked_payload,
        headers=headers
    )
    assert blocked_res.status_code == 400
    assert "loopback/localhost é proibido" in blocked_res.json()["detail"]

    valid_payload = {
        "name": "Site Oficial",
        "type": "https",
        "target": "https://example.com",
        "interval_seconds": 60,
        "timeout_seconds": 5,
        "expected_status_code": 200,
        "consecutive_failures_threshold": 2
    }
    create_res = await client.post(
        f"/api/v1/organizations/{org_id}/monitors",
        json=valid_payload,
        headers=headers
    )
    assert create_res.status_code == 201
    monitor_data = create_res.json()
    assert monitor_data["name"] == "Site Oficial"
    assert monitor_data["status"] == "pending"
    monitor_id = monitor_data["id"]

    list_res = await client.get(f"/api/v1/organizations/{org_id}/monitors", headers=headers)
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1

@pytest.mark.asyncio
async def test_incident_creation_and_auto_resolution(client: AsyncClient):
    await client.post("/api/v1/auth/register", json={
        "email": "incident_test@sentinel.io",
        "password": "Password123!",
        "full_name": "Incident Tester",
        "organization_name": "Incident Corp"
    })
    login = await client.post("/api/v1/auth/login", data={
        "username": "incident_test@sentinel.io",
        "password": "Password123!"
    })
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    orgs_res = await client.get("/api/v1/organizations", headers=headers)
    org_id = orgs_res.json()[0]["id"]

    create_res = await client.post(
        f"/api/v1/organizations/{org_id}/monitors",
        json={
            "name": "API Crítica",
            "type": "https",
            "target": "https://example.com/api",
            "interval_seconds": 60,
            "timeout_seconds": 5,
            "consecutive_failures_threshold": 2
        },
        headers=headers
    )
    monitor_id = create_res.json()["id"]

    fail_check = MonitorCheck(
        is_success=False,
        status_code=500,
        response_time_ms=120.0,
        error_message="500 Internal Server Error"
    )
    with patch("app.services.checker._check_http", return_value=fail_check):
        c1 = await client.post(f"/api/v1/organizations/{org_id}/monitors/{monitor_id}/check", headers=headers)
        assert c1.status_code == 200

        m1 = await client.get(f"/api/v1/organizations/{org_id}/monitors/{monitor_id}", headers=headers)
        assert m1.json()["status"] == "degraded"
        assert m1.json()["current_failures"] == 1

        inc0 = await client.get(f"/api/v1/organizations/{org_id}/incidents", headers=headers)
        assert len(inc0.json()) == 0

    with patch("app.services.checker._check_http", return_value=fail_check):
        c2 = await client.post(f"/api/v1/organizations/{org_id}/monitors/{monitor_id}/check", headers=headers)
        assert c2.status_code == 200

        m2 = await client.get(f"/api/v1/organizations/{org_id}/monitors/{monitor_id}", headers=headers)
        assert m2.json()["status"] == "down"
        assert m2.json()["current_failures"] == 2

        inc1 = await client.get(f"/api/v1/organizations/{org_id}/incidents", headers=headers)
        incidents = inc1.json()
        assert len(incidents) == 1
        assert incidents[0]["status"] == "open"
        assert incidents[0]["severity"] == "critical"

    success_check = MonitorCheck(
        is_success=True,
        status_code=200,
        response_time_ms=45.0,
        error_message=None
    )
    with patch("app.services.checker._check_http", return_value=success_check):
        c3 = await client.post(f"/api/v1/organizations/{org_id}/monitors/{monitor_id}/check", headers=headers)
        assert c3.status_code == 200

        m3 = await client.get(f"/api/v1/organizations/{org_id}/monitors/{monitor_id}", headers=headers)
        assert m3.json()["status"] == "up"
        assert m3.json()["current_failures"] == 0

        inc2 = await client.get(f"/api/v1/organizations/{org_id}/incidents", headers=headers)
        resolved_inc = inc2.json()[0]
        assert resolved_inc["status"] == "resolved"
        assert resolved_inc["resolved_at"] is not None
