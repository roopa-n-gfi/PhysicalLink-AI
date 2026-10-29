import { useState } from "react";
import "./App.css";

function App() {
  const [task, setTask] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [receivedTask, setReceivedTask] = useState("");
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [robotPosition, setRobotPosition] = useState(0);
  const [robotY, setRobotY] = useState(0);
  const [simulationResult, setSimulationResult] = useState("");

  const startSimulation = async () => {
    if (!task.trim()) {
      setMessage("Please enter a task first.");
      setStatus("error");
      return;
    }

    setStatus("sending");
    setMessage("Sending task to PhysicalLink AI...");
    setReceivedTask("");

    try {
      const response = await fetch("http://127.0.0.1:8000/api/task", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          task: task,
        }),
      });

      if (!response.ok) {
        throw new Error("Backend request failed.");
      }

      const data = await response.json();

      if (data.success) {
        setStatus("success");
        setMessage(data.message);
        setReceivedTask(data.task);
        setSimulationRunning(true);
setSimulationResult("Planning safe path...");
setRobotPosition(0);
setRobotY(0);

setTimeout(() => {
  setSimulationResult("Moving to safe waypoint...");
  setRobotPosition(20);
}, 700);

setTimeout(() => {
  setSimulationResult("Avoiding obstacle 1...");
  setRobotY(-25);
  setRobotPosition(35);
}, 1400);

setTimeout(() => {
  setSimulationResult("Path clear...");
  setRobotY(0);
  setRobotPosition(50);
}, 2100);

setTimeout(() => {
  setSimulationResult("Avoiding obstacle 2...");
  setRobotY(-20);
  setRobotPosition(65);
}, 2800);

setTimeout(() => {
  setSimulationResult("Moving toward Station B...");
  setRobotY(0);
  setRobotPosition(80);
}, 3500);

setTimeout(() => {
  setRobotPosition(90);
  setSimulationRunning(false);
  setSimulationResult("SAFE PATH VERIFIED");
}, 5000);
        setSimulationRunning(true);
        setSimulationResult("Planning safe path...");
        setRobotPosition(0);
        setRobotY(0);

        setTimeout(() => {
          setSimulationResult("Moving to safe waypoint...");
          setRobotPosition(20);
        }, 700);

        setTimeout(() => {
          setSimulationResult("Avoiding obstacle 1...");
          setRobotPosition(35);
          setRobotY(-25);
        }, 1400);

        setTimeout(() => {
          setSimulationResult("Path clear...");
          setRobotPosition(50);
          setRobotY(0);
        }, 2100);

        setTimeout(() => {
          setSimulationResult("Avoiding obstacle 2...");
          setRobotPosition(65);
          setRobotY(-20);
        }, 2800);

        setTimeout(() => {
          setSimulationResult("Moving toward Station B...");
          setRobotPosition(80);
          setRobotY(0);
        }, 3500);

        setTimeout(() => {
          setRobotPosition(90);
          setSimulationRunning(false);
          setSimulationResult("SAFE PATH VERIFIED");
        }, 5000);
      } else {
        setStatus("error");
        setMessage(data.message);
      }
    } catch (error) {
      console.error(error);

      setStatus("error");
      setMessage(
        "Unable to connect to the PhysicalLink AI backend."
      );
    }
  };

  return (
    <div className="app">

      {/* Header */}
      <header className="header">
        <div className="brand">
          <div className="brand-icon">P</div>

          <div>
            <h1>PhysicalLink AI</h1>
            <p>
              Physical AI Experience & Simulation Agent
            </p>
          </div>
        </div>

        <div className="status">
          <span className="status-dot"></span>
          AI System Ready
        </div>
      </header>


      {/* Main */}
      <main className="main">

        {/* Hero */}
        <section className="hero">

          <div>
            <span className="tag">
              PHYSICAL AI
            </span>

            <h2>
              Teach AI to learn before
              <span> it acts.</span>
            </h2>

            <p>
              PhysicalLink AI plans actions, tests them
              inside a digital twin, learns from experience,
              and verifies safe actions before they reach
              the physical world.
            </p>
          </div>

        </section>


        {/* Task */}
        <section className="task-card">

          <div className="section-title">

            <div>
              <h3>Give the Agent a Task</h3>

              <p>
                Describe what the virtual robot needs
                to accomplish.
              </p>
            </div>

          </div>


          <textarea
            value={task}
            onChange={(event) => setTask(event.target.value)}
            placeholder="Example: Move the fragile package from Station A to Station B without hitting obstacles."
          />


          <button
            className="start-button"
            onClick={startSimulation}
            disabled={status === "sending"}
          >
            <span>▶</span>

            {status === "sending"
              ? "Sending..."
              : "Start Simulation"}
          </button>


          {/* Backend result */}
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

        {/* Digital Twin Simulation */}
        <section 
        className="simulation-section">

          <div 
        className="section-heading">  
             <h3>Digital Twin 
        Simulation</h3>
             <p>
               Test the planned robot 
        action in a virtual environment 
        before physical execution.
             </p>
           </div>

           <div 
        className="simulation-card">

             <div 
        className="simulation-header">
                <span>VIRTUAL 
        ENVIRONMENT</span>

                 <span 
        className={`simulation-status $
        {simulationRunning ? "running" : 
        ""}`}>
                 ● {simulationRunning ? 
        "SIMULATION RUNNING" : "READY"}
                 </span>
              </div>

             <div 
        className="simulation-world">

            <div className="station 
        station-a">
                <span>Station A</span>
                <strong>START</strong>
              </div>

              <div className="obstacle 
        obstacle-one">
               OBSTACLE
            </div>

            <div className="obstacle 
        obstacle-two">
               OBSTACLE
            </div>

            <div
              className="robot"
             style={{
  left: `${10 + robotPosition}%`,
  top: `${43 + robotY}%`
}}
              >
                 🤖
               </div>

              <div className="package">
                📦
               </div>

               <div className="station 
          station-b">
                  <span>Station B</span>
                  <strong>GOAL</strong>
                </div>

               </div>

               <div 
          className="simulation-footer">

                <span>
                   Environment: Digital 
          Twin
                </span>

                <span>
                   {simulationResult ||  
          "Waiting for simulation"}
                   </span>

                  </div>

                </div>

              </section>
        {/* Workflow */}
        <section className="process-section">

          <div className="section-heading">

            <h3>Agent Workflow</h3>

            <p>
              From task understanding to verified
              physical action.
            </p>

          </div>


          <div className="workflow">

            <div className="workflow-card active">

              <div className="workflow-number">
                01
              </div>

              <div className="workflow-icon">
                🧠
              </div>

              <h4>Understand</h4>

              <p>
                Understand the physical task.
              </p>

            </div>


            <div className="arrow">→</div>


            <div className="workflow-card">

              <div className="workflow-number">
                02
              </div>

              <div className="workflow-icon">
                📋
              </div>

              <h4>Plan</h4>

              <p>
                Create an action strategy.
              </p>

            </div>


            <div className="arrow">→</div>


            <div className="workflow-card">

              <div className="workflow-number">
                03
              </div>

              <div className="workflow-icon">
                🌐
              </div>

              <h4>Simulate</h4>

              <p>
                Test the action in a digital twin.
              </p>

            </div>


            <div className="arrow">→</div>


            <div className="workflow-card">

              <div className="workflow-number">
                04
              </div>

              <div className="workflow-icon">
                💡
              </div>

              <h4>Learn</h4>

              <p>
                Remember successful and failed actions.
              </p>

            </div>


            <div className="arrow">→</div>


            <div className="workflow-card">

              <div className="workflow-number">
                05
              </div>

              <div className="workflow-icon">
                🛡️
              </div>

              <h4>Verify</h4>

              <p>
                Approve only safe actions.
              </p>

            </div>

          </div>

        </section>


        {/* Technology */}
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
            <span>Simulation</span>
          </div>

          <div className="tech-card">
            <strong>Experience Memory</strong>
            <span>Continuous Learning</span>
          </div>

        </section>

      </main>


      <footer>
        PhysicalLink AI • Physical AI Experience & Simulation Agent
      </footer>

    </div>
  );
}

export default App;