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

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

MEMORY_FILE = os.path.join(BASE_DIR, "experience_memory.json")
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
    except (json.JSONDecodeError, OSError) as exc:
        print(f"Could not read experience memory: {exc}")
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
        "the", "a", "an", "to", "from", "and", "or", "in", "on",
        "with", "while", "without", "of", "is", "are", "move",
        "moving", "task", "please",
    }

    def get_keywords(value: str):
        return {
            word for word in re.findall(r"[a-zA-Z0-9]+", value.lower())
            if word not in stop_words
        }

    task_words = get_keywords(task)
    if not task_words:
        return []

    matches = []
    for experience in experiences:
        old_words = get_keywords(experience.get("task", ""))
        if not old_words:
            continue
        common = task_words & old_words
        score = len(common) / len(task_words | old_words)
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
    matches.sort(key=lambda item: (item["similarity"], item.get("created_at", "")), reverse=True)
    return matches[:limit]


def record_outcome(outcome: str, reason: Optional[str] = None,
                   experience_id: Optional[str] = None, task: Optional[str] = None):
    experiences = load_experiences()
    target = None
    if experience_id:
        for item in reversed(experiences):
            if item.get("id") == experience_id:
                target = item
                break
        if target is None:
            raise HTTPException(status_code=404, detail="Experience ID was not found.")
    elif task:
        normalized_task = task.strip().casefold()
        for item in reversed(experiences):
            if item.get("task", "").strip().casefold() == normalized_task:
                target = item
                break
        if target is None:
            raise HTTPException(status_code=404, detail="No saved plan was found for this task.")
    if target is None:
        raise HTTPException(status_code=400, detail="Provide an experience_id or task.")

    target["outcome"] = outcome
    target["outcome_reason"] = (reason or "").strip() or None
    target["outcome_recorded_at"] = current_time()
    write_experiences(experiences)
    return target


app = FastAPI(
    title="PhysicalLink AI",
    description="Physical AI Experience & Simulation Agent",
    version="0.5.1",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
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


def parse_action_plan(plan_text: str):
    """Convert a model response into a list of readable action steps."""
    if not plan_text:
        return []
    cleaned_steps = []
    for line in str(plan_text).splitlines():
        line = line.strip()
        if not line:
            continue
        line = re.sub(r"^\s*(?:\d+[.) :]\s*|[-*•]\s*)", "", line)
        line = line.strip().strip("`*")
        if not line:
            continue
        if line.lower().rstrip(":") in {"action plan", "steps", "action steps"}:
            continue
        if re.match(r"^(count|total steps)\s*:", line, re.IGNORECASE):
            continue
        cleaned_steps.append(line)
    if not cleaned_steps and str(plan_text).strip():
        cleaned_steps = [str(plan_text).strip()]
    return cleaned_steps


def get_message_text(message):
    """Support providers that return message content as text or text blocks."""
    content = getattr(message, "content", None)
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, dict):
                value = part.get("text")
            else:
                value = getattr(part, "text", None)
            if value:
                parts.append(str(value))
        return "\n".join(parts).strip()
    return ""


def local_fallback_plan(task: str):
    """A clearly labelled demo plan used only when the model gives no usable response."""
    return [
        f"Clarify the requested virtual task: {task}.",
        "Identify the simulated start point, destination, obstacles, and available clear space.",
        "Check the proposed route for blocked cells and leave a visible margin around obstacles.",
        "Choose a collision-aware path and divide it into clear waypoints for the virtual robot.",
        "If an obstacle moves or blocks the route, pause the visual simulation and calculate another path.",
        "Review the virtual route and report the result; this plan does not verify real-world robot safety.",
    ]


def create_action_plan(task: str):
    """Try Nemotron first; return a transparent local fallback if the API is unavailable."""
    relevant_experiences = find_relevant_experiences(task)
    api_key = os.getenv("NEBIUS_API_KEY")
    if not api_key:
        print("NEBIUS_API_KEY is missing; using the labelled local fallback plan.")
        return local_fallback_plan(task), "local_fallback_missing_api_key"

    if relevant_experiences:
        memory_context = (
            "Relevant past experiences (outcomes may be pending, successful, or failed):\n"
            + json.dumps(relevant_experiences, indent=2, ensure_ascii=False)
            + "\nUse outcomes cautiously. Evaluate the current task independently."
        )
    else:
        memory_context = "No relevant past experiences were found. Plan independently."

    try:
        client = OpenAI(
            base_url=NEBIUS_BASE_URL,
            api_key=api_key,
            timeout=60.0,
            max_retries=1,
        )
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You plan tasks for a 2D virtual robot simulation. Return exactly six numbered "
                        "complete sentences, one per line: identify start/goal/obstacles; inspect hazards "
                        "and clearance; choose a route; define waypoints; react to new obstacles; perform "
                        "a final virtual check. State that this does not verify real-world robot safety. "
                        "Do not claim physical sensors are connected."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Current task: {task}\n\n{memory_context}\n\nWrite a fresh, complete six-step plan.",
                },
            ],
            temperature=0.2,
            max_tokens=800,
        )
        if not getattr(response, "choices", None):
            raise ValueError("The model response contained no choices.")
        choice = response.choices[0]
        plan_text = get_message_text(choice.message)

        print("Nemotron finish reason:", getattr(choice, "finish_reason", None))
        print("Nemotron response text length:", len(plan_text))
        print("Nemotron raw response:", repr(plan_text))

        plan = parse_action_plan(plan_text)

        print("Parsed action plan:", plan)
        print("Parsed action plan length:", len(plan))
        if len(plan) >= 6:
            return plan[:6], "nemotron"
        print("Nemotron returned an empty or incomplete plan; using local fallback.")
        return local_fallback_plan(task), "local_fallback_empty_or_incomplete_response"
    except Exception as exc:
        print(f"Nemotron planning error: {type(exc).__name__}: {exc}")
        return local_fallback_plan(task), "local_fallback_api_error"


@app.get("/")
def root():
    return {"project": "PhysicalLink AI", "message": "PhysicalLink AI Backend is running!", "version": "0.5.1"}


@app.get("/health")
def health():
    return {"status": "ok", "service": "PhysicalLink AI Backend", "version": "0.5.1"}


@app.get("/api/experiences")
def get_experiences():
    experiences = load_experiences()
    return {"success": True, "total": len(experiences), "experiences": experiences}


@app.get("/api/memory-search")
def memory_search(task: str):
    matches = find_relevant_experiences(task)
    return {"success": True, "query": task, "matches_found": len(matches), "matches": matches}


@app.post("/api/experience-outcome")
def save_experience_outcome(request: OutcomeRequest):
    if not request.experience_id and not (request.task and request.task.strip()):
        raise HTTPException(status_code=400, detail="Provide an experience_id or task.")
    experience = record_outcome(
        outcome=request.outcome,
        reason=request.reason,
        experience_id=request.experience_id,
        task=request.task,
    )
    return {"success": True, "message": "Experience outcome saved.", "experience": experience}


@app.post("/api/task")
def receive_task(request: TaskRequest):
    task = request.task.strip()
    if not task:
        raise HTTPException(status_code=400, detail="Please provide a task.")

    relevant_experiences = find_relevant_experiences(task)
    plan, plan_source = create_action_plan(task)
    try:
        experience = save_experience(task, plan)
    except OSError as exc:
        print(f"Could not save experience memory: {exc}")
        raise HTTPException(status_code=500, detail="The plan was created but experience memory could not be saved.")

    if plan_source == "nemotron":
        message = "Task analyzed by NVIDIA Nemotron."
    else:
        message = "Nemotron did not return a usable plan; a clearly labelled local fallback plan was created."

    return {
        "success": True,
        "message": message,
        "task": task,
        "experience_id": experience["id"],
        "relevant_experiences": relevant_experiences,
        "status": "plan_created",
        "model": MODEL_NAME if plan_source == "nemotron" else "local_fallback",
        "plan_source": plan_source,
        "action_plan": plan,
    }

