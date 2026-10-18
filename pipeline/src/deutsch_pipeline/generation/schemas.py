# pipeline/src/deutsch_pipeline/generation/schemas.py
from pydantic import BaseModel, Field

class FillBlankItem(BaseModel):
    sentence_full: str = Field(
        ..., 
        description="A grammatically perfect German B2/C1 sentence generated according to the topic constraint."
    )
    gap_answer: str = Field(
        ..., 
        description="The exact case-sensitive substring present inside sentence_full that will be extracted to form the exercise blank gap."
    )
    accepted_answers: list[str] = Field(
        ..., 
        description="A list of alternative valid orthographic tokens or variations that can correctly fill the gap, always including the gap_answer."
    )

class FillBlankBatchResponse(BaseModel):
    exercises: list[FillBlankItem] = Field(
        ..., 
        description="A precise list of uniquely distinct generated exercise blocks matching the calibration matrix."
    )
