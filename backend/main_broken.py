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
        plan = parse_action_plan(plan_text)
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
