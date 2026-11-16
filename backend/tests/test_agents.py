import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_agent_handshake_lifecycle_and_metrics(client: AsyncClient):
    await client.post("/api/v1/auth/register", json={
        "email": "agent_owner@sentinel.io",
        "password": "Password123!",
        "full_name": "Agent Owner",
        "organization_name": "DevOps Ltd"
    })
    login = await client.post("/api/v1/auth/login", data={
        "username": "agent_owner@sentinel.io",
        "password": "Password123!"
    })
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    org_id = (await client.get("/api/v1/organizations", headers=headers)).json()[0]["id"]

    create_res = await client.post(
        f"/api/v1/organizations/{org_id}/servers",
        json={"name": "VPS Hetzner Ubuntu"},
        headers=headers
    )
    temp_token = create_res.json()["install_token"]
    server_id = create_res.json()["id"]

    invalid_handshake = await client.post("/api/v1/agents/handshake", json={
        "temp_token": "inst_invalid_token_99999",
        "hostname": "vps-01",
        "agent_version": "1.0.0"
    })
    assert invalid_handshake.status_code == 400

    handshake_payload = {
        "temp_token": temp_token,
        "hostname": "vps-hetzner-01",
        "os_name": "Ubuntu",
        "os_version": "22.04 LTS",
        "kernel": "5.15.0-generic",
        "arch": "x86_64",
        "agent_version": "1.0.0"
    }
    handshake_res = await client.post("/api/v1/agents/handshake", json=handshake_payload)
    assert handshake_res.status_code == 200, handshake_res.text
    handshake_data = handshake_res.json()
    assert "agent_token" in handshake_data
    permanent_token = handshake_data["agent_token"]
    assert permanent_token.startswith("agt_")

    reused_handshake = await client.post("/api/v1/agents/handshake", json=handshake_payload)
    assert reused_handshake.status_code == 400
    assert "já foi utilizado" in reused_handshake.json()["detail"]

    server_res = await client.get(f"/api/v1/organizations/{org_id}/servers/{server_id}", headers=headers)
    assert server_res.json()["status"] == "online"
    assert server_res.json()["os_name"] == "Ubuntu"

    metrics_payload = {
        "agent_version": "1.0.0",
        "system": {"uptime_seconds": 3600},
        "cpu": {
            "usage_percent": 24.5,
            "cores_count": 4,
            "load_average": [0.45, 0.32, 0.15]
        },
        "memory": {
            "total_bytes": 8589934592,
            "used_bytes": 2147483648,
            "available_bytes": 6442450944,
            "usage_percent": 25.0
        },
        "disk": [
            {
                "mountpoint": "/",
                "device": "/dev/sda1",
                "total_bytes": 50000000000,
                "used_bytes": 15000000000,
                "free_bytes": 35000000000,
                "usage_percent": 30.0
            }
        ],
        "network": {
            "bytes_sent": 102400,
            "bytes_recv": 204800,
            "rate_sent_kbps": 15.2,
            "rate_recv_kbps": 45.8
        },
        "services": [
            {"name": "nginx", "running": True},
            {"name": "docker", "running": True}
        ]
    }

    unauth_res = await client.post(
        "/api/v1/agents/metrics",
        json=metrics_payload,
        headers={"X-Agent-Token": "agt_fake_token_12345"}
    )
    assert unauth_res.status_code == 401

    metrics_res = await client.post(
        "/api/v1/agents/metrics",
        json=metrics_payload,
        headers={"X-Agent-Token": permanent_token}
    )
    assert metrics_res.status_code == 200
    assert metrics_res.json()["status"] == "ok"
    assert "config" in metrics_res.json()
    assert "services" in metrics_res.json()["config"]

    server_detail = (await client.get(f"/api/v1/organizations/{org_id}/servers/{server_id}", headers=headers)).json()
    assert server_detail["last_cpu_percent"] == 24.5
    assert server_detail["last_ram_percent"] == 25.0
    assert server_detail["last_disk_percent"] == 30.0
    assert len(server_detail["metrics"]) == 1
    assert server_detail["metrics"][0]["cpu_percent"] == 24.5

    patch_res = await client.patch(
        f"/api/v1/organizations/{org_id}/servers/{server_id}",
        json={"monitored_services": ["redis", "pm2", "node", "supervisor"]},
        headers=headers
    )
    assert patch_res.status_code == 200
    assert "redis" in patch_res.json()["monitored_services"]
    assert "supervisor" in patch_res.json()["monitored_services"]

    next_metrics_res = await client.post(
        "/api/v1/agents/metrics",
        json=metrics_payload,
        headers={"X-Agent-Token": permanent_token}
    )
    assert next_metrics_res.status_code == 200
    returned_services = next_metrics_res.json()["config"]["services"]
    assert "redis" in returned_services
    assert "supervisor" in returned_services
