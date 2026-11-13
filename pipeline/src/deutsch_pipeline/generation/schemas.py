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

class UnscrambleItem(BaseModel):
    sentence_ordered: str = Field(
        ..., 
        description="The correct, fully formed German B2/C1 sentence."
    )
    words_scrambled: list[str] = Field(
        ..., 
        description="The exact words from sentence_ordered broken down into an array and explicitly shuffled in a randomized, incorrect order."
    )
    clue_translation: str = Field(
        ..., 
        description="A clear contextual translation or grammatical clue in Portuguese to assist the student."
    )

class UnscrambleBatchResponse(BaseModel):
    exercises: list[UnscrambleItem] = Field(..., description="List of generated unscramble exercises.")


class StructuralTransformItem(BaseModel):
    sentence_a: str = Field(
        ...,
        description="German B2/C1 sentence in the source form (the form the student reads)."
    )
    sentence_b: str = Field(
        ...,
        description="The same sentence rewritten in the target form (the transformation the student must produce)."
    )

class StructuralTransformBatchResponse(BaseModel):
    exercises: list[StructuralTransformItem] = Field(
        ..., description="List of generated sentence_a/sentence_b transformation pairs."
    )

class WordBankGuessItem(FillBlankItem):
    distractors: list[str] = Field(
        ...,
        description="Exactly 2 plausible but incorrect options for the same gap, same grammatical category as gap_answer."
    )

class WordBankGuessBatchResponse(BaseModel):
    exercises: list[WordBankGuessItem] = Field(
        ..., description="List of generated gap-fill exercises with a closed word bank (correct answer + distractors)."
    )
