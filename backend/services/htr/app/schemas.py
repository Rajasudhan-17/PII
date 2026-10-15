from pydantic import BaseModel
from typing import Optional, List

class HTRRequest(BaseModel):
    image_base64: Optional[str] = None
    image_path: Optional[str] = None
    language: Optional[str] = "eng"

class LineBoundingBox(BaseModel):
    x0: float
    y0: float
    x1: float
    y1: float

class HTRLineResult(BaseModel):
    text: str
    confidence: Optional[float] = None
    bbox: Optional[LineBoundingBox] = None

class HTRResponse(BaseModel):
    status: str
    text: str
    confidence: Optional[float] = None
    lines: List[HTRLineResult] = []
    modelId: str = "microsoft/trocr-base-handwritten"
    modelRevision: Optional[str] = "17242d54e4c27a296fa28e578496464522883307"
    processorId: str = "TrOCRProcessor"
    runtimeVersion: str = "transformers-4.38.1"
    warning: Optional[dict] = None
