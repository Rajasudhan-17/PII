import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from .schemas import AnalyzeRequest, AnalyzeResponse
from .service import ner_service_instance

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ner_app")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing Presidio NER Microservice...")
    ner_service_instance.load_model()
    yield
    logger.info("Shutting down Presidio NER Microservice...")

app = FastAPI(
    title="PII Intelligent Platform — Presidio NER Microservice",
    description="Dedicated microservice for Named Entity Recognition using Microsoft Presidio and spaCy en_core_web_lg",
    version="1.0.0",
    lifespan=lifespan
)

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "pii-ner-presidio",
        "modelName": ner_service_instance.model_name,
        "isModelLoaded": ner_service_instance.is_loaded
    }

@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest):
    try:
        entities = ner_service_instance.analyze(request)
        return AnalyzeResponse(entities=entities)
    except Exception as e:
        logger.error(f"Error analyzing text: {e}")
        raise HTTPException(status_code=500, detail=str(e))
