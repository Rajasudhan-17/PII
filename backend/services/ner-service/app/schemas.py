from typing import List, Optional
from pydantic import BaseModel, Field

class AnalyzeRequest(BaseModel):
    text: str = Field(..., description="Text to analyze for PII entities")
    language: str = Field(default="en", description="Language code")
    score_threshold: Optional[float] = Field(default=0.4, description="Minimum confidence score threshold")

class EntityResponse(BaseModel):
    type: str = Field(..., description="Presidio entity type e.g. PERSON, LOCATION")
    start: int = Field(..., description="Start character offset")
    end: int = Field(..., description="End character offset")
    score: float = Field(..., description="Confidence score")
    text: str = Field(..., description="Matched text snippet")

class AnalyzeResponse(BaseModel):
    entities: List[EntityResponse] = Field(default_factory=list)
