import os
import re
import json
import uuid
from datetime import datetime, timezone
from typing import Optional, Literal

from dotenv import load_dotenv
from openai import OpenAI
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


load_dotenv()

MEMORY_FILE = os.path.join(
    os.path.dirname(__file__),
    "experience_memory.json",
)

MODEL_NAME = "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B"
NEBIUS_BASE_URL = "https://api.tokenfactory.nebius.com/v1/"


def current_time():
    return datetime.now(timezone.utc).isoformat()


def load_experiences():
    if not os.path.exists(MEMORY_FILE):
        return []

    try:
        with open(MEMORY_FILE, "r", encoding="utf-8") as file:
            data = json.load(file)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def write_experiences(experiences):
    temporary_file = MEMORY_FILE + ".tmp"

    with open(temporary_file, "w", encoding="utf-8") as file:
        json.dump(experiences, file, indent=2, ensure_ascii=False)

    os.replace(temporary_file, MEMORY_FILE)


def save_experience(task: str, plan: list):
    experiences = load_experiences()

    experience = {
        "id": str(uuid.uuid4()),
        "task": task,
        "action_plan": plan,
        "created_at": current_time(),
        "outcome": "pending",
        "outcome_reason": None,
        "outcome_recorded_at": None,
    }

    experiences.append(experience)
    write_experiences(experiences)
    return experience


def find_relevant_experiences(task: str, limit: int = 3):
    experiences = load_experiences()

    stop_words = {
        "the", "a", "an", "to", "from", "and", "or",
        "in", "on", "with", "while", "without", "of",
        "is", "are", "move", "moving", "task", "please",
    }

    def get_keywords(text: str):
        words = re.findall(r"[a-zA-Z0-9]+", text.lower())
        return {word for word in words if word not in stop_words}

    new_task_words = get_keywords(task)
    if not new_task_words:
        return []

    matches = []

    for experience in experiences:
        old_task_words = get_keywords(experience.get("task", ""))
        if not old_task_words:
            continue

        common_words = new_task_words & old_task_words
        score = len(common_words) / len(new_task_words | old_task_words)

        if score > 0:
            matches.append({
                "id": experience.get("id"),
                "task": experience.get("task", ""),
                "action_plan": experience.get("action_plan", []),
                "outcome": experience.get("outcome", "pending"),
                "outcome_reason": experience.get("outcome_reason"),
                "similarity": round(score, 3),
                "created_at": experience.get("created_at", ""),
            })

    matches.sort(
        key=lambda item: (
            item["similarity"],
            item.get("created_at", ""),
        ),
        reverse=True,
    )

    return matches[:limit]


def record_outcome(
    outcome: str,
    reason: Optional[str] = None,
    experience_id: Optional[str] = None,
    task: Optional[str] = None,
):
    experiences = load_experiences()
    target = None

    if experience_id:
        for experience in reversed(experiences):
            if experience.get("id") == experience_id:
                target = experience
                break

        if target is None:
            raise HTTPException(
                status_code=404,
                detail="Experience ID was not found.",
            )

    elif task:
        normalized_task = task.strip().casefold()

        for experience in reversed(experiences):
            if experience.get("task", "").strip().casefold() == normalized_task:
                target = experience
                break

        if target is None:
            raise HTTPException(
                status_code=404,
                detail="No saved plan was found for this task.",
            )

    if target is None:
        raise HTTPException(
            status_code=400,
            detail="Provide an experience_id or task.",
        )

    target["outcome"] = outcome
    target["outcome_reason"] = (reason or "").strip() or None
    target["outcome_recorded_at"] = current_time()

    write_experiences(experiences)
    return target


app = FastAPI(
    title="PhysicalLink AI",
    description="Physical AI Experience & Simulation Agent",
    version="0.5.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TaskRequest(BaseModel):
    task: str


class OutcomeRequest(BaseModel):
    outcome: Literal["success", "failure"]
    reason: Optional[str] = None
    experience_id: Optional[str] = None
    task: Optional[str] = None





    """Convert the AI response into a list of action steps."""
    if not plan_text:
        print("DEBUG: AI response content is empty.")
        return []

    # Handle normal numbered text, bullets, and multiline responses.
    cleaned_steps = []

    for line in str(plan_text).splitlines():
        line = line.strip()

        if not line:
            continue

        # Remove numbering and common bullet markers.
        line = re.sub(
            r"^\s*(?:\d+[\.\)]\s*|[-*•]\s*)",
            "",
           
def parse_action_plan(plan_text: str):
    """Parse numbered steps, bullets, or a plain-text AI plan."""
    if not plan_text:
        print("DEBUG: AI response content is empty.")
        return []

    cleaned_steps = []

    for line in str(plan_text).splitlines():
        line = line.strip()

        if not line:
            continue

        # Remove Markdown formatting and numbering.
        line = re.sub(r"```.*?```", "", line)
        line = re.sub(r"^\s*(?:[-*•]\s*|\d+[\.\):]\s*)", "", line)
        line = line.strip()

        if not line:
            continue

        # Skip headings and metadata.
        if line.lower().rstrip(":") in {
            "action plan", "steps", "action steps"
        }:
            continue

        if re.match(r"^(count|total steps)\s*:", line, re.IGNORECASE):
            continue

        cleaned_steps.append(line)

    # If the model returned one long paragraph, keep it as one step
    # rather than incorrectly reporting an empty plan.
    if not cleaned_steps and str(plan_text).strip():
        cleaned_steps = [str(plan_text).strip()]

    print("DEBUG: Parsed action steps:", cleaned_steps)
    return cleaned_steps



def create_action_plan(task: str):
    api_key = os.getenv("NEBIUS_API_KEY")

    if not api_key:
        raise ValueError(
            "NEBIUS_API_KEY was not found in the backend .env file."
        )

    client = OpenAI(
        base_url=NEBIUS_BASE_URL,
        api_key=api_key,
        timeout=60.0,
        max_retries=1,
    )

    relevant_experiences = find_relevant_experiences(task)

    if relevant_experiences:
        memory_context = (
            "Relevant past experiences are provided below. Their outcomes may be "
            "pending, successful, or failed:\n"
            + json.dumps(relevant_experiences, indent=2, ensure_ascii=False)
            + "\nUse these outcomes cautiously. A previous success does not "
            "guarantee current safety. Avoid repeating a recorded failure when "
            "relevant. Evaluate the current task independently."
        )
    else:
        memory_context = (
            "No relevant past experiences were found. Plan the current task independently."
        )

    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are the task-planning agent for PhysicalLink AI, a "
                    "2D virtual robot simulation project. Return exactly 6 "
                    "numbered steps, numbered 1 through 6. Each step must be "
                    "a complete sentence of 15 to 30 words. Put each step on "
                    "its own line. Do not stop a sentence mid-way. Include: "
                    "1) identify the start, goal and obstacles; 2) identify "
                    "hazards and clearances; 3) choose a route; 4) define "
                    "waypoints and movement; 5) describe how to react to "
                    "new obstacles; 6) perform a final check and state that "
                    "this is a proposed virtual plan, not verified real-world "
                    "robot safety. Do not claim real sensors are connected "
                    "unless the user explicitly says so."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Current task: {task}\n\n"
                    f"{memory_context}\n\n"
                    "Write a fresh, complete six-step plan for this task. "
                    "Keep every step specific to the task and finish every sentence."
                ),
            },
        ],
        temperature=0.2,
        max_tokens=800,
    )

    plan_text = response.choices[0].message.content or ""
    print("DEBUG: AI finish reason:", response.choices[0].finish_reason)
    print("DEBUG: Full AI response:", repr(response.choices[0].message))
    plan = parse_action_plan(plan_text)

    if not plan:
        raise ValueError("The AI returned an empty action plan.")

    # Guard against a provider/model response that is cut off at the end.
    if len(plan) < 6:
        raise ValueError(
            "The AI returned an incomplete action plan. Please retry the task."
        )

    return plan[:6]


@app.get("/")
def root():
    return {
        "project": "PhysicalLink AI",
        "message": "PhysicalLink AI Backend is running!",
        "version": "0.5.0",
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "PhysicalLink AI Backend",
        "version": "0.5.0",
    }


@app.get("/api/experiences")
def get_experiences():
    experiences = load_experiences()
    return {
        "success": True,
        "total": len(experiences),
        "experiences": experiences,
    }


@app.get("/api/memory-search")
def memory_search(task: str):
    matches = find_relevant_experiences(task)
    return {
        "success": True,
        "query": task,
        "matches_found": len(matches),
        "matches": matches,
    }


@app.post("/api/experience-outcome")
def save_experience_outcome(request: OutcomeRequest):
    if not request.experience_id and not (request.task and request.task.strip()):
        raise HTTPException(
            status_code=400,
            detail="Provide an experience_id or task.",
        )

    experience = record_outcome(
        outcome=request.outcome,
        reason=request.reason,
        experience_id=request.experience_id,
        task=request.task,
    )

    return {
        "success": True,
        "message": "Experience outcome saved.",
        "experience": experience,
    }


@app.post("/api/task")
def receive_task(request: TaskRequest):
    task = request.task.strip()

    if not task:
        raise HTTPException(
            status_code=400,
            detail="Please provide a task.",
        )

    try:
        # Retrieve memory before saving this new plan.
        relevant_experiences = find_relevant_experiences(task)
        plan = create_action_plan(task)
        experience = save_experience(task, plan)

        return {
            "success": True,
            "message": "Task analyzed by NVIDIA Nemotron.",
            "task": task,
            "experience_id": experience["id"],
            "relevant_experiences": relevant_experiences,
            "status": "plan_created",
            "model": MODEL_NAME,
            "action_plan": plan,
        }

    except HTTPException:
        raise
    except Exception as exc:
        print(
            f"PhysicalLink AI planning error: {type(exc).__name__}: {exc}"
        )
        raise HTTPException(
            status_code=502,
            detail=(
                "AI planning failed or returned an incomplete plan. "
                "Check the backend terminal and try again."
            ),
        )
