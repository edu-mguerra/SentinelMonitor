import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_multi_tenant_isolation(client: AsyncClient):
    user_a = {
        "email": "user_a@tenant.com",
        "password": "PasswordUserA123!",
        "full_name": "User A",
        "organization_name": "Empresa Alfa"
    }
    res_a = await client.post("/api/v1/auth/register", json=user_a)
    assert res_a.status_code == 201

    login_a = await client.post("/api/v1/auth/login", data={"username": user_a["email"], "password": user_a["password"]})
    token_a = login_a.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    orgs_a_res = await client.get("/api/v1/organizations", headers=headers_a)
    orgs_a = orgs_a_res.json()
    assert len(orgs_a) == 1
    org_a_id = orgs_a[0]["id"]
    assert orgs_a[0]["name"] == "Empresa Alfa"

    user_b = {
        "email": "user_b@tenant.com",
        "password": "PasswordUserB123!",
        "full_name": "User B",
        "organization_name": "Empresa Beta"
    }
    res_b = await client.post("/api/v1/auth/register", json=user_b)
    assert res_b.status_code == 201

    login_b = await client.post("/api/v1/auth/login", data={"username": user_b["email"], "password": user_b["password"]})
    token_b = login_b.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    forbidden_res = await client.get(f"/api/v1/organizations/{org_a_id}", headers=headers_b)
    assert forbidden_res.status_code == 403, "Falha de isolamento: usuário acessou organização alheia!"
    assert "Acesso negado" in forbidden_res.json()["detail"]

    forbidden_members_res = await client.get(f"/api/v1/organizations/{org_a_id}/members", headers=headers_b)
    assert forbidden_members_res.status_code == 403

    allowed_res = await client.get(f"/api/v1/organizations/{org_a_id}", headers=headers_a)
    assert allowed_res.status_code == 200
    assert allowed_res.json()["name"] == "Empresa Alfa"

    master_user = {
        "email": "monitorsentinelnotify@gmail.com",
        "password": "MasterPassword123!",
        "full_name": "Sentinel Master",
        "organization_name": "Sentinel HQ"
    }
    await client.post("/api/v1/auth/register", json=master_user)
    master_login = await client.post("/api/v1/auth/login", data={"username": master_user["email"], "password": master_user["password"]})
    master_token = master_login.json()["access_token"]
    master_headers = {"Authorization": f"Bearer {master_token}"}

    master_forbidden = await client.get(f"/api/v1/organizations/{org_a_id}", headers=master_headers)
    assert master_forbidden.status_code == 403

    master_orgs = (await client.get("/api/v1/organizations", headers=master_headers)).json()
    assert len(master_orgs) == 1
    assert master_orgs[0]["name"] == "Sentinel HQ"

    admin_users_res = await client.get("/api/v1/admin/users", headers=master_headers)
    assert admin_users_res.status_code == 200
    admin_users = admin_users_res.json()
    emails = [u["email"] for u in admin_users]
    assert "user_a@tenant.com" in emails
    assert "user_b@tenant.com" in emails
    assert "monitorsentinelnotify@gmail.com" in emails

    common_user_blocked = await client.get("/api/v1/admin/users", headers=headers_a)
    assert common_user_blocked.status_code == 403
