import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_register_and_login_success(client: AsyncClient):
    payload = {
        "email": "admin@sentinel.io",
        "password": "StrongPassword123!",
        "full_name": "Admin Teste",
        "organization_name": "Sentinel Org"
    }
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["email"] == "admin@sentinel.io"
    assert "id" in data

    login_data = {
        "username": "admin@sentinel.io",
        "password": "StrongPassword123!"
    }
    login_response = await client.post("/api/v1/auth/login", data=login_data)
    assert login_response.status_code == 200, login_response.text
    token_data = login_response.json()
    assert "access_token" in token_data
    assert "refresh_token" in token_data
    assert token_data["token_type"] == "bearer"

    headers = {"Authorization": f"Bearer {token_data['access_token']}"}
    me_response = await client.get("/api/v1/auth/me", headers=headers)
    assert me_response.status_code == 200
    me_data = me_response.json()
    assert me_data["email"] == "admin@sentinel.io"

@pytest.mark.asyncio
async def test_login_invalid_password(client: AsyncClient):
    payload = {
        "email": "user@test.com",
        "password": "PasswordCorrect123!",
        "full_name": "User Test"
    }
    await client.post("/api/v1/auth/register", json=payload)

    login_data = {
        "username": "user@test.com",
        "password": "WrongPassword999!"
    }
    response = await client.post("/api/v1/auth/login", data=login_data)
    assert response.status_code == 401
