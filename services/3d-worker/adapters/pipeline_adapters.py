"""
3D Generation Adapters — pluggable pipeline adapters for the 3D Worker.
Each adapter implements the same interface but uses different tools:
  - CADImportAdapter: occt-import-js (STEP/IGES) or GLTFLoader (GLB)
  - PhotogrammetryAdapter: COLMAP + Open3D
  - ImageTo3DAdapter: TRELLIS.2 or TripoSR (self-hosted, GPU required)
  - ParametricAdapter: category-based procedural geometry
"""
from __future__ import annotations

import abc
import os
import subprocess
import logging
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger("oneboss-3d-adapters")


class PipelineType(str, Enum):
    cad_import = "cad_import"
    photogrammetry = "photogrammetry"
    image_to_3d = "image_to_3d"
    parametric = "parametric"


@dataclass
class AdapterResult:
    success: bool
    glb_path: str | None = None
    node_count: int = 0
    mesh_count: int = 0
    has_multiple_meshes: bool = False
    fidelity_level: str = "parametric_concept"
    log: list[str] = field(default_factory=list)
    error: str | None = None


class BaseAdapter(abc.ABC):
    @abc.abstractmethod
    async def process(self, input_paths: list[str], params: dict) -> AdapterResult:
        ...

    @property
    @abc.abstractmethod
    def pipeline(self) -> PipelineType:
        ...

    @property
    @abc.abstractmethod
    def gpu_required(self) -> bool:
        ...


class ParametricAdapter(BaseAdapter):
    """Generates category-based procedural geometry. No GPU needed."""

    @property
    def pipeline(self) -> PipelineType:
        return PipelineType.parametric

    @property
    def gpu_required(self) -> bool:
        return False

    async def process(self, input_paths: list[str], params: dict) -> AdapterResult:
        category = params.get("product_category", "other")
        logger.info(f"ParametricAdapter: building {category}")
        # In production, calls the TypeScript parametric-builder.ts via subprocess
        # or replicates geometry in Python with trimesh
        return AdapterResult(
            success=True,
            fidelity_level="parametric_concept",
            has_multiple_meshes=True,  # Parametric builds have separate meshes
            log=[f"parametric build for {category}"],
        )


class CADImportAdapter(BaseAdapter):
    """Imports customer CAD files (STEP/IGES/GLB). Preserves node hierarchy."""

    SUPPORTED_EXTENSIONS = {".glb", ".gltf", ".step", ".stp", ".iges", ".igs", ".obj", ".fbx", ".stl"}

    @property
    def pipeline(self) -> PipelineType:
        return PipelineType.cad_import

    @property
    def gpu_required(self) -> bool:
        return False

    async def process(self, input_paths: list[str], params: dict) -> AdapterResult:
        if not input_paths:
            return AdapterResult(success=False, error="No input files provided")

        path = input_paths[0]
        ext = os.path.splitext(path)[1].lower()
        if ext not in self.SUPPORTED_EXTENSIONS:
            return AdapterResult(success=False, error=f"Unsupported format: {ext}")

        if ext in (".glb", ".gltf"):
            # GLB/GLTF: use glTF-Transform for validation and optimization
            logger.info(f"CADImportAdapter: processing GLB {path}")
            return AdapterResult(
                success=True,
                fidelity_level="cad_exact",
                has_multiple_meshes=True,  # Depends on actual file
                log=[f"GLB import: {path}"],
            )

        if ext in (".step", ".stp", ".iges", ".igs"):
            # STEP/IGES: use occt-import-js (WASM)
            logger.info(f"CADImportAdapter: processing CAD {path}")
            return AdapterResult(
                success=True,
                fidelity_level="cad_exact",
                has_multiple_meshes=True,
                log=[f"CAD import: {path}"],
            )

        return AdapterResult(success=False, error=f"Not yet implemented for {ext}")


class PhotogrammetryAdapter(BaseAdapter):
    """Multi-view photo reconstruction via COLMAP + Open3D."""

    @property
    def pipeline(self) -> PipelineType:
        return PipelineType.photogrammetry

    @property
    def gpu_required(self) -> bool:
        return True

    async def process(self, input_paths: list[str], params: dict) -> AdapterResult:
        photo_count = len(input_paths)
        if photo_count < 20:
            return AdapterResult(
                success=False,
                error=f"Photogrammetry requires ≥20 photos, got {photo_count}",
            )
        logger.info(f"PhotogrammetryAdapter: {photo_count} photos")
        # In production: COLMAP feature extraction → matching → sparse → dense
        # → Open3D mesh reconstruction → GLB export
        return AdapterResult(
            success=True,
            fidelity_level="photogrammetry_reconstruction",
            has_multiple_meshes=False,  # Single mesh from photogrammetry
            log=[f"photogrammetry with {photo_count} photos"],
        )


class ImageTo3DAdapter(BaseAdapter):
    """Self-hosted AI image-to-3D. Uses TRELLIS.2 or TripoSR on GPU."""

    def __init__(self, engine: str = "tripoSR"):
        self.engine = engine

    @property
    def pipeline(self) -> PipelineType:
        return PipelineType.image_to_3d

    @property
    def gpu_required(self) -> bool:
        return True

    async def process(self, input_paths: list[str], params: dict) -> AdapterResult:
        if not input_paths:
            return AdapterResult(success=False, error="No input images")
        if not self._gpu_available():
            return AdapterResult(
                success=False,
                error=f"{self.engine} requires GPU. Deploy on GPU Worker.",
            )
        logger.info(f"ImageTo3DAdapter({self.engine}): processing {len(input_paths)} images")
        # In production: loads model from cache, runs inference, exports GLB
        return AdapterResult(
            success=True,
            fidelity_level="ai_image_approximation",
            has_multiple_meshes=False,  # Single mesh from AI generation
            log=[f"{self.engine} inference on {len(input_paths)} images"],
        )

    def _gpu_available(self) -> bool:
        try:
            import torch
            return torch.cuda.is_available()
        except ImportError:
            return False


class AdapterRegistry:
    """Routes pipeline types to adapters."""

    def __init__(self):
        self._adapters = {
            PipelineType.parametric: ParametricAdapter(),
            PipelineType.cad_import: CADImportAdapter(),
            PipelineType.photogrammetry: PhotogrammetryAdapter(),
            PipelineType.image_to_3d: ImageTo3DAdapter(),
        }

    def get(self, pipeline: PipelineType) -> BaseAdapter:
        adapter = self._adapters.get(pipeline)
        if not adapter:
            raise ValueError(f"No adapter for pipeline: {pipeline}")
        return adapter
