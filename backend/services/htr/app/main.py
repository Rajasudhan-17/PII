import logging
from fastapi import FastAPI, HTTPException
from contextlib import asynccontextmanager
from .schemas import HTRRequest, HTRResponse
from .service import htr_service_instance

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("htr_app")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm load model on server start
    logger.info("Initializing TrOCR HTR Microservice...")
    htr_service_instance.load_model()
    yield
    logger.info("Shutting down TrOCR HTR Microservice...")

app = FastAPI(
    title="PII Intelligent Platform — TrOCR HTR Microservice",
    description="Dedicated microservice for genuine handwriting recognition using microsoft/trocr-base-handwritten",
    version="1.0.0",
    lifespan=lifespan
)

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "pii-htr-trocr",
        "modelId": htr_service_instance.model_id,
        "isModelLoaded": htr_service_instance.is_loaded
    }

@app.post("/recognize", response_model=HTRResponse)
def recognize_handwriting(request: HTRRequest):
    if not request.image_base64 and not request.image_path:
        raise HTTPException(status_code=400, detail="Either image_base64 or image_path must be provided.")
    
    return htr_service_instance.recognize(request)
