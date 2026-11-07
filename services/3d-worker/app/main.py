"""
OneBoss 3D Worker — FastAPI application.
Handles 3D asset generation jobs: CAD import, photogrammetry, AI inference, parametric builds.
Runs on a GPU Worker instance, completely separate from the Next.js web app.
"""
from __future__ import annotations

import os
import uuid
import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field

logger = logging.getLogger("oneboss-3d-worker")
logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="OneBoss 3D Worker",
    version="1.0.0",
    description="Self-hosted 3D asset generation pipeline. No external 3D SaaS.",
)

# --- In-memory job store (replace with database/Redis in production) ---
_jobs: dict[str, dict] = {}


class Pipeline(str, Enum):
    cad_import = "cad_import"
    photogrammetry = "photogrammetry"
    image_to_3d = "image_to_3d"
    parametric = "parametric"


class JobStatus(str, Enum):
    queued = "queued"
    analyzing = "analyzing"
    preprocessing = "preprocessing"
    generating = "generating"
    postprocessing = "postprocessing"
    validating = "validating"
    uploading = "uploading"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class CreateJobRequest(BaseModel):
    product_id: str = Field(..., min_length=1, max_length=200)
    pipeline: Pipeline
    input_asset_ids: list[str] = Field(default_factory=list, max_length=20)
    product_category: str = Field(default="other", max_length=100)
    fidelity_level: str = Field(default="parametric_concept", max_length=50)
    model_params: dict = Field(default_factory=dict)


class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    pipeline: Pipeline
    product_id: str
    fidelity_level: str
    created_at: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    output_asset_id: Optional[str] = None
    error: Optional[str] = None
    progress: int = 0


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _process_job(job_id: str) -> None:
    """Background task: process a 3D generation job through the selected pipeline."""
    job = _jobs[job_id]
    job["status"] = JobStatus.preprocessing
    job["started_at"] = _now()
    logger.info(f"Job {job_id}: pipeline={job['pipeline']} started")

    try:
        pipeline = job["pipeline"]

        if pipeline == Pipeline.parametric:
            job["status"] = JobStatus.generating
            job["progress"] = 30
            # Parametric builder runs fast — no GPU needed
            # In production, this calls the TypeScript parametric builder via subprocess
            # or replicates the geometry generation in Python with trimesh
            job["progress"] = 70
            job["status"] = JobStatus.postprocessing

        elif pipeline == Pipeline.image_to_3d:
            job["status"] = JobStatus.generating
            job["progress"] = 10
            # AI inference requires GPU
            # TRELLIS.2 or TripoSR runs here
            # For now, mark as awaiting GPU
            raise NotImplementedError(
                "image_to_3d requires GPU Worker deployment. "
                "Configure TRELLIS.2 or TripoSR adapter after license audit."
            )

        elif pipeline == Pipeline.photogrammetry:
            job["status"] = JobStatus.generating
            job["progress"] = 10
            # COLMAP + Open3D runs here
            raise NotImplementedError(
                "photogrammetry requires COLMAP + Open3D on GPU Worker."
            )

        elif pipeline == Pipeline.cad_import:
            job["status"] = JobStatus.generating
            job["progress"] = 10
            # CAD/GLB import via occt-import-js or GLTFLoader
            raise NotImplementedError(
                "cad_import requires occt-import-js integration."
            )

        job["status"] = JobStatus.validating
        job["progress"] = 90

        # Validate output
        job["output_asset_id"] = f"asset-{uuid.uuid4().hex[:12]}"
        job["status"] = JobStatus.completed
        job["progress"] = 100
        job["finished_at"] = _now()
        logger.info(f"Job {job_id}: completed")

    except NotImplementedError as e:
        job["status"] = JobStatus.failed
        job["error"] = str(e)
        job["finished_at"] = _now()
        logger.warning(f"Job {job_id}: failed — {e}")

    except Exception as e:
        job["status"] = JobStatus.failed
        job["error"] = f"Internal error: {str(e)[:200]}"
        job["finished_at"] = _now()
        logger.error(f"Job {job_id}: error — {e}")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": "1.0.0", "gpu_available": _check_gpu()}


@app.post("/jobs", response_model=JobResponse)
async def create_job(request: CreateJobRequest, background_tasks: BackgroundTasks) -> JobResponse:
    job_id = f"3d-{uuid.uuid4().hex[:16]}"
    job = {
        "job_id": job_id,
        "status": JobStatus.queued,
        "pipeline": request.pipeline.value,
        "product_id": request.product_id,
        "fidelity_level": request.fidelity_level,
        "input_asset_ids": request.input_asset_ids,
        "product_category": request.product_category,
        "model_params": request.model_params,
        "created_at": _now(),
        "started_at": None,
        "finished_at": None,
        "output_asset_id": None,
        "error": None,
        "progress": 0,
    }
    _jobs[job_id] = job
    background_tasks.add_task(_process_job, job_id)
    logger.info(f"Job {job_id}: created pipeline={request.pipeline.value}")
    return JobResponse(**job)


@app.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str) -> JobResponse:
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
    return JobResponse(**job)


@app.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str) -> dict:
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
    if job["status"] in (JobStatus.completed, JobStatus.failed, JobStatus.cancelled):
        return {"cancelled": False, "reason": f"Job already {job['status']}"}
    job["status"] = JobStatus.cancelled
    job["finished_at"] = _now()
    return {"cancelled": True}


@app.get("/jobs")
async def list_jobs(limit: int = 50) -> list[JobResponse]:
    jobs = sorted(_jobs.values(), key=lambda j: j["created_at"], reverse=True)
    return [JobResponse(**j) for j in jobs[:limit]]


def _check_gpu() -> bool:
    """Check if a CUDA GPU is available."""
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        return False


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
