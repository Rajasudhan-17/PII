import io
import base64
import logging
from PIL import Image
from typing import Dict, Any
from .schemas import HTRRequest, HTRResponse, HTRLineResult

logger = logging.getLogger("htr_service")

class TrOCRService:
    MODEL_REVISION = "17242d54e4c27a296fa28e578496464522883307"

    def __init__(self, model_id: str = "microsoft/trocr-base-handwritten"):
        self.model_id = model_id
        self.processor = None
        self.model = None
        self.is_loaded = False

    def load_model(self):
        """Loads TrOCR processor and model once on application startup (warm loading)."""
        if self.is_loaded:
            return
        
        logger.info(f"Loading TrOCR model and processor: {self.model_id} (revision: {self.MODEL_REVISION})...")
        try:
            from transformers import TrOCRProcessor, VisionEncoderDecoderModel
            self.processor = TrOCRProcessor.from_pretrained(self.model_id, revision=self.MODEL_REVISION)
            self.model = VisionEncoderDecoderModel.from_pretrained(self.model_id, revision=self.MODEL_REVISION)
            self.model.eval()
            self.is_loaded = True
            logger.info("TrOCR model loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load TrOCR model ({self.model_id}): {str(e)}")
            self.is_loaded = False

    def recognize(self, request: HTRRequest) -> HTRResponse:
        """Processes single-line text crop or image for handwriting recognition."""
        if not self.is_loaded or self.model is None or self.processor is None:
            return HTRResponse(
                status="UNAVAILABLE",
                text="",
                confidence=None,
                modelId=self.model_id,
                modelRevision=self.MODEL_REVISION,
                warning={
                    "code": "HTR_MODEL_NOT_LOADED",
                    "message": "TrOCR model is not loaded in current environment."
                }
            )

        try:
            image = None
            if request.image_base64:
                image_data = base64.b64decode(request.image_base64)
                image = Image.open(io.BytesIO(image_data)).convert("RGB")
            elif request.image_path:
                image = Image.open(request.image_path).convert("RGB")

            if image is None:
                return HTRResponse(
                    status="INVALID_INPUT",
                    text="",
                    confidence=None,
                    modelId=self.model_id,
                    modelRevision=self.MODEL_REVISION,
                    warning={
                        "code": "HTR_INVALID_IMAGE_INPUT",
                        "message": "No valid image data or file path supplied."
                    }
                )

            # Language scope verification: microsoft/trocr-base-handwritten is English-only (IAM Dataset)
            lang = (request.language or "eng").lower()
            warning = None
            if lang not in ["eng", "en", "english"]:
                warning = {
                    "code": "HTR_LANGUAGE_UNSUPPORTED",
                    "message": f"Language '{request.language}' is outside English domain of microsoft/trocr-base-handwritten (IAM dataset)."
                }

            pixel_values = self.processor(images=image, return_tensors="pt").pixel_values
            generated_ids = self.model.generate(pixel_values)
            generated_text = self.processor.batch_decode(generated_ids, skip_special_tokens=True)[0]

            cleaned_text = generated_text.strip() if generated_text else ""

            # TrOCR does not emit calibrated sequence confidence by default; confidence is strictly null
            return HTRResponse(
                status="SUCCESS",
                text=cleaned_text,
                confidence=None,
                lines=[
                    HTRLineResult(
                        text=cleaned_text,
                        confidence=None,
                        bbox=None
                    )
                ] if cleaned_text else [],
                modelId=self.model_id,
                modelRevision=self.MODEL_REVISION,
                processorId="TrOCRProcessor",
                runtimeVersion="transformers-4.38.1",
                warning=warning
            )

        except Exception as e:
            logger.error(f"Inference error during TrOCR recognition: {str(e)}")
            return HTRResponse(
                status="FAILED",
                text="",
                confidence=None,
                modelId=self.model_id,
                modelRevision=self.MODEL_REVISION,
                warning={
                    "code": "HTR_INFERENCE_ERROR",
                    "message": f"Inference execution failed: {str(e)}"
                }
            )

htr_service_instance = TrOCRService()
