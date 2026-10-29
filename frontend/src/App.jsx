
import { useState, useRef, useEffect } from "react";
import "./App.css";

const START = { x: 10, y: 50 };
const GOAL = { x: 88, y: 50 };
const GRID = 2;
const SAFETY_MARGIN = 4;

const INITIAL_OBSTACLES = [
  { id: 1, x: 40, y: 34, width: 16, height: 14 },
  { id: 2, x: 60, y: 54, width: 16, height: 14 },
];

const OBSTACLE_POSITIONS = {
  1: [
    { x: 40, y: 29 },
    { x: 32, y: 60 },
    { x: 47, y: 15 },
  ],
  2: [
    { x: 59, y: 65 },
    { x: 67, y: 28 },
    { x: 55, y: 76 },
  ],
};

function pointKey(point) {
  return `${point.x},${point.y}`;
}

function isBlocked(point, obstacles) {
  return obstacles.some((obstacle) => {
    return (
      point.x >= obstacle.x - SAFETY_MARGIN &&
      point.x <= obstacle.x + obstacle.width + SAFETY_MARGIN &&
      point.y >= obstacle.y - SAFETY_MARGIN &&
      point.y <= obstacle.y + obstacle.height + SAFETY_MARGIN
    );
  });
}

function simplifyRoute(path) {
  if (path.length <= 2) return path;

  const result = [path[0]];

  for (let i = 1; i < path.length - 1; i++) {
    const previous = result[result.length - 1];
    const current = path[i];
    const next = path[i + 1];

    const sameX = previous.x === current.x && current.x === next.x;
    const sameY = previous.y === current.y && current.y === next.y;

    if (!sameX && !sameY) {
      result.push(current);
    }
  }

  result.push(path[path.length - 1]);
  return result;
}

function findRoute(obstacles) {
  if (isBlocked(START, obstacles) || isBlocked(GOAL, obstacles)) {
    return null;
  }

  const open = [{ ...START, g: 0, f: 0, parent: null }];
  const visited = new Map();
  const directions = [
    { x: GRID, y: 0 },
    { x: -GRID, y: 0 },
    { x: 0, y: GRID },
    { x: 0, y: -GRID },
  ];

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift();
    const key = pointKey(current);

    if (visited.has(key)) continue;
    visited.set(key, current);

    if (current.x === GOAL.x && current.y === GOAL.y) {
      const path = [];
      let node = current;

      while (node) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }

      return simplifyRoute(path);
    }

    for (const direction of directions) {
      const next = {
        x: current.x + direction.x,
        y: current.y + direction.y,
      };

      if (
        next.x < 2 ||
        next.x > 96 ||
        next.y < 4 ||
        next.y > 92 ||
        isBlocked(next, obstacles)
      ) {
        continue;
      }

      const nextKey = pointKey(next);
      if (visited.has(nextKey)) continue;

      const g = current.g + GRID;
      const h = Math.abs(GOAL.x - next.x) + Math.abs(GOAL.y - next.y);

      open.push({
        ...next,
        g,
        f: g + h,
        parent: current,
      });
    }
  }

  return null;
}

// Independent post-planning check: inspect every route segment
// against the expanded obstacle zones.
function verifyRoute(route, obstacles) {
  if (!route || route.length < 2) {
    return {
      passed: false,
      reason: "No complete route is available to verify.",
    };
  }

  for (let segment = 0; segment < route.length - 1; segment++) {
    const a = route[segment];
    const b = route[segment + 1];

    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const samples = Math.max(1, Math.ceil(distance / 0.5));

    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const point = {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      };

      if (isBlocked(point, obstacles)) {
        return {
          passed: false,
          reason: `Route segment ${segment + 1} intersects an obstacle safety zone.`,
        };
      }
    }
  }

  return {
    passed: true,
    reason: "All route segments passed the 2D obstacle-zone check.",
  };
}

function App() {
  const [task, setTask] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [receivedTask, setReceivedTask] = useState("");
  const [actionPlan, setActionPlan] = useState([]);
  const [relevantExperiences, setRelevantExperiences] = useState([]);
  const [experienceId, setExperienceId] = useState("");
  const [outcomeMessage, setOutcomeMessage] = useState("");

  const [obstacles, setObstacles] = useState(INITIAL_OBSTACLES);
  const [route, setRoute] = useState([]);
  const [robotPosition, setRobotPosition] = useState(START);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [simulationResult, setSimulationResult] = useState(
    "Enter a task to begin."
  );
  const [safetyResult, setSafetyResult] = useState(null);

  const timersRef = useRef([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  function clearTimers() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }

  function resetRobot() {
    setRobotPosition(START);
    setSimulationRunning(false);
  }

  function moveObstacle(id) {
    if (simulationRunning || status === "sending") return;

    setObstacles((current) =>
      current.map((obstacle) => {
        if (obstacle.id !== id) return obstacle;

        const positions = OBSTACLE_POSITIONS[id];
        const currentIndex = positions.findIndex(
          (position) =>
            position.x === obstacle.x && position.y === obstacle.y
        );
        const next = positions[(currentIndex + 1) % positions.length];

        return { ...obstacle, ...next };
      })
    );

    setRoute([]);
    setSafetyResult(null);
    resetRobot();
    setSimulationResult(
      "Obstacle moved. Generate and verify a new route before moving."
    );
  }

  async function recordOutcome(id, outcome, reason, taskValue) {
    if (!id) {
      setOutcomeMessage("Outcome not saved: the backend did not return an experience ID.");
      return;
    }

    try {
      const response = await fetch("https://physicallink-ai.onrender.com/api/experience-outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experience_id: id,
          outcome,
          reason,
          task: taskValue,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.detail ? JSON.stringify(data.detail) : "Outcome could not be saved.");
      }

      setOutcomeMessage(`Memory updated: ${outcome.toUpperCase()} — ${reason}`);
    } catch (error) {
      console.error("Outcome recording error:", error);
      setOutcomeMessage("The simulation finished, but its outcome could not be saved. Check that the backend is running.");
    }
  }

  async function startSimulation() {
    if (!task.trim()) {
      setStatus("error");
      setMessage("Please enter a task first.");
      return;
    }

    clearTimers();
    setStatus("sending");
    setMessage("Sending task to PhysicalLink AI...");
    setReceivedTask("");
    setActionPlan([]);
    setRelevantExperiences([]);
    setExperienceId("");
    setOutcomeMessage("");
    setRoute([]);
    setSafetyResult(null);
    resetRobot();
    setSimulationResult("Waiting for the AI action plan...");

    try {
      const response = await fetch("https://physicallink-ai.onrender.com/api/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: task.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail
            ? JSON.stringify(data.detail)
            : "The backend request failed."
        );
      }

      if (!data.success) {
        throw new Error(data.message || "The AI could not create a plan.");
      }

      const plan = Array.isArray(data.action_plan)
        ? data.action_plan
        : [];

      setStatus("success");
      setMessage(data.message || "Task analyzed successfully.");
      setExperienceId(data.experience_id || "");
      setReceivedTask(data.task || task.trim());
      setActionPlan(plan);
      setRelevantExperiences(
        Array.isArray(data.relevant_experiences)
          ? data.relevant_experiences
          : []
      );

      if (plan.length === 0) {
        setSimulationResult("No AI action plan was returned.");
        return;
      }

      setSimulationResult("Planning a route around the obstacles...");

      const calculatedRoute = findRoute(obstacles);

      if (!calculatedRoute) {
        setRoute([]);
        setSafetyResult({
          passed: false,
          reason: "No route found between Station A and Station B.",
        });
        setSimulationResult("BLOCKED — no available route.");
        await recordOutcome(
          data.experience_id,
          "failure",
          "No route was found between Station A and Station B in the 2D simulation.",
          data.task || task.trim()
        );
        return;
      }

      // Do not animate until the separate verification check passes.
      const verification = verifyRoute(calculatedRoute, obstacles);
      setSafetyResult(verification);

      if (!verification.passed) {
        setRoute(calculatedRoute);
        setSimulationResult("BLOCKED — route verification failed.");
        await recordOutcome(
          data.experience_id,
          "failure",
          verification.reason || "The route did not pass the 2D obstacle-zone check.",
          data.task || task.trim()
        );
        return;
      }

      setRoute(calculatedRoute);
      setSimulationResult(
        "2D route check passed. Starting virtual movement..."
      );
      setSimulationRunning(true);

      const stepDuration = 700;

      calculatedRoute.forEach((point, index) => {
        const timer = setTimeout(() => {
          setRobotPosition(point);
          setSimulationResult(
            `Moving through waypoint ${index + 1} of ${calculatedRoute.length}.`
          );
        }, (index + 1) * stepDuration);

        timersRef.current.push(timer);
      });

      const finishTimer = setTimeout(() => {
        setRobotPosition(GOAL);
        setSimulationRunning(false);
        setSimulationResult(
          "ROUTE COMPLETED — 2D simulation only; real-world safety is not verified."
        );
        recordOutcome(
          data.experience_id,
          "success",
          "The virtual robot reached Station B after the 2D route check passed.",
          data.task || task.trim()
        );
      }, (calculatedRoute.length + 1) * stepDuration);

      timersRef.current.push(finishTimer);
    } catch (error) {
      console.error("PhysicalLink AI error:", error);
      setStatus("error");
      setMessage(
        error.message || "Unable to connect to the PhysicalLink AI backend."
      );
      setSimulationRunning(false);
      setSimulationResult("Simulation could not start.");
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <div className="brand-icon">P</div>
          <div>
            <h1>PhysicalLink AI</h1>
            <p>Physical AI Experience &amp; Simulation Agent</p>
          </div>
        </div>
        <div className="status">
          <span className="status-dot"></span>
          AI System Ready
        </div>
      </header>

      <main className="main">
        <section className="hero">
          <div>
            <span className="tag">PHYSICAL AI</span>
            <h2>
              Teach AI to learn before
              <span> it acts.</span>
            </h2>
            <p>
              PhysicalLink AI plans actions, checks a virtual route,
              retrieves relevant past experiences, and verifies the
              route against obstacle zones before virtual movement.
            </p>
          </div>
        </section>

        <section className="task-card">
          <div className="section-title">
            <div>
              <h3>Give the Agent a Task</h3>
              <p>Describe what the virtual robot needs to accomplish.</p>
            </div>
          </div>

          <textarea
            value={task}
            onChange={(event) => setTask(event.target.value)}
            placeholder="Example: Move a package from Station A to Station B while avoiding obstacles."
            disabled={status === "sending" || simulationRunning}
          />

          <button
            className="start-button"
            onClick={startSimulation}
            disabled={status === "sending" || simulationRunning}
          >
            ▶ {status === "sending" ? "Sending..." : "Plan, Verify & Simulate"}
          </button>

          {message && (
            <div className={`result ${status}`}>
              <strong>
                {status === "success"
                  ? "✓ Task Received"
                  : status === "error"
                  ? "⚠ Error"
                  : "Processing"}
              </strong>
              <p>{message}</p>
              {receivedTask && (
                <div className="received-task">
                  <span>Received Task:</span>
                  <p>{receivedTask}</p>
                </div>
              )}
            </div>
          )}
        </section>

        {actionPlan.length > 0 && (
          <section className="task-card">
            <div className="section-title">
              <div>
                <h3>AI-Generated Action Plan</h3>
                <p>Steps generated by NVIDIA Nemotron.</p>
              </div>
            </div>
            <ol>
              {actionPlan.map((step, index) => (
                <li key={index} style={{ marginBottom: 12 }}>
                  {String(step)}
                </li>
              ))}
            </ol>
          </section>
        )}

        {relevantExperiences.length > 0 && (
          <section className="task-card">
            <div className="section-title">
              <div>
                <h3>Experience Memory</h3>
                <p>Relevant past tasks retrieved by the backend.</p>
              </div>
            </div>
            {relevantExperiences.map((experience, index) => (
              <div className="received-task" key={index}>
                <strong>{experience.task}</strong>
                <p>
                  Similarity:{" "}
                  {Math.round((experience.similarity || 0) * 100)}%
                </p>
              </div>
            ))}
          </section>
        )}

        <section className="simulation-section">
          <div className="section-heading">
            <h3>Digital Twin Simulation</h3>
            <p>
              Plan a route, verify it against obstacle safety zones,
              and then animate the virtual robot.
            </p>
          </div>

          <div className="simulation-card">
            <div className="simulation-header">
              <span>VIRTUAL ENVIRONMENT</span>
              <span
                className={`simulation-status ${
                  simulationRunning ? "running" : ""
                }`}
              >
                ● {simulationRunning ? "SIMULATION RUNNING" : "READY"}
              </span>
            </div>

            <div
  className="simulation-world"
  style={{
    position: "relative",
    width: "100%",
    height: 360,
    minHeight: 360,
    overflow: "hidden",
    background: "#020817",
    border: "1px solid #1e3a5f",
    borderRadius: 12,
  }}
>
  <svg
    viewBox="0 0 100 100"
    preserveAspectRatio="none"
    style={{
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      display: "block",
    }}
  >
    <defs>
      <pattern
        id="simulationGrid"
        width="5"
        height="5"
        patternUnits="userSpaceOnUse"
      >
        <path
          d="M 5 0 L 0 0 0 5"
          fill="none"
          stroke="#64748b"
          strokeWidth="0.25"
          strokeDasharray="1 1"
          opacity="0.65"
        />
      </pattern>
    </defs>

    {/* Dashed grid stays inside the simulation only */}
    <rect
      x="0"
      y="0"
      width="100"
      height="100"
      fill="url(#simulationGrid)"
    />

    {/* Obstacle safety zones */}
    {obstacles.map((obstacle) => (
      <g key={obstacle.id}>
        <rect
          x={obstacle.x - SAFETY_MARGIN}
          y={obstacle.y - SAFETY_MARGIN}
          width={obstacle.width + SAFETY_MARGIN * 2}
          height={obstacle.height + SAFETY_MARGIN * 2}
          rx="1.5"
          fill="#ef4444"
          opacity="0.10"
          stroke="#ef4444"
          strokeWidth="0.3"
          strokeDasharray="1 1"
        />

        {/* Obstacle box */}
        <rect
          x={obstacle.x}
          y={obstacle.y}
          width={obstacle.width}
          height={obstacle.height}
          rx="1.5"
          fill="#172554"
          stroke="#60a5fa"
          strokeWidth="0.65"
        />

        {/* Label fits inside the box */}
        <text
          x={obstacle.x + obstacle.width / 2}
          y={obstacle.y + obstacle.height / 2 - 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="2.3"
          fontWeight="bold"
          fill="#ffffff"
        >
          OBSTACLE
        </text>

        <text
          x={obstacle.x + obstacle.width / 2}
          y={obstacle.y + obstacle.height / 2 + 2.2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="2.5"
          fontWeight="bold"
          fill="#ffffff"
        >
          {obstacle.id}
        </text>
      </g>
    ))}

    {/* Zigzag route, shown only after planning */}
    {route.length > 1 && (
      <>
        <polyline
          points={route
            .map((point) => `${point.x},${point.y}`)
            .join(" ")}
          fill="none"
          stroke={safetyResult?.passed ? "#00e5ff" : "#ef4444"}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity="0.35"
        />

        <polyline
          points={route
            .map((point) => `${point.x},${point.y}`)
            .join(" ")}
          fill="none"
          stroke={safetyResult?.passed ? "#00e5ff" : "#ef4444"}
          strokeWidth="0.9"
          strokeDasharray="1.5 1"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </>
    )}

    {/* Station A: robot starting point, without an extra circle */}
    <text
      x={START.x}
      y={START.y - 7}
      fontSize="3.5"
      fontWeight="bold"
      textAnchor="middle"
      fill="#60a5fa"
    >
      Station A
    </text>

    {/* Station B: green target ring */}
    <circle
      cx={GOAL.x}
      cy={GOAL.y}
      r="4"
      fill="#052e16"
      stroke="#22c55e"
      strokeWidth="1"
    />

    <circle
      cx={GOAL.x}
      cy={GOAL.y}
      r="1.7"
      fill="#86efac"
    />

    <text
      x={GOAL.x}
      y={GOAL.y - 7}
      fontSize="3.5"
      fontWeight="bold"
      textAnchor="middle"
      fill="#4ade80"
    >
      Station B
    </text>
  </svg>

  {/* Large robot face */}
  <div
    style={{
      position: "absolute",
      left: `${robotPosition.x}%`,
      top: `${robotPosition.y}%`,
      transform: "translate(-50%, -50%)",
      fontSize: 40,
      lineHeight: 1,
      transition: simulationRunning
        ? "left 0.65s linear, top 0.65s linear"
        : "none",
      zIndex: 2,
      pointerEvents: "none",
    }}
    aria-label="Virtual robot"
  >
    🤖
  </div>
</div>

            <div className="simulation-footer">
              <span>Environment: 2D Digital Twin</span>
              <span>{simulationResult}</span>
            </div>
            {outcomeMessage && (
              <div className="received-task" style={{ marginTop: 12 }}>
                <strong>Experience Memory Update</strong>
                <p>{outcomeMessage}</p>
              </div>
            )}
          </div>

          <section className="task-card" style={{ marginTop: 18 }}>
            <h3>Safety Verification</h3>
            <p>
              The route is checked independently against the expanded
              obstacle zones before the robot animation can start.
            </p>

            <div
              className="received-task"
              style={{
                borderLeft: `4px solid ${
                  safetyResult == null
                    ? "#94a3b8"
                    : safetyResult.passed
                    ? "#16a34a"
                    : "#dc2626"
                }`,
              }}
            >
              <strong>
                {safetyResult == null
                  ? "⏳ Not checked yet"
                  : safetyResult.passed
                  ? "✓ 2D ROUTE CHECK PASSED"
                  : "⚠ ROUTE BLOCKED"}
              </strong>
              <p>
                {safetyResult?.reason ||
                  "Start a task to plan and verify a route."}
              </p>
              <p>
                This is a software check of the displayed 2D model,
                not a guarantee of real-world robot safety.
              </p>
            </div>
          </section>

          <section className="task-card">
            <h3>Dynamic Obstacle Controls</h3>
            <p>
              Move an obstacle to change the environment. Then plan and
              verify a new route before starting another simulation.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {obstacles.map((obstacle) => (
                <button
                  key={obstacle.id}
                  className="start-button"
                  onClick={() => moveObstacle(obstacle.id)}
                  disabled={simulationRunning || status === "sending"}
                >
                  Move Obstacle {obstacle.id}
                </button>
              ))}
            </div>
          </section>
        </section>

        <section className="process-section">
          <div className="section-heading">
            <h3>Agent Workflow</h3>
            <p>From understanding a task to checking a virtual route.</p>
          </div>
          <div className="workflow">
            {[
              ["01", "🧠", "Understand", "Understand the task."],
              ["02", "📋", "Plan", "Generate an AI action plan."],
              ["03", "🌐", "Route", "Find a path around obstacles."],
              ["04", "🛡️", "Verify", "Check route segments."],
              ["05", "💡", "Remember", "Retrieve past experiences."],
            ].map(([number, icon, title, description]) => (
              <div className="workflow-card" key={number}>
                <div className="workflow-number">{number}</div>
                <div className="workflow-icon">{icon}</div>
                <h4>{title}</h4>
                <p>{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="technology">
          <div className="tech-card">
            <strong>NVIDIA Nemotron</strong>
            <span>AI Reasoning</span>
          </div>
          <div className="tech-card">
            <strong>Nebius</strong>
            <span>AI Infrastructure</span>
          </div>
          <div className="tech-card">
            <strong>Digital Twin</strong>
            <span>2D Visual Simulation</span>
          </div>
          <div className="tech-card">
            <strong>Experience Memory</strong>
            <span>Past Task Retrieval</span>
          </div>
        </section>
      </main>

      <footer>
        PhysicalLink AI • Physical AI Experience &amp; Simulation Agent
      </footer>
    </div>
  );
}

export default App;
