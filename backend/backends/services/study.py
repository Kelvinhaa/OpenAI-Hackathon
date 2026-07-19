import math
import os
from datetime import datetime, timedelta, timezone
from openai import AsyncOpenAI
from typing import Optional, Sequence
from backends.schemas.study import (
    GeneratedLearningExperience,
    RetrievalFeedbackResponse,
    StudyRecommendation,
)

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))

# Curated, science-backed study techniques. The model must pick technique titles
# verbatim from this list (see SYSTEM_PROMPT) instead of inventing new ones.
TECHNIQUE_LIBRARY = [
    {"name": "Active Recall", "description": "Testing yourself on material without looking at notes, forcing retrieval from memory.", "best_for": "all-purpose"},
    {"name": "Spaced Repetition / Retrieval Drill", "description": "A self-quiz or flashcard block that repeatedly retrieves prior material within the session.", "best_for": "memorization-heavy subjects"},
    {"name": "Feynman Technique", "description": "Explaining the concept in plain language as if teaching someone else, exposing gaps in understanding.", "best_for": "concept-heavy or qualitative subjects"},
    {"name": "Interleaving", "description": "Mixing related topics or problem types within a session instead of blocking one type at a time.", "best_for": "procedural/quantitative subjects"},
    {"name": "Elaborative Interrogation", "description": "Asking 'why' and 'how' questions about facts to build deeper understanding of the underlying reasoning.", "best_for": "concept-heavy or qualitative subjects"},
    {"name": "Dual Coding", "description": "Combining a verbal explanation with a visual representation (diagram, sketch) of the same concept.", "best_for": "all-purpose"},
    {"name": "Mind Mapping", "description": "Visually organizing concepts and their relationships in a branching diagram to see the big picture.", "best_for": "concept-heavy or qualitative subjects"},
    {"name": "Worked Examples", "description": "Studying fully worked example problems and self-explaining each step before attempting new ones.", "best_for": "procedural/quantitative subjects"},
    {"name": "Practice Testing", "description": "Timed practice under exam-like conditions (past papers, problem sets) to build retrieval fluency.", "best_for": "exam preparation"},
    {"name": "Pomodoro / Timeboxing", "description": "Structured focus blocks with short breaks to sustain attention across a session.", "best_for": "all-purpose"},
    {"name": "Chunking", "description": "Breaking complex material into smaller, manageable units or categories to reduce cognitive load.", "best_for": "procedural/quantitative subjects"},
    {"name": "Self-Explanation", "description": "Pausing periodically to explain the material in your own words and checking whether it makes sense.", "best_for": "all-purpose"},
]

_TECHNIQUE_LIBRARY_BLOCK = "\n".join(
    f"- {t['name']}: {t['description']} (best for: {t['best_for']})" for t in TECHNIQUE_LIBRARY
)
_TECHNIQUE_NAMES = {t["name"] for t in TECHNIQUE_LIBRARY}

SYSTEM_PROMPT = f"""You are an expert study coach who creates practical, specific study plans.
You respond ONLY with valid JSON (no markdown, no code fences, no extra text).
The JSON must have exactly this structure:
{{
  "summary": "A 1-2 sentence overview of the study plan",
  "techniques": [
    {{
      "title": "Technique name",
      "description": "2-3 sentences explaining how to apply this technique specifically to the given subject. Be concrete and actionable, not generic.",
      "duration_minutes": <integer minutes allocated to this technique>
    }}
  ],
  "tips": [
    "A practical, specific tip relevant to the subject and level"
  ]
}}

You must choose each technique's "title" verbatim from this curated, science-backed list
(do not invent new technique names, do not modify the wording):
{_TECHNIQUE_LIBRARY_BLOCK}

Rules:
- Provide 2-4 techniques depending on available time, chosen for relevance to the subject, level, goal, and duration
- Every "title" MUST be an exact name from the list above
- The "description" MUST still be subject-specific and concrete -- explain how to apply the named technique to this exact subject, not a generic restatement of the technique
- The sum of all duration_minutes MUST equal the total study duration provided
- Tips should be 2-4 concrete, actionable items specific to the subject
- Never use phrases like "Here are some techniques" or "I recommend" -- just provide the data
- Tailor everything to the specific subject matter, not generic study advice
- For the summary, write as if you're briefing a student before a session -- direct, confident, no hedging"""

LEARNING_MAP_SYSTEM_PROMPT = f"""You are an expert study coach who creates practical, specific study plans and learning maps.
Create a subject-specific study recommendation and a prerequisite learning map for the requested learner.

Choose technique titles verbatim from this curated, science-backed list:
{_TECHNIQUE_LIBRARY_BLOCK}

Rules:
- Provide 2-4 techniques whose duration_minutes sum exactly to the requested duration.
- Make all summaries, technique descriptions, tips, concept explanations, and retrieval prompts specific to the subject and learner level.
- Include 4-6 concepts with unique, stable lowercase kebab-case keys.
- Every concept needs a concise explanation and an answerable retrieval prompt.
- Edges must point from a prerequisite concept key to a dependent concept key. Do not create self-edges or reference concepts that are not included.
- Include 2-4 actionable tips.
- Write directly and confidently for the learner."""

RETRIEVAL_FEEDBACK_SYSTEM_PROMPT = """You give formative feedback on a learner's retrieval-practice answer.
Use the supplied concept explanation and retrieval prompt as the source of truth.

Rules:
- Give a concise explanation of what the learner got right and what is missing in at most two sentences.
- Choose suggested_rating as an integer from 1 to 4: 1=Again, 2=Hard, 3=Good, 4=Easy.
- Set prerequisite_concept_key only if a missing prerequisite is the main reason the answer is incomplete; otherwise use null.
- If supplied, prerequisite_concept_key must exactly match one of the allowed direct prerequisite keys in the request.
- Do not address the learner's rating choice, do not invent facts, and do not write to any database."""


class LearningExperienceGenerationError(RuntimeError):
    """Raised when a complete study plan and learning map cannot be generated."""


class RetrievalFeedbackGenerationError(RuntimeError):
    """Raised when formative retrieval feedback cannot be generated safely."""


def _fallback_recommendation(subject: str, time: int, level: str) -> StudyRecommendation:
    return StudyRecommendation(
        summary=f"Study plan for {subject} ({time} minutes, {level} level)",
        techniques=[
            {
                "title": "Focused Study Session",
                "description": f"Dedicate your {time} minutes to focused study of {subject}. "
                "Remove distractions and work through the material methodically.",
                "duration_minutes": time,
            }
        ],
        tips=[
            "Take short breaks every 25 minutes to maintain focus.",
            "Review your notes within 24 hours to strengthen retention.",
        ],
    )


async def generate_recommendation(
    subject: str, level: str, time: int, goal: Optional[str] = None
) -> StudyRecommendation:
    goal_line = f"\n- Learning goal: {goal}" if goal else ""

    user_message = (
        "Create a study plan for:\n"
        f"- Subject: {subject}\n"
        f"- Level: {level}\n"
        f"- Duration: {time} minutes{goal_line}"
    )

    try:
        response = await client.responses.parse(
            model="gpt-5.6-luna",
            instructions=SYSTEM_PROMPT,
            input=user_message,
            text_format=StudyRecommendation,
            reasoning={"effort": "low"}
        )

        recommendation = response.output_parsed
        if not isinstance(recommendation, StudyRecommendation):
            raise ValueError("OpenAI response did not contain a study recommendation")

        for technique in recommendation.techniques:
            if technique.title not in _TECHNIQUE_NAMES:
                print(f"[study-service] Technique title off-library: {technique.title!r}")
        return recommendation

    except Exception as e:
        print(f"[study-service] OpenAI error, using fallback: {e}")
        return _fallback_recommendation(subject, time, level)


async def generate_learning_experience(
    subject: str, level: str, time: int, goal: Optional[str] = None
) -> GeneratedLearningExperience:
    goal_line = f"\n- Learning goal: {goal}" if goal else ""
    user_message = (
        "Create a complete study plan and learning map for:\n"
        f"- Subject: {subject}\n"
        f"- Level: {level}\n"
        f"- Duration: {time} minutes{goal_line}"
    )

    try:
        response = await client.responses.parse(
            model="gpt-5.6-luna",
            instructions=LEARNING_MAP_SYSTEM_PROMPT,
            input=user_message,
            text_format=GeneratedLearningExperience,
        )
        experience = response.output_parsed
    except Exception as exc:
        raise LearningExperienceGenerationError() from exc

    if not isinstance(experience, GeneratedLearningExperience):
        raise LearningExperienceGenerationError()

    return experience


async def evaluate_retrieval_answer(
    concept,
    answer: str,
    allowed_prerequisite_keys: Sequence[str],
) -> RetrievalFeedbackResponse:
    """Generate non-persistent, bounded feedback for one concept answer."""
    allowed_keys_text = ", ".join(allowed_prerequisite_keys) or "none"
    user_message = (
        "Evaluate this retrieval-practice answer:\n"
        f"- Concept title: {concept.title}\n"
        f"- Concept explanation: {concept.explanation}\n"
        f"- Retrieval prompt: {concept.retrieval_prompt}\n"
        f"- Allowed direct prerequisite concept keys: {allowed_keys_text}\n"
        f"- Learner answer: {answer}"
    )

    try:
        response = await client.responses.parse(
            model="gpt-5.6-luna",
            instructions=RETRIEVAL_FEEDBACK_SYSTEM_PROMPT,
            input=user_message,
            text_format=RetrievalFeedbackResponse,
        )
        feedback = RetrievalFeedbackResponse.model_validate(response.output_parsed)
    except Exception as exc:
        raise RetrievalFeedbackGenerationError() from exc

    return feedback


# ---------------------------------------------------------------------------
# FSRS-5 spaced repetition algorithm
# ---------------------------------------------------------------------------

_DECAY: float = -0.5
_DESIRED_RETENTION: float = 0.9
_FACTOR: float = _DESIRED_RETENTION ** (1.0 / _DECAY) - 1  # ≈ 0.2346

_W: list[float] = [
    0.4197, 1.1829, 3.1262, 15.4722,  # w[0-3]:  S₀ for Again/Hard/Good/Easy
    7.2102, 0.5316, 1.0651, 0.0589,   # w[4-7]:  difficulty params
    1.5330, 0.14,   0.98,   2.2700,   # w[8-11]: recall stability
    0.0300, 0.2900, 0.2400, 2.9898,   # w[12-15]: forget stability + penalties
    0.5100, 0.3400, 0.3000,           # w[16-18]: easy bonus, recall growth
]


def _retrievability(t: float, s: float) -> float:
    if s <= 0:
        return 0.0
    return (1 + _FACTOR * t / s) ** _DECAY


def _initial_stability(rating: int) -> float:
    return _W[rating - 1]


def _initial_difficulty(rating: int) -> float:
    return max(1.0, min(10.0, _W[4] - math.exp(_W[5] * (rating - 1)) + 1))


def _next_difficulty(d: float, rating: int) -> float:
    d0_good = _W[4] - math.exp(_W[5] * 2) + 1
    return max(1.0, min(10.0, _W[6] * d0_good + (1 - _W[6]) * (d - _W[7] * (rating - 3))))


def _stability_recall(s: float, d: float, r: float, rating: int) -> float:
    hard = _W[15] if rating == 2 else 1.0
    easy = _W[16] if rating == 4 else 1.0
    return max(0.1,
        s * math.exp(_W[17]) * (11 - d) * (s ** -_W[9])
        * (math.exp((1 - r) * _W[10]) - 1) * hard * easy + 1
    )


def _stability_forget(s: float, d: float, r: float) -> float:
    return max(0.1,
        _W[11] * (d ** -_W[12]) * ((s + 1) ** _W[13] - 1) * math.exp((1 - r) * _W[14])
    )


def _fsrs_interval(s: float) -> int:
    return max(1, round(s / _FACTOR * (_DESIRED_RETENTION ** (1.0 / _DECAY) - 1)))


def apply_fsrs(
    stability: float,
    difficulty: float,
    review_count: int,
    rating: int,
    elapsed_days: Optional[float] = None,
) -> tuple[int, float, float]:
    """
    FSRS-5 algorithm. rating: 1=Again 2=Hard 3=Good 4=Easy.
    Returns (interval_days, new_stability, new_difficulty).
    Difficulty is stored in the ease_factor column.
    stability==0 is the sentinel for a card never FSRS-reviewed.
    """
    rating = max(1, min(4, rating))

    if stability == 0 or review_count == 0:
        s = _initial_stability(rating)
        d = _initial_difficulty(rating)
        return _fsrs_interval(s), s, d

    t = elapsed_days if elapsed_days is not None else _fsrs_interval(stability)
    r = _retrievability(t, stability)
    d = _next_difficulty(difficulty, rating)
    s = (_stability_forget(stability, difficulty, r) if rating == 1
         else _stability_recall(stability, difficulty, r, rating))
    return _fsrs_interval(s), s, d


def retrievability_now(stability: float, elapsed_days: float) -> float:
    """Predicted recall probability (0-1) right now, given elapsed time since last review."""
    return _retrievability(elapsed_days, stability)


def predict_review_outcomes(
    stability: float,
    difficulty: float,
    review_count: int,
    elapsed_days: Optional[float] = None,
) -> dict[int, int]:
    """Interval (days) that would result from each possible rating, without persisting anything."""
    return {
        rating: apply_fsrs(stability, difficulty, review_count, rating, elapsed_days)[0]
        for rating in (1, 2, 3, 4)
    }


# ---------------------------------------------------------------------------
# SM-2 (kept for reference — no longer used by the review endpoint)
# ---------------------------------------------------------------------------

def apply_sm2(
    ease_factor: float, interval_days: int, review_count: int, quality: int
) -> tuple[int, float, int]:
    """
    SM-2 spaced repetition algorithm.
    quality: 0=Again, 2=Hard, 4=Good, 5=Easy
    Returns (new_interval_days, new_ease_factor, new_review_count)
    """
    quality = max(0, min(5, quality))
    new_ef = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    new_ef = max(1.3, new_ef)

    if quality < 3:
        return 1, new_ef, review_count + 1

    if review_count == 0:
        new_interval = 1
    elif review_count == 1:
        new_interval = 6
    else:
        new_interval = round(interval_days * ease_factor)

    return new_interval, new_ef, review_count + 1
