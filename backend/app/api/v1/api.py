from fastapi import APIRouter
from app.api.v1 import auth, organizations, monitors, incidents, servers, agents, installer_endpoint, alerts, admin

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(organizations.router)
api_router.include_router(monitors.router)
api_router.include_router(incidents.router)
api_router.include_router(servers.router)
api_router.include_router(agents.router)
api_router.include_router(installer_endpoint.router)
api_router.include_router(alerts.router)
api_router.include_router(admin.router)
