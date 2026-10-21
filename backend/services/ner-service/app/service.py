import logging
from typing import List, Optional
from presidio_analyzer import AnalyzerEngine
from presidio_analyzer.nlp_engine import NlpEngineProvider
from .schemas import AnalyzeRequest, EntityResponse

logger = logging.getLogger("ner_service")

class PresidioNERService:
    def __init__(self):
        self.analyzer: Optional[AnalyzerEngine] = None
        self.is_loaded: bool = False
        self.model_name: str = "en_core_web_lg"

    def load_model(self):
        if self.is_loaded:
            return
        logger.info(f"Loading Presidio AnalyzerEngine with spaCy model '{self.model_name}'...")
        try:
            configuration = {
                "nlp_engine_name": "spacy",
                "models": [{"lang_code": "en", "model_name": self.model_name}],
            }
            provider = NlpEngineProvider(nlp_configuration=configuration)
            nlp_engine = provider.create_engine()
            self.analyzer = AnalyzerEngine(nlp_engine=nlp_engine, supported_languages=["en"])
            self.is_loaded = True
            logger.info(f"Presidio AnalyzerEngine loaded successfully with {self.model_name}.")
        except Exception as e:
            logger.warning(f"Could not load {self.model_name} ({e}), falling back to default spaCy configuration...")
            try:
                self.analyzer = AnalyzerEngine()
                self.is_loaded = True
                self.model_name = "default"
                logger.info("Presidio AnalyzerEngine loaded with default configuration.")
            except Exception as ex:
                logger.error(f"Failed to initialize Presidio AnalyzerEngine: {ex}")
                raise

    def analyze(self, request: AnalyzeRequest) -> List[EntityResponse]:
        if not self.is_loaded or self.analyzer is None:
            self.load_model()

        assert self.analyzer is not None

        # Presidio analyzes text; only extract PERSON and LOCATION for the NER provider
        results = self.analyzer.analyze(
            text=request.text,
            language=request.language,
            entities=["PERSON", "LOCATION"],
            score_threshold=request.score_threshold or 0.4
        )

        entities: List[EntityResponse] = []
        for res in results:
            entities.append(EntityResponse(
                type=res.entity_type,
                start=res.start,
                end=res.end,
                score=round(res.score, 4),
                text=request.text[res.start:res.end]
            ))
        return entities

ner_service_instance = PresidioNERService()
