import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_server_creation_and_isolation(client: AsyncClient):
    await client.post("/api/v1/auth/register", json={
        "email": "server_admin@sentinel.io",
        "password": "Password123!",
        "full_name": "Server Admin",
        "organization_name": "Cloud Corp"
    })
    login_a = await client.post("/api/v1/auth/login", data={
        "username": "server_admin@sentinel.io",
        "password": "Password123!"
    })
    token_a = login_a.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    orgs_a = (await client.get("/api/v1/organizations", headers=headers_a)).json()
    org_a_id = orgs_a[0]["id"]

    create_res = await client.post(
        f"/api/v1/organizations/{org_a_id}/servers",
        json={"name": "VPS Produção SP"},
        headers=headers_a
    )
    assert create_res.status_code == 201, create_res.text
    srv_data = create_res.json()
    assert srv_data["name"] == "VPS Produção SP"
    assert srv_data["status"] == "pending"
    assert "install_token" in srv_data
    assert srv_data["install_token"].startswith("inst_")
    assert "curl -sL" in srv_data["install_command"]
    server_id = srv_data["id"]

    await client.post("/api/v1/auth/register", json={
        "email": "attacker@other.io",
        "password": "Password123!",
        "full_name": "Attacker",
        "organization_name": "Other Corp"
    })
    login_b = await client.post("/api/v1/auth/login", data={
        "username": "attacker@other.io",
        "password": "Password123!"
    })
    headers_b = {"Authorization": f"Bearer {login_b.json()['access_token']}"}

    forbidden_res = await client.get(
        f"/api/v1/organizations/{org_a_id}/servers/{server_id}",
        headers=headers_b
    )
    assert forbidden_res.status_code == 403

    forbidden_list = await client.get(
        f"/api/v1/organizations/{org_a_id}/servers",
        headers=headers_b
    )
    assert forbidden_list.status_code == 403

    forbidden_create = await client.post(
        f"/api/v1/organizations/{org_a_id}/servers",
        json={"name": "Hacker VPS"},
        headers=headers_b
    )
    assert forbidden_create.status_code == 403

    forbidden_delete = await client.delete(
        f"/api/v1/organizations/{org_a_id}/servers/{server_id}",
        headers=headers_b
    )
    assert forbidden_delete.status_code == 403

    allowed_res = await client.get(
        f"/api/v1/organizations/{org_a_id}/servers/{server_id}",
        headers=headers_a
    )
    assert allowed_res.status_code == 200
    assert allowed_res.json()["name"] == "VPS Produção SP"
