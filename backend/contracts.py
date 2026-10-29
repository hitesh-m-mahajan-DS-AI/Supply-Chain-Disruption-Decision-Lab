"""One strict request contract for presets, API calls and saved runs."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class Parameters(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    name: str = Field(default="Supplier outage", min_length=1, max_length=80)
    demand_pct: int = Field(default=100, ge=50, le=180)
    budget_gbp: int = Field(default=5000, ge=0, le=30000)
    disrupted_supplier: Literal["None", "Atlas", "Beacon", "Cobalt", "All"] = "Atlas"
    supplier_capacity_pct: int = Field(default=100, ge=0, le=100)
    extra_lead_days: int = Field(default=0, ge=0, le=10)
    allow_transfers: bool = True
    transfer_limit: int = Field(default=1200, ge=0, le=5000)
    minimum_service_pct: int = Field(default=0, ge=0, le=100)


PRESETS = [
    {"id": "outage", "title": "Supplier outage", "description": "Atlas is unavailable. Compare substitutes and stock transfers.", "parameters": Parameters().model_dump()},
    {"id": "normal", "title": "Normal operations", "description": "All three suppliers available under the same budget.", "parameters": Parameters(name="Normal operations", disrupted_supplier="None").model_dump()},
    {"id": "surge", "title": "Demand surge", "description": "Illustrative requirements increase by 40%; stock stays fixed.", "parameters": Parameters(name="Demand surge", demand_pct=140).model_dump()},
    {"id": "zero", "title": "No purchasing budget", "description": "Zero shared action budget also prevents paid transfers.", "parameters": Parameters(name="No purchasing budget", budget_gbp=0).model_dump()},
    {"id": "infeasible", "title": "Impossible service target", "description": "No suppliers or action budget, but a 100% service requirement.", "parameters": Parameters(name="Impossible service target", budget_gbp=0, disrupted_supplier="All", minimum_service_pct=100).model_dump()},
]
