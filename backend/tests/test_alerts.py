import pytest
from httpx import AsyncClient
from unittest.mock import patch

@pytest.mark.asyncio
async def test_alert_config_and_mocked_test_email(client: AsyncClient):
    await client.post("/api/v1/auth/register", json={
        "email": "alert_tester@sentinel.io",
        "password": "Password123!",
        "full_name": "Alert Tester",
        "organization_name": "Alert Corp"
    })
    login = await client.post("/api/v1/auth/login", data={
        "username": "alert_tester@sentinel.io",
        "password": "Password123!"
    })
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    org_id = (await client.get("/api/v1/organizations", headers=headers)).json()[0]["id"]

    config_res = await client.get(f"/api/v1/organizations/{org_id}/alerts/config", headers=headers)
    assert config_res.status_code == 200, config_res.text
    config_data = config_res.json()
    assert config_data["rules"]["cpu_threshold"] == 85.0
    assert config_data["rules"]["ram_threshold"] == 90.0

    add_ch_res = await client.post(
        f"/api/v1/organizations/{org_id}/alerts/channels",
        json={
            "type": "email",
            "destination": "devops@empresa.com, ti@empresa.com",
            "is_active": True
        },
        headers=headers
    )
    assert add_ch_res.status_code == 201
    assert "devops@empresa.com" in add_ch_res.json()["destination"]

    update_rules_res = await client.put(
        f"/api/v1/organizations/{org_id}/alerts/rules",
        json={
            "cpu_threshold": 92.5,
            "ram_threshold": 95.0,
            "disk_threshold": 88.0,
            "server_offline_timeout_seconds": 180,
            "notify_on_recovery": True
        },
        headers=headers
    )
    assert update_rules_res.status_code == 200
    assert update_rules_res.json()["cpu_threshold"] == 92.5

    with patch("app.services.email_service._send_smtp_sync", return_value=(True, None)):
        test_email_res = await client.post(
            f"/api/v1/organizations/{org_id}/alerts/test",
            json={"recipient": "alguem@empresa.com"},
            headers=headers
        )
        assert test_email_res.status_code == 200
        assert test_email_res.json()["status"] == "success"

    history_res = await client.get(f"/api/v1/organizations/{org_id}/alerts/history", headers=headers)
    assert history_res.status_code == 200
    history = history_res.json()
    assert len(history) == 1
    assert history[0]["recipient"] == "alguem@empresa.com"
    assert history[0]["is_success"] is True
