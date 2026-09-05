import { useEffect, useState } from "react";
import { io } from "socket.io-client";

async function api(path, options = {}) {
  const token = localStorage.getItem("lw_token");
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });
  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }
  if (!response.ok) throw new Error(data.message || "Something went wrong.");
  return data;
}

const demoStudents = [
  {
    id: 101,
    fullName: "Amara Okafor",
    email: "amara@example.com",
    phone: "+234 800 000 0001",
    experienceLevel: "Beginner",
    learningGoal: "Build cloud deployment and automation skills.",
    status: "pending",
  },
  {
    id: 102,
    fullName: "Daniel Adeyemi",
    email: "daniel@example.com",
    phone: "+234 800 000 0002",
    experienceLevel: "Intermediate",
    learningGoal: "Move into a DevOps engineering role.",
    status: "pending",
  },
  {
    id: 103,
    fullName: "Zainab Bello",
    email: "zainab@example.com",
    phone: "+234 800 000 0003",
    experienceLevel: "Beginner",
    learningGoal: "Learn Linux, AWS and CI/CD through practical projects.",
    status: "approved",
  },
];

const Logo = () => (
  <a className="brand" href="#home">
    <img src="/livingworth-logo.jpeg" alt="Livingworth Academy" />
  </a>
);

function Header({ navigate }) {
  return (
    <header className="nav">
      <Logo />
      <nav>
        <a href="#curriculum">Curriculum</a>
        <a href="#experience">How it works</a>
        <a href="#schedule">Schedule</a>
        <a href="#projects">Projects</a>
      </nav>
      <div className="nav-actions">
        <button className="text-btn" onClick={() => navigate("student-login")}>
          Portal login
        </button>
        <button className="button primary" onClick={() => navigate("register")}>
          Apply now
        </button>
      </div>
    </header>
  );
}

function Home({ navigate }) {
  const modules = [
    [
      "01",
      "DevOps & SDLC",
      "Understand DevOps culture, software delivery, Agile, Scrum, HLD vs LLD, Jira workflows, stories and epics.",
    ],
    [
      "02",
      "Linux & Shell",
      "Work confidently in Linux, manage files and permissions, troubleshoot services and automate tasks with Bash.",
    ],
    [
      "03",
      "Git & GitHub",
      "Use professional branching, commits, pull requests, code reviews and collaborative source-control workflows.",
    ],
    [
      "04",
      "AWS & Cloud",
      "Launch EC2 instances, configure networking and security, use AWS CLI and deploy applications to the cloud.",
    ],
    [
      "05",
      "Ansible & Terraform",
      "Automate configuration with playbooks and build repeatable cloud infrastructure using Infrastructure as Code.",
    ],
    [
      "06",
      "Docker & Containers",
      "Build images, run containers, manage volumes and networks, and Dockerize real frontend and backend applications.",
    ],
    [
      "07",
      "Kubernetes",
      "Deploy scalable workloads with Pods, Deployments, Services, ConfigMaps, Secrets and Ingress.",
    ],
    [
      "08",
      "CI/CD & Observability",
      "Create Jenkins and GitHub Actions pipelines; monitor systems with Prometheus and Grafana.",
    ],
  ];
  const projects = [
    [
      "Cloud foundation",
      "Launch and secure an AWS EC2 Linux server, then document the environment.",
    ],
    [
      "Automation",
      "Write shell scripts, an Ansible playbook and Terraform configuration for repeatable infrastructure.",
    ],
    [
      "Container delivery",
      "Dockerize a full-stack application and publish the images through a clean GitHub workflow.",
    ],
    [
      "Kubernetes platform",
      "Deploy an application with Services and Ingress, then capture monitoring evidence.",
    ],
    [
      "End-to-end capstone",
      "Build a complete CI/CD path from Git commit to cloud deployment, monitoring and project presentation.",
    ],
  ];
  return (
    <>
      <Header navigate={navigate} />
      <main>
        <section className="hero" id="home">
          <div>
            <p className="eyebrow">12-week live DevOps engineering bootcamp</p>
            <h1>
              Don’t just learn it.
              <br />
              <em>Build it.</em>
            </h1>
            <p className="lead">
              Go from curious beginner to confident practitioner with live
              teaching, guided troubleshooting and portfolio projects based on
              real engineering work.
            </p>
            <div className="actions">
              <button
                className="button gold"
                onClick={() => navigate("register")}
              >
                Apply for the next cohort
              </button>
              <a className="button light" href="#curriculum">
                Explore the roadmap
              </a>
            </div>
            <div className="trust">
              <span>✓ 54 guided class days</span>
              <span>✓ Live mentor support</span>
              <span>✓ Portfolio-ready projects</span>
            </div>
          </div>
          <div className="hero-art">
            <div className="hero-card">
              <small>YOUR LEARNING PATH</small>
              <strong>Code → Cloud → Career</strong>
              <div>
                <span>Linux</span>
                <span>AWS</span>
                <span>Docker</span>
                <span>K8s</span>
              </div>
            </div>
            <div className="orbit o1">&lt;/&gt;</div>
            <div className="orbit o2">☁</div>
            <div className="orbit o3">∞</div>
            <div className="core">
              DEV<span>OPS</span>
            </div>
          </div>
        </section>
        <section className="outcome-band">
          <article>
            <strong>12</strong>
            <span>weeks of guided learning</span>
          </article>
          <article>
            <strong>54</strong>
            <span>structured class days</span>
          </article>
          <article>
            <strong>10+</strong>
            <span>industry tools</span>
          </article>
          <article>
            <strong>1</strong>
            <span>end-to-end capstone</span>
          </article>
        </section>
        <section className="devops-strip">
          <span>LINUX</span>
          <span>GIT</span>
          <span>AWS</span>
          <span>ANSIBLE</span>
          <span>TERRAFORM</span>
          <span>DOCKER</span>
          <span>KUBERNETES</span>
          <span>JENKINS</span>
          <span>GRAFANA</span>
        </section>
        <section className="visual-feature">
          <div>
            <p className="eyebrow">From code to production</p>
            <h2>See the complete delivery system—not isolated tools.</h2>
            <p>
              Learn how source control, automation, containers, orchestration,
              pipelines, cloud infrastructure and monitoring work together in a
              real DevOps environment.
            </p>
          </div>
          <img
            src="/devops-delivery-workflow.jpg"
            alt="Visual representation of a DevOps delivery workflow from source code through cloud deployment and monitoring"
          />
        </section>
        <section className="intro" id="experience">
          <p className="eyebrow">The Livingworth approach</p>
          <h2>
            Watch it. Understand it.
            <br />
            Build it yourself.
          </h2>
          <p>
            Pre-recorded lessons introduce each concept. Live sessions focus on
            clear explanations, practical demonstrations, questions,
            troubleshooting and the kind of mistakes engineers meet in real
            environments.
          </p>
          <div className="experience-grid">
            <article>
              <b>01</b>
              <h3>Prepare</h3>
              <p>
                Watch the lesson and review the class objectives before the live
                session.
              </p>
            </article>
            <article>
              <b>02</b>
              <h3>Practise live</h3>
              <p>
                Follow demonstrations, ask questions and troubleshoot alongside
                your instructor.
              </p>
            </article>
            <article>
              <b>03</b>
              <h3>Prove the skill</h3>
              <p>
                Complete assignments, maintain GitHub evidence and receive
                project feedback.
              </p>
            </article>
          </div>
        </section>
        <section className="curriculum" id="curriculum">
          <div className="section-head">
            <div>
              <p className="eyebrow">Beginner to intermediate</p>
              <h2>Your DevOps roadmap</h2>
            </div>
            <p className="section-copy">
              A deliberate progression from delivery fundamentals to cloud
              automation, containers, orchestration, pipelines and
              observability.
            </p>
          </div>
          <div className="module-grid">
            {modules.map((m) => (
              <article key={m[0]}>
                <b>{m[0]}</b>
                <div>
                  <h3>{m[1]}</h3>
                  <p>{m[2]}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="schedule" id="schedule">
          <div>
            <p className="eyebrow">Cohort rhythm</p>
            <h2>Three focused touchpoints every week.</h2>
            <p>
              Classes run on Google Meet from 8:00–9:00 p.m. GMT+1. Every week
              combines orientation, review and a deeper practical session.
            </p>
            <ul>
              <li>Laptop: 8GB RAM minimum, 16GB preferred</li>
              <li>Reliable internet, Gmail and GitHub account</li>
              <li>VS Code, Git, Docker, terminal/WSL or Linux VM</li>
              <li>AWS free-tier and Docker Hub accounts</li>
            </ul>
          </div>
          <div className="week">
            <article>
              <b>MON</b>
              <h3>Orientation</h3>
              <p>New topic, learning objectives and guided foundation.</p>
            </article>
            <article>
              <b>WED</b>
              <h3>Summary & practice</h3>
              <p>Review, questions, demonstrations and troubleshooting.</p>
            </article>
            <article>
              <b>FRI</b>
              <h3>Live class</h3>
              <p>Deep practical teaching, discussion and project work.</p>
            </article>
          </div>
        </section>
        <section className="mentor">
          <img
            src="/devops-mentor-lab.jpg"
            alt="DevOps mentor guiding learners during a practical technology session"
          />
          <div>
            <p className="eyebrow">Meet your mentor</p>
            <h2>Guidance grounded in real DevOps work.</h2>
            <span className="mentor-name">Jethro Femi</span>
            <span className="mentor-role">
              Lead DevOps Mentor · Managing Director
            </span>
            <p>
              The programme is led with practical engineering experience, simple
              explanations and live troubleshooting. Students learn not only
              which commands to run, but how to reason through failures,
              communicate technical decisions and deliver reliable systems.
            </p>
            <div className="mentor-points">
              <span>Cloud & infrastructure</span>
              <span>CI/CD & automation</span>
              <span>Containers & orchestration</span>
              <span>Production troubleshooting</span>
            </div>
          </div>
        </section>
        <section className="projects" id="projects">
          <p className="eyebrow">Evidence, not just theory</p>
          <h2>Projects you can explain, defend and demonstrate.</h2>
          <div className="project-list">
            {projects.map((p, i) => (
              <article key={p[0]}>
                <span>0{i + 1}</span>
                <div>
                  <h3>{p[0]}</h3>
                  <p>{p[1]}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="expectations">
          <div>
            <p className="eyebrow">Built for committed learners</p>
            <h2>What success requires</h2>
          </div>
          <div className="expectation-grid">
            <p>
              <b>Show up.</b> Attendance, punctuality and active participation
              are essential.
            </p>
            <p>
              <b>Practise outside class.</b> DevOps becomes real through
              repetition and independent troubleshooting.
            </p>
            <p>
              <b>Submit your work.</b> Assignments, GitHub evidence and the
              final project are part of completion.
            </p>
            <p>
              <b>Stay accountable.</b> Learners missing more than half of the
              programme may be removed.
            </p>
          </div>
        </section>
        <section className="career">
          <p className="eyebrow">Beyond the tools</p>
          <h2>Finish ready to tell your engineering story.</h2>
          <p>
            The final phase covers networking, project presentation, GitHub
            portfolio improvement, interview preparation and explaining
            technical decisions with confidence.
          </p>
          <button className="button gold" onClick={() => navigate("register")}>
            Start your application
          </button>
        </section>
        <section className="cta">
          <Logo />
          <h2>Build your DevOps future.</h2>
          <p>
            Join a practical academy where every concept leads to something you
            can create.
          </p>
          <button className="button gold" onClick={() => navigate("register")}>
            Apply to Livingworth Academy
          </button>
        </section>
      </main>
      <footer className="footer">
        <Logo />
        <div>
          <a href="#curriculum">Curriculum</a>
          <button onClick={() => navigate("student-login")}>
            Student portal
          </button>
          <button onClick={() => navigate("mentor-login")}>
            Mentor portal
          </button>
          <button onClick={() => navigate("admin-login")}>Admin portal</button>
        </div>
        <p>© {new Date().getFullYear()} Livingworth Academy.</p>
      </footer>
    </>
  );
}

function AuthLayout({ title, subtitle, children, navigate }) {
  return (
    <main className="auth-page">
      <section className="auth-brand">
        <Logo />
        <div>
          <p className="eyebrow">Livingworth Academy Portal</p>
          <h1>
            Learn with purpose.
            <br />
            <em>Grow with confidence.</em>
          </h1>
        </div>
        <button className="back" onClick={() => navigate("home")}>
          ← Return to website
        </button>
      </section>
      <section className="auth-panel">
        <div className="auth-box">
          <h2>{title}</h2>
          <p>{subtitle}</p>
          {children}
        </div>
      </section>
    </main>
  );
}

function Login({ portal, navigate, onLogin }) {
  const [message, setMessage] = useState("");
  function openOfflineDemo() {
    const user = {
      id: "demo-admin",
      fullName: "Livingworth Administrator",
      email: "admin@livingworthacademy.com",
      role: "admin",
      status: "approved",
      demo: true,
    };
    localStorage.setItem("lw_demo_admin", "true");
    onLogin(user);
  }
  async function submit(e) {
    e.preventDefault();
    setMessage("Signing in…");
    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          ...Object.fromEntries(new FormData(e.currentTarget)),
          portal,
        }),
      });
      localStorage.setItem("lw_token", data.token);
      onLogin(data.user);
    } catch (err) {
      setMessage(
        `${err.message} ${portal === "admin" ? "You can still open the offline admin preview below." : ""}`,
      );
    }
  }
  const titles = {
    admin: "Administrator login",
    mentor: "Mentor login",
    student: "Welcome back",
  };
  const subtitles = {
    admin: "Manage learners, mentors and academy access.",
    mentor: "Guide learners, review the cohort and host live quizzes.",
    student: "Continue your Livingworth learning journey.",
  };
  return (
    <AuthLayout
      navigate={navigate}
      title={titles[portal]}
      subtitle={subtitles[portal]}
    >
      <div className="portal-switcher">
        <button
          className={portal === "student" ? "active" : ""}
          onClick={() => navigate("student-login")}
        >
          Student
        </button>
        <button
          className={portal === "mentor" ? "active" : ""}
          onClick={() => navigate("mentor-login")}
        >
          Mentor
        </button>
        <button
          className={portal === "admin" ? "active" : ""}
          onClick={() => navigate("admin-login")}
        >
          Admin
        </button>
      </div>
      <form className="form" onSubmit={submit}>
        <label>
          Email address
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <button className="button primary full">
          Sign in to {portal} portal
        </button>
        <p className="form-message">{message}</p>
      </form>
      {portal === "admin" && (
        <div className="offline-box">
          <b>Backend unavailable?</b>
          <p>
            Open a browser-only preview of the admin portal. Demo approvals stay
            on this device and do not change the real database.
          </p>
          <button className="button offline full" onClick={openOfflineDemo}>
            Open offline admin preview
          </button>
        </div>
      )}
      <div className="switch">
        {portal === "student" && (
          <>
            New student?{" "}
            <button onClick={() => navigate("register")}>Register here</button>
          </>
        )}
      </div>
    </AuthLayout>
  );
}

function Register({ navigate }) {
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [applicant, setApplicant] = useState(null);
  const [country, setCountry] = useState("Nigeria");
  const courses = ["DevOps Engineering"];
  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    if (values.country === "Other") values.country = values.otherCountry;
    if (values.password !== values.confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }
    setMessage("Submitting…");
    try {
      const data = await api("/auth/register", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setMessage(data.message);
      setApplicant({ firstName: values.firstName, email: values.email, emailSent: data.emailSent });
      form.reset();
      setCountry("Nigeria");
      setDone(true);
    } catch (err) {
      setMessage(err.message);
    }
  }
  if (done) {
    return (
      <AuthLayout
        navigate={navigate}
        title="Application received"
        subtitle="Your Livingworth Academy application has been submitted successfully."
      >
        <section className="application-success">
          <span className="success-mark" aria-hidden="true">✓</span>
          <h2>Thank you, {applicant?.firstName}.</h2>
          <p>
            {applicant?.emailSent
              ? <>We sent your confirmation to <strong>{applicant.email}</strong>. </>
              : <>Your application was saved for <strong>{applicant?.email}</strong>. </>}
            It is now awaiting administrator review.
          </p>
          <div className="success-next">
            <b>What happens next?</b>
            <ol>
              <li>An administrator reviews your application.</li>
              <li>You receive an email when a decision is made.</li>
              <li>After approval, sign in using the password you created.</li>
            </ol>
          </div>
          <button className="button primary full" onClick={() => navigate("student-login")}>
            Go to student sign in
          </button>
          <button className="text-btn" onClick={() => navigate("home")}>
            Return to homepage
          </button>
        </section>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout
      navigate={navigate}
      title="Apply to Livingworth Academy"
      subtitle="Complete the application below. We will review it before activating your student portal."
    >
      <form className="form two application-form" onSubmit={submit}>
        <div className="form-section wide">
          <span>01</span>
          <div>
            <h3>Personal information</h3>
            <p>Tell us how to identify and contact you.</p>
          </div>
        </div>
        <label>
          First Name <b>*</b>
          <input name="firstName" autoComplete="given-name" required />
        </label>
        <label>
          Last Name <b>*</b>
          <input name="lastName" autoComplete="family-name" required />
        </label>
        <label>
          Email Address <b>*</b>
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Phone Number <small>(WhatsApp preferred)</small> <b>*</b>
          <input name="phone" type="tel" autoComplete="tel" required />
        </label>
        <fieldset className="wide choice-field">
          <legend>
            Gender <b>*</b>
          </legend>
          {["Male", "Female", "Prefer not to say"].map((x) => (
            <label key={x}>
              <input type="radio" name="gender" value={x} required />
              {x}
            </label>
          ))}
        </fieldset>
        <label>
          Country <b>*</b>
          <select
            name="country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            required
          >
            {[
              "Nigeria",
              "UK",
              "United States",
              "Ghana",
              "Kenya",
              "Canada",
              "Other",
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        {country === "Other" && (
          <label>
            Specify Country <b>*</b>
            <input name="otherCountry" required />
          </label>
        )}
        <label className={country === "Other" ? "wide" : ""}>
          State/City <b>*</b>
          <input name="stateCity" required />
          <small>
            Enter “Other” if you are based outside Nigeria and your location is
            not listed.
          </small>
        </label>
        <div className="form-section wide">
          <span>02</span>
          <div>
            <h3>Education and experience</h3>
            <p>Help us understand your current stage.</p>
          </div>
        </div>
        <label>
          Current Employment/Study Status <b>*</b>
          <select name="employmentStatus" defaultValue="" required>
            <option value="" disabled>
              Select your status
            </option>
            {[
              "Student",
              "Graduate",
              "NYSC Corper",
              "Working Professional (Employed)",
              "Self Employed",
              "Unemployed",
              "Other",
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Educational Level <b>*</b>
          <select name="educationalLevel" defaultValue="" required>
            <option value="" disabled>
              Select your level
            </option>
            {[
              "High School",
              "Degree",
              "Masters",
              "HND",
              "Diploma",
              "OND",
              "MPhil / PhD",
              "NCE",
              "Other",
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <fieldset className="wide choice-field">
          <legend>
            Do you have any prior tech experience? <b>*</b>
          </legend>
          {[
            "Yes, I already have some experience",
            "No, I’m completely new to tech",
            "A little, but I want to deepen my knowledge",
          ].map((x) => (
            <label key={x}>
              <input type="radio" name="techExperience" value={x} required />
              {x}
            </label>
          ))}
        </fieldset>
        <div className="form-section wide">
          <span>03</span>
          <div>
            <h3>Course preference</h3>
            <p>Choose the learning format that suits you.</p>
          </div>
        </div>
        <label className="wide">
          Which course would you like to apply for? <b>*</b>
          <select name="courseChoice" defaultValue="" required>
            <option value="" disabled>
              Select a course
            </option>
            {courses.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <fieldset className="wide choice-field">
          <legend>
            Preferred Mode of Learning <b>*</b>
            <small>Select the option that best fits your schedule.</small>
          </legend>
          {[
            "Online",
            "Physical (In-person)",
            "Hybrid (Mix of online & physical)",
          ].map((x) => (
            <label key={x}>
              <input type="radio" name="learningMode" value={x} required />
              {x}
            </label>
          ))}
        </fieldset>
        <div className="form-section wide">
          <span>04</span>
          <div>
            <h3>Student portal access</h3>
            <p>
              Create the password you will use after your application is
              approved.
            </p>
          </div>
        </div>
        <label>
          Password <b>*</b>
          <input
            name="password"
            type="password"
            minLength="8"
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          Confirm Password <b>*</b>
          <input
            name="confirmPassword"
            type="password"
            minLength="8"
            autoComplete="new-password"
            required
          />
        </label>
        <label className="wide terms-check">
          <input name="termsAccepted" type="checkbox" required />
          <span>
            By submitting this form, you confirm that you have read and accepted
            Livingworth Academy’s{" "}
            <a
              href="/terms-and-conditions.html"
              target="_blank"
              rel="noreferrer"
            >
              Terms and Conditions
            </a>
            . <b>*</b>
          </span>
        </label>
        <button className="button primary full wide" disabled={done}>
          {done ? "Application submitted" : "Submit application"}
        </button>
        <p className={`form-message wide ${done ? "success" : ""}`}>
          {message}
        </p>
      </form>
      <p className="switch">
        Already registered?{" "}
        <button onClick={() => navigate("student-login")}>Sign in</button>
      </p>
    </AuthLayout>
  );
}

function Sidebar({ role, active, onSelect, logout }) {
  const items =
    role === "admin"
      ? ["Overview", "Applications", "Mentors", "Learning", "Attendance", "Live quiz"]
      : role === "mentor"
        ? ["Overview", "Learners", "Learning", "Attendance", "Live quiz"]
        : ["Overview", "Programme", "Learning", "Attendance", "Live quiz"];
  return (
    <aside className="sidebar">
      <Logo />
      <div className="role-chip">{role} portal</div>
      <nav>
        {items.map((item) => (
          <button
            key={item}
            className={active === item ? "active" : ""}
            onClick={() => onSelect(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      <button className="text-btn logout" onClick={logout}>
        Log out
      </button>
    </aside>
  );
}

function dateInputValue(date) {
  return new Date(date).toISOString().slice(0, 10);
}
function latestClassDate() {
  const date = new Date();
  while (![1, 3, 5].includes(date.getDay())) date.setDate(date.getDate() - 1);
  return dateInputValue(date);
}
function displayDate(value) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${String(value).slice(0, 10)}T12:00:00`));
}

function reportDefaultRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - 30);
  return { from: dateInputValue(from), to: dateInputValue(to) };
}

function AttendanceReports({ onDaily }) {
  const defaults = reportDefaultRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [studentId, setStudentId] = useState("");
  const [status, setStatus] = useState("");
  const [report, setReport] = useState({ records: [], students: [], summary: { total: 0, present: 0, late: 0, absent: 0, excused: 0 } });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  function setQuickRange(kind) {
    const end = new Date();
    const start = new Date(end);
    if (kind === "week") start.setDate(end.getDate() - ((end.getDay() + 6) % 7));
    else start.setDate(end.getDate() - 30);
    setFrom(dateInputValue(start));
    setTo(dateInputValue(end));
  }
  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams({ from, to });
      if (studentId) params.set("studentId", studentId);
      if (status) params.set("status", status);
      setReport(await api(`/staff/attendance/report?${params}`));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [studentId, status, from, to]);
  async function exportReport() {
    try {
      const params = new URLSearchParams({ from, to });
      if (studentId) params.set("studentId", studentId);
      if (status) params.set("status", status);
      const response = await fetch(`/api/staff/attendance/export?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("lw_token")}` },
      });
      if (!response.ok) throw new Error("Could not export attendance.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `livingworth-attendance-${from}-to-${to}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) { setMessage(error.message); }
  }
  const selectedName = report.students.find((student) => String(student.studentId) === String(studentId))?.fullName;
  return (
    <>
      <div className="attendance-view-tabs">
        <button onClick={onDaily}>Daily register</button><button className="active">Reports & warnings</button>
      </div>
      <div className="attendance-head report-heading">
        <div><p className="eyebrow">Attendance intelligence</p><h2>Reports & warnings</h2><p>Review performance and identify learners who need follow-up.</p></div>
        <button className="button light-border" onClick={exportReport}>Export CSV</button>
      </div>
      <div className="report-presets"><span>Quick summary</span><button onClick={() => setQuickRange("week")}>This week</button><button onClick={() => setQuickRange("month")}>Last 30 days</button></div>
      <form className="report-filters" onSubmit={(event) => { event.preventDefault(); load(); }}>
        <label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} required /></label>
        <label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} required /></label>
        <label>Student<select value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">All students</option>{report.students.map((student) => <option key={student.studentId} value={student.studentId}>{student.fullName}</option>)}</select></label>
        <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{["present", "late", "absent", "excused"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <button className="button primary">Apply filters</button>
      </form>
      <p className="form-message">{loading ? "Loading report…" : message}</p>
      <div className="report-metrics">
        {[["Sessions", report.summary.total], ["Present", report.summary.present], ["Late", report.summary.late], ["Absent", report.summary.absent], ["Excused", report.summary.excused]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}
      </div>
      {!studentId && <div className="learner-attendance-list">
        {report.students.map((student) => (
          <article key={student.studentId} className={student.warning || (student.counted > 0 && student.percentage < 75) ? "needs-attention" : ""}>
            <div className="attendance-person"><span className="student-avatar">{student.fullName[0]}</span><div><strong>{student.fullName}</strong><small>{student.email}</small></div></div>
            <div className="attendance-breakdown"><span>{student.present} present</span><span>{student.late} late</span><span>{student.absent} absent</span><span>{student.excused} excused</span></div>
            <strong className={`attendance-percentage ${student.counted > 0 && student.percentage < 75 ? "low" : ""}`}>{student.percentage}%</strong>
            <div className="attendance-flags">{student.warning && <b>Missed Mon & Wed</b>}{student.counted > 0 && student.percentage < 75 && <b>Below 75%</b>}</div>
            <button className="profile-button" onClick={() => setStudentId(String(student.studentId))}>View history</button>
          </article>
        ))}
      </div>}
      {studentId && <div className="individual-history"><div className="history-title"><div><p className="eyebrow">Individual history</p><h3>{selectedName || "Selected learner"}</h3></div><button className="text-btn" onClick={() => setStudentId("")}>View all students</button></div>{report.records.length ? report.records.map((record, index) => <article key={`${record.studentId}-${record.sessionDate}-${index}`}><div><strong>{displayDate(record.sessionDate)}</strong><small>{record.note || "No note"}</small></div><span className={`attendance-status ${record.status}`}>{record.status}</span></article>) : <div className="empty">No attendance records match these filters.</div>}</div>}
    </>
  );
}

function AttendanceCenter({ mode, demo = false }) {
  const staff = mode === "staff";
  const [date, setDate] = useState(latestClassDate()),
    [records, setRecords] = useState([]),
    [summary, setSummary] = useState({ attended: 0, total: 0, percentage: 0 }),
    [message, setMessage] = useState(""),
    [saving, setSaving] = useState(false),
    [view, setView] = useState("daily");
  async function load(selected = date) {
    if (demo) {
      setMessage("Connect the backend to use the attendance register.");
      return;
    }
    setMessage("Loading attendance…");
    try {
      const data = await api(
        staff ? `/staff/attendance?date=${selected}` : "/student/attendance",
      );
      setRecords(data.records || []);
      if (data.summary) setSummary(data.summary);
      setMessage("");
    } catch (e) {
      setRecords([]);
      setMessage(e.message);
    }
  }
  useEffect(() => {
    load();
  }, [mode, demo]);
  function update(studentId, field, value) {
    setRecords((current) =>
      current.map((record) =>
        record.studentId === studentId ? { ...record, [field]: value } : record,
      ),
    );
  }
  function markEveryone(status) {
    setRecords((current) => current.map((record) => ({ ...record, status })));
  }
  async function save() {
    const selected = records
      .filter((record) => record.status)
      .map(({ studentId, status, note }) => ({ studentId, status, note }));
    if (!selected.length) {
      setMessage("Mark at least one student before saving.");
      return;
    }
    setSaving(true);
    try {
      const data = await api("/staff/attendance", {
        method: "PUT",
        body: JSON.stringify({ date, records: selected }),
      });
      setMessage(data.message);
      load(date);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setSaving(false);
    }
  }
  if (staff && view === "reports") return <section className="attendance"><AttendanceReports onDaily={() => setView("daily")} /></section>;
  if (staff)
    return (
      <section className="attendance">
        <div className="attendance-view-tabs"><button className="active">Daily register</button><button onClick={() => setView("reports")}>Reports & warnings</button></div>
        <div className="attendance-head">
          <div>
            <p className="eyebrow">Class register</p>
            <h2>Mark attendance</h2>
            <p>Sessions run every Monday, Wednesday and Friday.</p>
          </div>
          <label>
            Session date
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                load(e.target.value);
              }}
            />
          </label>
        </div>
        <p className="form-message">{message}</p>
        <div className="attendance-key">
          <span className="present">Present</span>
          <span className="late">Late</span>
          <span className="absent">Absent</span>
          <span className="excused">Excused</span>
        </div>
        {records.length > 0 && <div className="attendance-bulk"><span>Bulk actions</span><button onClick={() => markEveryone("present")}>Mark everyone present</button><button onClick={() => markEveryone("absent")}>Mark everyone absent</button><button onClick={() => markEveryone("")}>Clear selections</button></div>}
        <div className="attendance-list">
          {records.length === 0 ? (
            <div className="empty">
              No approved students found for this register.
            </div>
          ) : (
            records.map((record) => (
              <article key={record.studentId}>
                <div className="attendance-person">
                  <span className="student-avatar">{record.fullName[0]}</span>
                  <div>
                    <strong>{record.fullName}</strong>
                    <small>{record.email}</small>
                  </div>
                </div>
                <div className="attendance-options">
                  {["present", "late", "absent", "excused"].map((status) => (
                    <button
                      key={status}
                      className={
                        record.status === status ? `selected ${status}` : ""
                      }
                      onClick={() => update(record.studentId, "status", status)}
                    >
                      {status}
                    </button>
                  ))}
                </div>
                <input
                  className="attendance-note"
                  placeholder="Optional note"
                  value={record.note || ""}
                  onChange={(e) =>
                    update(record.studentId, "note", e.target.value)
                  }
                />
              </article>
            ))
          )}
        </div>
        {records.length > 0 && (
          <div className="attendance-save">
            <span>
              {records.filter((r) => r.status).length} of {records.length}{" "}
              marked
            </span>
            <button className="button primary" disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Save attendance"}
            </button>
          </div>
        )}
      </section>
    );
  return (
    <section className="attendance">
      <div className="attendance-head">
        <div>
          <p className="eyebrow">My attendance</p>
          <h2>{summary.percentage}% attendance</h2>
          <p>
            {summary.attended} of {summary.total} counted sessions attended.
            Excused sessions are not counted against you.
          </p>
        </div>
        <div className="attendance-score">{summary.percentage}%</div>
      </div>
      <p className="form-message">{message}</p>
      <div className="attendance-history">
        {records.length === 0 ? (
          <div className="empty">
            Your attendance history will appear after your first marked session.
          </div>
        ) : (
          records.map((record) => (
            <article key={record.sessionDate}>
              <div>
                <strong>{displayDate(record.sessionDate)}</strong>
                {record.note && <small>{record.note}</small>}
              </div>
              <span className={`attendance-status ${record.status}`}>
                {record.status}
              </span>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function submissionLabel(status) {
  return status ? status.replaceAll("_", " ") : "Not started";
}

function LearningCenter({ mode, demo = false }) {
  const staff = mode === "staff";
  const [modules, setModules] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [progress, setProgress] = useState({ completed: 0, total: 0, percentage: 0 });
  const [message, setMessage] = useState("");
  const [selectedModule, setSelectedModule] = useState(null);
  const [view, setView] = useState("modules");
  async function load() {
    if (demo) { setMessage("Connect the backend to manage learning content."); return; }
    try {
      const data = await api(staff ? "/staff/learning" : "/student/learning");
      setModules(data.modules || []);
      setSubmissions(data.submissions || []);
      if (data.progress) setProgress(data.progress);
      setMessage("");
    } catch (error) { setMessage(error.message); }
  }
  useEffect(() => { load(); }, [mode, demo]);
  async function createModule(event) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const values = Object.fromEntries(new FormData(form));
      const data = await api("/staff/learning/modules", { method: "POST", body: JSON.stringify({ ...values, published: values.published === "on" }) });
      setMessage(data.message); form.reset(); load();
    } catch (error) { setMessage(error.message); }
  }
  async function togglePublished(module) {
    try {
      const data = await api(`/staff/learning/modules/${module.id}`, { method: "PATCH", body: JSON.stringify({ published: !module.published }) });
      setMessage(data.message); load();
    } catch (error) { setMessage(error.message); }
  }
  async function addMaterial(event, moduleId) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const response = await fetch(`/api/staff/learning/modules/${moduleId}/materials`, {
        method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("lw_token")}` }, body: new FormData(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not add material.");
      setMessage(data.message); form.reset(); load();
    } catch (error) { setMessage(error.message); }
  }
  async function addAssignment(event, moduleId) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const data = await api(`/staff/learning/modules/${moduleId}/assignments`, { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      setMessage(data.message); form.reset(); load();
    } catch (error) { setMessage(error.message); }
  }
  async function submitAssignment(event, assignmentId) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const data = await api(`/student/assignments/${assignmentId}/submission`, { method: "PUT", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      setMessage(data.message); load();
    } catch (error) { setMessage(error.message); }
  }
  async function reviewSubmission(event, submissionId) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const data = await api(`/staff/submissions/${submissionId}/review`, { method: "PATCH", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      setMessage(data.message); load();
    } catch (error) { setMessage(error.message); }
  }
  if (staff) return (
    <section className="learning-center">
      <div className="learning-head"><div><p className="eyebrow">Course workspace</p><h2>Learning & assignments</h2><p>Build the weekly programme, publish resources and review student work.</p></div><div className="learning-tabs"><button className={view === "modules" ? "active" : ""} onClick={() => setView("modules")}>Modules</button><button className={view === "submissions" ? "active" : ""} onClick={() => setView("submissions")}>Submissions ({submissions.filter((item) => item.status === "submitted").length})</button></div></div>
      <p className="form-message success">{message}</p>
      {view === "modules" && <div className="learning-staff-grid">
        <form className="learning-form" onSubmit={createModule}><h3>Create weekly module</h3><label>Week number<input name="weekNumber" type="number" min="1" max="52" required /></label><label>Module title<input name="title" required /></label><label>Summary<textarea name="summary" rows="4" /></label><label className="inline-check"><input name="published" type="checkbox" /> Publish immediately</label><button className="button primary">Create module</button></form>
        <div className="module-admin-list">{modules.length === 0 ? <div className="empty">No modules created yet.</div> : modules.map((module) => <article key={module.id} className={selectedModule === module.id ? "open" : ""}>
          <div className="module-row"><span>Week {module.weekNumber}</span><div><h3>{module.title}</h3><p>{module.summary || "No summary yet."}</p></div><b className={`publish-state ${module.published ? "published" : "draft"}`}>{module.published ? "Published" : "Draft"}</b><button className="profile-button" onClick={() => setSelectedModule(selectedModule === module.id ? null : module.id)}>{selectedModule === module.id ? "Close" : "Manage"}</button></div>
          {selectedModule === module.id && <div className="module-editor">
            <div className="module-resources"><h4>Current content</h4>{module.materials.map((material) => <a key={material.id} href={material.resourceUrl} target="_blank" rel="noreferrer">{material.title} <small>{material.materialType}</small></a>)}{module.assignments.map((assignment) => <div key={assignment.id}><b>{assignment.title}</b><small>Due {new Date(assignment.dueAt).toLocaleString()}</small></div>)}</div>
            <form onSubmit={(event) => addMaterial(event, module.id)}><h4>Add learning material</h4><label>Title<input name="title" required /></label><label>Type<select name="materialType"><option value="link">Resource link</option><option value="video">Video link</option></select></label><label>Resource URL<input name="resourceUrl" type="url" placeholder="https://…" /></label><label>Or upload a file<input name="file" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.zip" /></label><small>Maximum file size: 10 MB</small><button className="button light-border">Add material</button></form>
            <form onSubmit={(event) => addAssignment(event, module.id)}><h4>Create assignment</h4><label>Title<input name="title" required /></label><label>Instructions<textarea name="instructions" rows="4" required /></label><label>Deadline<input name="dueAt" type="datetime-local" required /></label><label>Maximum score<input name="maxScore" type="number" min="1" max="1000" defaultValue="100" required /></label><button className="button light-border">Create assignment</button></form>
            <button className="button primary full" onClick={() => togglePublished(module)}>{module.published ? "Return module to draft" : "Publish module to students"}</button>
          </div>}
        </article>)}</div>
      </div>}
      {view === "submissions" && <div className="submission-review-list">{submissions.length === 0 ? <div className="empty">No assignment submissions yet.</div> : submissions.map((submission) => <article key={submission.id}><div className="submission-heading"><div><span>{submission.assignmentTitle}</span><h3>{submission.studentName}</h3><p>{submission.email} · Submitted {new Date(submission.submittedAt).toLocaleString()}</p></div><div><b className={`work-status ${submission.status}`}>{submissionLabel(submission.status)}</b>{submission.isLate ? <b className="late-flag">Late</b> : null}</div></div><a href={submission.submissionUrl} target="_blank" rel="noreferrer">Open submitted project ↗</a>{submission.note && <p className="student-note">“{submission.note}”</p>}<form onSubmit={(event) => reviewSubmission(event, submission.id)}><label>Result<select name="status" defaultValue={submission.status === "completed" ? "completed" : "needs_correction"}><option value="needs_correction">Needs correction</option><option value="completed">Completed</option></select></label><label>Score<input name="score" type="number" min="0" max="1000" defaultValue={submission.score ?? ""} /></label><label className="review-feedback">Mentor feedback<textarea name="feedback" rows="3" defaultValue={submission.feedback || ""} required /></label><button className="button primary">Save review</button></form></article>)}</div>}
    </section>
  );
  return (
    <section className="learning-center student-learning"><div className="learning-head"><div><p className="eyebrow">DevOps programme</p><h2>Learning workspace</h2><p>Open your lessons, complete assignments and track mentor feedback.</p></div><div className="course-progress"><strong>{progress.percentage}%</strong><span>{progress.completed} of {progress.total} assignments completed</span></div></div><div className="progress-track"><span style={{ width: `${progress.percentage}%` }} /></div><p className="form-message success">{message}</p>{modules.length === 0 ? <div className="empty">Your learning modules will appear here when they are published.</div> : <div className="student-modules">{modules.map((module) => <article key={module.id}><div className="student-module-head"><span>Week {module.weekNumber}</span><div><h3>{module.title}</h3><p>{module.summary}</p></div></div>{module.materials.length > 0 && <div className="student-materials"><h4>Learning materials</h4>{module.materials.map((material) => <a key={material.id} href={material.resourceUrl} target="_blank" rel="noreferrer"><b>{material.materialType === "video" ? "▶" : "↗"}</b><span>{material.title}<small>{material.originalName || material.materialType}</small></span></a>)}</div>}{module.assignments.map((assignment) => <section className="student-assignment" key={assignment.id}><div className="assignment-title"><div><span>Assignment</span><h4>{assignment.title}</h4></div><b className={`work-status ${assignment.submissionStatus || "not-started"}`}>{submissionLabel(assignment.submissionStatus)}</b></div><p>{assignment.instructions}</p><small>Due {new Date(assignment.dueAt).toLocaleString()} · {assignment.maxScore} points</small>{assignment.isLate ? <b className="late-flag">Submitted late</b> : null}{assignment.feedback && <div className="mentor-feedback"><b>Mentor feedback</b><p>{assignment.feedback}</p>{assignment.score != null && <strong>Score: {assignment.score}/{assignment.maxScore}</strong>}</div>}<form onSubmit={(event) => submitAssignment(event, assignment.id)}><label>GitHub or project link<input name="submissionUrl" type="url" defaultValue={assignment.submissionUrl || ""} placeholder="https://github.com/…" required /></label><label>Note to your mentor<textarea name="note" rows="2" defaultValue={assignment.submissionNote || ""} /></label><button className="button primary">{assignment.submissionId ? "Resubmit assignment" : "Submit assignment"}</button></form></section>)}</article>)}</div>}</section>
  );
}

function StudentDashboard({ user, logout }) {
  const [active, setActive] = useState("Overview");
  const [learningProgress, setLearningProgress] = useState({ completed: 0, total: 0, percentage: 0 });
  useEffect(() => {
    api("/student/learning").then((data) => setLearningProgress(data.progress)).catch(() => {});
  }, []);
  return (
    <main className="dashboard">
      <Sidebar
        role="student"
        active={active}
        onSelect={setActive}
        logout={logout}
      />
      <section className="dash-main">
        <div className="dash-title">
          <div>
            <p className="eyebrow">DevOps student portal</p>
            <h1>Welcome, {user.fullName.split(" ")[0]}.</h1>
          </div>
          <span className="avatar">{user.fullName[0]}</span>
        </div>
        {active === "Overview" && (
          <>
            <div className="notice">
              <strong>✓ Your account is approved</strong>
              <p>
                You now have access to the Livingworth Academy learning portal.
              </p>
            </div>
            <div className="dash-grid">
              <article>
                <span>Current programme</span>
                <h3>12-Week DevOps Bootcamp</h3>
                <p>
                  Linux, Git, AWS, IaC, containers, Kubernetes, CI/CD and
                  monitoring.
                </p>
              </article>
              <article>
                <span>Weekly schedule</span>
                <h3>Mon · Wed · Fri</h3>
                <p>Live on Google Meet, 8:00–9:00 p.m. GMT+1.</p>
              </article>
              <article>
                <span>Completion path</span>
                <h3>{learningProgress.percentage}% complete</h3>
                <p>
                  {learningProgress.completed} of {learningProgress.total} assignments completed.
                </p>
              </article>
            </div>
          </>
        )}
        {active === "Programme" && (
          <section className="portal-path">
            <p className="eyebrow">Your learning path</p>
            <h2>From foundations to production</h2>
            <div>
              {[
                "DevOps & SDLC",
                "Linux & Bash",
                "Git & GitHub",
                "AWS",
                "Ansible",
                "Terraform",
                "Docker",
                "Kubernetes",
                "CI/CD",
                "Monitoring",
                "Capstone",
              ].map((x, i) => (
                <span key={x}>
                  <b>{i + 1}</b>
                  {x}
                </span>
              ))}
            </div>
          </section>
        )}
        {active === "Attendance" && <AttendanceCenter mode="student" />}
        {active === "Learning" && <LearningCenter mode="student" />}
        {active === "Live quiz" && <QuizCenter mode="student" />}
      </section>
    </main>
  );
}

function QuizCenter({ mode, demo = false }) {
  const [socket, setSocket] = useState(null),
    [message, setMessage] = useState(""),
    [quizzes, setQuizzes] = useState([]),
    [room, setRoom] = useState(null),
    [presence, setPresence] = useState(0),
    [question, setQuestion] = useState(null),
    [seconds, setSeconds] = useState(30),
    [submitted, setSubmitted] = useState(false),
    [reveal, setReveal] = useState(null),
    [leaderboard, setLeaderboard] = useState([]);
  const [title, setTitle] = useState("DevOps Knowledge Check");
  const [questions, setQuestions] = useState([
    { prompt: "", options: ["", "", "", ""], correctIndex: 0 },
  ]);
  const load = () =>
    api(mode === "admin" ? "/admin/quizzes" : "/quizzes/active")
      .then(setQuizzes)
      .catch((e) => setMessage(e.message));
  useEffect(() => {
    if (demo) {
      setMessage("Connect the backend to host a synchronized live quiz.");
      return;
    }
    load();
    const s = io({
      auth: { token: localStorage.getItem("lw_token") },
      autoConnect: true,
    });
    setSocket(s);
    s.on("connect_error", () => setMessage("Live quiz server is unavailable."));
    s.on("quiz:presence", (d) => setPresence(d.count));
    s.on("quiz:started", () => setMessage("Quiz started."));
    s.on("quiz:question", (q) => {
      setQuestion(q);
      setReveal(null);
      setSubmitted(false);
      setSeconds(Math.max(0, Math.ceil((q.endsAt - Date.now()) / 1000)));
    });
    s.on("quiz:reveal", (d) => {
      setReveal(d.correctIndex);
      setLeaderboard(d.leaderboard);
    });
    s.on("quiz:completed", (d) => {
      setQuestion(null);
      setLeaderboard(d.leaderboard);
      setMessage("Quiz completed. Final leaderboard is ready.");
    });
    return () => s.disconnect();
  }, [mode, demo]);
  useEffect(() => {
    if (!question || reveal !== null) return;
    const timer = setInterval(
      () =>
        setSeconds(
          Math.max(0, Math.ceil((question.endsAt - Date.now()) / 1000)),
        ),
      250,
    );
    return () => clearInterval(timer);
  }, [question, reveal]);
  function join(joinCode) {
    socket?.emit("quiz:join", { joinCode }, (result) => {
      if (result.ok) {
        setRoom(result.quiz);
        setMessage(
          `Joined ${result.quiz.title}. Waiting for the quiz to start.`,
        );
      } else setMessage(result.message);
    });
  }
  function start() {
    socket?.emit("quiz:start", { quizId: room.id }, (result) =>
      setMessage(result.ok ? "Starting now…" : result.message),
    );
  }
  function answer(answerIndex) {
    if (submitted || seconds <= 0) return;
    socket.emit(
      "quiz:answer",
      { quizId: room.id, questionId: question.id, answerIndex },
      (result) => {
        setSubmitted(result.ok);
        setMessage(result.ok ? "Answer locked in." : result.message);
      },
    );
  }
  function updateQuestion(qi, field, value, oi) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i !== qi
          ? q
          : oi === undefined
            ? { ...q, [field]: value }
            : {
                ...q,
                options: q.options.map((o, j) => (j === oi ? value : o)),
              },
      ),
    );
  }
  async function createManual(e) {
    e.preventDefault();
    try {
      const quiz = await api("/admin/quizzes", {
        method: "POST",
        body: JSON.stringify({ title, questions }),
      });
      setMessage(`Quiz created. Join code: ${quiz.joinCode}`);
      load();
    } catch (err) {
      setMessage(err.message);
    }
  }
  async function importCsv(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const quiz = await api(
        `/admin/quizzes/import?title=${encodeURIComponent(title)}`,
        { method: "POST", headers: { "Content-Type": "text/csv" }, body: text },
      );
      setMessage(`CSV imported. Join code: ${quiz.joinCode}`);
      load();
    } catch (err) {
      setMessage(err.message);
    }
  }
  if (demo)
    return (
      <section className="quiz-center">
        <p className="eyebrow">Live quiz</p>
        <h2>Real-time quiz control</h2>
        <div className="quiz-callout">
          Live synchronization needs the Node/Express backend. The offline admin
          preview cannot broadcast questions to students.
        </div>
      </section>
    );
  return (
    <section className="quiz-center">
      <div className="quiz-heading">
        <div>
          <p className="eyebrow">Live DevOps quiz</p>
          <h2>
            {mode === "admin"
              ? "Create, host and score in real time"
              : "Join your class quiz"}
          </h2>
        </div>
        <span className="timer-badge">30 sec / question</span>
      </div>
      <p className="form-message">{message}</p>
      {!room && mode === "student" && (
        <div className="join-room">
          <input id="quiz-code" placeholder="Enter quiz code" maxLength="8" />
          <button
            className="button primary"
            onClick={() => join(document.getElementById("quiz-code").value)}
          >
            Join live quiz
          </button>
          {quizzes.length > 0 && (
            <div className="active-quizzes">
              Active:{" "}
              {quizzes.map((q) => (
                <button key={q.id} onClick={() => join(q.joinCode)}>
                  {q.title} · {q.joinCode}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {!room && mode === "admin" && (
        <div className="quiz-admin-grid">
          <form className="quiz-builder" onSubmit={createManual}>
            <label>
              Quiz title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </label>
            {questions.map((q, qi) => (
              <fieldset key={qi}>
                <legend>Question {qi + 1}</legend>
                <input
                  placeholder="Question"
                  value={q.prompt}
                  onChange={(e) => updateQuestion(qi, "prompt", e.target.value)}
                  required
                />
                {q.options.map((o, oi) => (
                  <label className="option-edit" key={oi}>
                    <input
                      type="radio"
                      name={`correct-${qi}`}
                      checked={q.correctIndex === oi}
                      onChange={() => updateQuestion(qi, "correctIndex", oi)}
                    />
                    <input
                      placeholder={`Option ${oi + 1}`}
                      value={o}
                      onChange={(e) =>
                        updateQuestion(qi, "options", e.target.value, oi)
                      }
                      required
                    />
                  </label>
                ))}
              </fieldset>
            ))}
            <div className="builder-actions">
              <button
                type="button"
                className="button light-border"
                onClick={() =>
                  setQuestions([
                    ...questions,
                    { prompt: "", options: ["", "", "", ""], correctIndex: 0 },
                  ])
                }
              >
                + Add question
              </button>
              <button className="button primary">Save quiz</button>
            </div>
          </form>
          <div className="csv-import">
            <h3>Import questions from CSV</h3>
            <p>
              Columns: question, option 1, option 2, option 3, option 4, correct
              answer number.
            </p>
            <pre>question,option1,option2,option3,option4,correctAnswer</pre>
            <label className="button light-border file-button">
              Choose CSV
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => importCsv(e.target.files[0])}
              />
            </label>
          </div>
        </div>
      )}
      {!room && mode === "admin" && quizzes.length > 0 && (
        <div className="quiz-list">
          <h3>Your quizzes</h3>
          {quizzes.map((q) => (
            <article key={q.id}>
              <div>
                <b>{q.title}</b>
                <span>
                  {q.questionCount} questions · Code {q.joinCode}
                </span>
              </div>
              <button
                className="button primary"
                onClick={() => join(q.joinCode)}
              >
                Open lobby
              </button>
            </article>
          ))}
        </div>
      )}
      {room && !question && (
        <div className="quiz-lobby">
          <span className="live-dot">● LIVE ROOM</span>
          <h3>{room.title}</h3>
          <strong>{room.joinCode}</strong>
          <p>
            {presence} connected participant{presence === 1 ? "" : "s"}
          </p>
          {mode === "admin" ? (
            <button className="button gold" onClick={start}>
              Start quiz for everyone
            </button>
          ) : (
            <p>Waiting for your instructor to start…</p>
          )}
        </div>
      )}
      {room && question && (
        <div className="question-stage">
          <div className={`countdown ${seconds <= 5 ? "danger" : ""}`}>
            {seconds}
          </div>
          <p>
            Question {question.index + 1} of {question.total}
          </p>
          <h3>{question.prompt}</h3>
          <div className="answer-grid">
            {question.options.map((o, i) => (
              <button
                key={i}
                disabled={submitted || seconds <= 0}
                className={`${submitted ? "locked" : ""} ${reveal === i ? "correct" : ""}`}
                onClick={() => answer(i)}
              >
                <b>{String.fromCharCode(65 + i)}</b>
                {o}
              </button>
            ))}
          </div>
          <p>
            {submitted
              ? "Answer submitted."
              : seconds === 0
                ? "Time is up."
                : "Choose one answer."}
          </p>
        </div>
      )}
      {leaderboard.length > 0 && (
        <div className="leaderboard">
          <h3>Leaderboard</h3>
          {leaderboard.map((p, i) => (
            <div key={p.studentId}>
              <b>#{i + 1}</b>
              <span>{p.fullName}</span>
              <strong>{p.score}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AdminDashboard({ user, logout }) {
  const savedDemo = () =>
    JSON.parse(localStorage.getItem("lw_demo_students") || "null") ||
    demoStudents;
  const [active, setActive] = useState("Overview");
  const [students, setStudents] = useState(user.demo ? savedDemo() : []);
  const [mentors, setMentors] = useState([]);
  const [applicationSummary, setApplicationSummary] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedApplicant, setSelectedApplicant] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [message, setMessage] = useState(
    user.demo
      ? "Offline preview: changes are stored only in this browser."
      : "",
  );
  const loadApplications = () => {
    if (user.demo) {
      const all = savedDemo();
      const filtered = all.filter(
        (student) =>
          (!statusFilter || student.status === statusFilter) &&
          (!search || `${student.fullName} ${student.email} ${student.phone}`.toLowerCase().includes(search.toLowerCase())),
      );
      setStudents(filtered);
      setApplicationSummary({
        total: all.length,
        pending: all.filter((student) => student.status === "pending").length,
        approved: all.filter((student) => student.status === "approved").length,
        rejected: all.filter((student) => student.status === "rejected").length,
      });
      setPagination({ page: 1, pages: 1, total: filtered.length });
      return;
    }
    const params = new URLSearchParams({ page: String(page) });
    if (statusFilter) params.set("status", statusFilter);
    if (search) params.set("search", search);
    api(`/admin/students?${params}`)
      .then((data) => {
        setStudents(data.students);
        setApplicationSummary(data.summary);
        setPagination(data.pagination);
      })
      .catch((e) => setMessage(e.message));
  };
  useEffect(loadApplications, [page, statusFilter, search]);
  useEffect(() => {
    if (!user.demo) api("/admin/mentors").then(setMentors).catch((e) => setMessage(e.message));
  }, []);
  async function decide(student, status, reason = "") {
    if (user.demo) {
      const all = savedDemo();
      const next = all.map((s) => (s.id === student.id ? { ...s, status, rejectionReason: reason } : s));
      localStorage.setItem("lw_demo_students", JSON.stringify(next));
      setMessage(`Demo student ${status}. This change is local only.`);
      setSelectedApplicant(null);
      loadApplications();
      return;
    }
    try {
      const data = await api(`/admin/students/${student.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, rejectionReason: reason }),
      });
      setMessage(data.message);
      setSelectedApplicant(null);
      setRejectionReason("");
      loadApplications();
    } catch (e) {
      setMessage(e.message);
    }
  }
  function confirmDecision(student, status) {
    const action = status === "approved" ? "approve" : "return to pending review";
    if (window.confirm(`Are you sure you want to ${action} ${student.fullName}?`)) {
      decide(student, status);
    }
  }
  async function exportApplications() {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("search", search);
      const response = await fetch(`/api/admin/students/export?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("lw_token")}` },
      });
      if (!response.ok) throw new Error("Could not export applications.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `livingworth-applications-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error.message);
    }
  }
  async function addMentor(e) {
    e.preventDefault();
    try {
      const data = await api("/admin/mentors", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
      });
      setMessage(data.message);
      e.currentTarget.reset();
      api("/admin/mentors").then(setMentors);
    } catch (err) {
      setMessage(err.message);
    }
  }
  const applications = (
    <section className="application-manager">
      <div className="application-metrics">
        {[
          ["All", applicationSummary.total, ""],
          ["Pending", applicationSummary.pending, "pending"],
          ["Approved", applicationSummary.approved, "approved"],
          ["Rejected", applicationSummary.rejected, "rejected"],
        ].map(([label, count, value]) => (
          <button
            key={label}
            className={statusFilter === value ? "active" : ""}
            onClick={() => { setStatusFilter(value); setPage(1); }}
          >
            <span>{label}</span><strong>{count}</strong>
          </button>
        ))}
      </div>
      <div className="application-toolbar">
        <form onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); setPage(1); }}>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search name, email or phone"
            aria-label="Search applications"
          />
          <button className="button primary">Search</button>
          {search && <button type="button" className="text-btn" onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}>Clear</button>}
        </form>
        <button className="button light-border" onClick={exportApplications} disabled={user.demo}>
          Export CSV
        </button>
      </div>
      <div className="student-list application-list">
        {students.length === 0 ? (
          <div className="empty">No applications match this view.</div>
        ) : students.map((student) => (
          <article key={student.id}>
            <span className="student-avatar">{student.fullName[0]}</span>
            <div className="student-info">
              <h3>{student.fullName}</h3>
              <p>{student.email} · {student.phone || "No phone"}</p>
              <small>{student.courseChoice || "DevOps Engineering"} · Applied {student.createdAt ? new Date(student.createdAt).toLocaleDateString() : "recently"}</small>
            </div>
            <b className={`status ${student.status}`}>{student.status}</b>
            <button className="profile-button" onClick={() => { setSelectedApplicant(student); setRejectionReason(student.rejectionReason || ""); }}>
              View application
            </button>
          </article>
        ))}
      </div>
      {pagination.pages > 1 && (
        <nav className="application-pagination" aria-label="Application pages">
          <button disabled={pagination.page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
          <span>Page {pagination.page} of {pagination.pages}</span>
          <button disabled={pagination.page === pagination.pages} onClick={() => setPage((value) => value + 1)}>Next</button>
        </nav>
      )}
      {selectedApplicant && (
        <div className="applicant-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedApplicant(null); }}>
          <section className="applicant-panel" role="dialog" aria-modal="true" aria-labelledby="applicant-name">
            <div className="applicant-panel-head">
              <div><p className="eyebrow">Student application</p><h2 id="applicant-name">{selectedApplicant.fullName}</h2></div>
              <button aria-label="Close application" onClick={() => setSelectedApplicant(null)}>×</button>
            </div>
            <b className={`status ${selectedApplicant.status}`}>{selectedApplicant.status}</b>
            <div className="applicant-profile">
              {[
                ["Email", selectedApplicant.email], ["Phone", selectedApplicant.phone],
                ["Gender", selectedApplicant.gender], ["Location", [selectedApplicant.stateCity, selectedApplicant.country].filter(Boolean).join(", ")],
                ["Employment/Study", selectedApplicant.employmentStatus], ["Education", selectedApplicant.educationalLevel],
                ["Course", selectedApplicant.courseChoice], ["Learning mode", selectedApplicant.learningMode],
                ["Tech experience", selectedApplicant.techExperience], ["Applied", selectedApplicant.createdAt ? new Date(selectedApplicant.createdAt).toLocaleString() : "—"],
              ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value || "—"}</strong></div>)}
            </div>
            {selectedApplicant.rejectionReason && selectedApplicant.status === "rejected" && (
              <div className="rejection-record"><b>Rejection reason</b><p>{selectedApplicant.rejectionReason}</p></div>
            )}
            {selectedApplicant.status === "pending" ? (
              <div className="applicant-decisions">
                <button className="button approve-button" onClick={() => confirmDecision(selectedApplicant, "approved")}>Approve application</button>
                <label>Reason for rejection<textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength="500" placeholder="Explain why this application is not being approved." /></label>
                <button className="button reject-button" disabled={!rejectionReason.trim()} onClick={() => { if (window.confirm(`Reject ${selectedApplicant.fullName}'s application?`)) decide(selectedApplicant, "rejected", rejectionReason); }}>Reject application</button>
              </div>
            ) : (
              <button className="button light-border full" onClick={() => confirmDecision(selectedApplicant, "pending")}>Return to pending review</button>
            )}
          </section>
        </div>
      )}
    </section>
  );
  return (
    <main className="dashboard">
      <Sidebar
        role="admin"
        active={active}
        onSelect={setActive}
        logout={logout}
      />
      <section className="dash-main">
        <div className="dash-title">
          <div>
            <p className="eyebrow">
              Administrator portal {user.demo && "· Offline preview"}
            </p>
            <h1>{active}</h1>
            <p>Manage people, access and live learning from one place.</p>
          </div>
          <span className="avatar">{user.fullName[0]}</span>
        </div>
        {user.demo && (
          <div className="demo-banner">
            <b>Offline demo mode</b>
            <span>
              These sample records and approvals exist only in this browser.
            </span>
          </div>
        )}
        <p className="form-message success">{message}</p>
        {active === "Overview" && (
          <>
            <div className="metrics">
              <article>
                <span>Pending applications</span>
                <strong>{applicationSummary.pending}</strong>
              </article>
              <article>
                <span>Approved students</span>
                <strong>{applicationSummary.approved}</strong>
              </article>
              <article>
                <span>Active mentors</span>
                <strong>{user.demo ? "—" : mentors.length}</strong>
              </article>
            </div>
            <section className="admin-summary">
              <h2>Academy control centre</h2>
              <p>
                Review new applications, create mentor access and run
                synchronized classroom quizzes from the navigation.
              </p>
            </section>
          </>
        )}
        {active === "Applications" && applications}
        {active === "Mentors" &&
          (user.demo ? (
            <div className="empty">
              Connect the backend to manage mentor accounts.
            </div>
          ) : (
            <div className="mentor-admin">
              <form className="form" onSubmit={addMentor}>
                <h2>Add a mentor</h2>
                <label>
                  Full name
                  <input name="fullName" required />
                </label>
                <label>
                  Email address
                  <input name="email" type="email" required />
                </label>
                <label>
                  Phone number
                  <input name="phone" />
                </label>
                <label>
                  Temporary password
                  <input
                    name="password"
                    type="password"
                    minLength="8"
                    required
                  />
                </label>
                <button className="button primary">
                  Create mentor account
                </button>
              </form>
              <div className="student-list">
                <h2>Mentor team</h2>
                {mentors.length === 0 ? (
                  <div className="empty">No mentors added yet.</div>
                ) : (
                  mentors.map((m) => (
                    <article key={m.id}>
                      <span className="student-avatar">{m.fullName[0]}</span>
                      <div className="student-info">
                        <h3>{m.fullName}</h3>
                        <p>
                          {m.email} · {m.phone || "No phone"}
                        </p>
                      </div>
                      <b className="status approved">active</b>
                    </article>
                  ))
                )}
              </div>
            </div>
          ))}
        {active === "Attendance" && (
          <AttendanceCenter mode="staff" demo={user.demo} />
        )}{" "}
        {active === "Learning" && <LearningCenter mode="staff" demo={user.demo} />}
        {active === "Live quiz" && <QuizCenter mode="admin" demo={user.demo} />}
      </section>
    </main>
  );
}

function MentorDashboard({ user, logout }) {
  const [active, setActive] = useState("Overview"),
    [students, setStudents] = useState([]),
    [message, setMessage] = useState("");
  useEffect(() => {
    api("/staff/students")
      .then(setStudents)
      .catch((e) => setMessage(e.message));
  }, []);
  return (
    <main className="dashboard">
      <Sidebar
        role="mentor"
        active={active}
        onSelect={setActive}
        logout={logout}
      />
      <section className="dash-main">
        <div className="dash-title">
          <div>
            <p className="eyebrow">Mentor portal</p>
            <h1>Welcome, {user.fullName.split(" ")[0]}.</h1>
            <p>Guide the cohort and keep every learner moving forward.</p>
          </div>
          <span className="avatar">{user.fullName[0]}</span>
        </div>
        <p className="form-message">{message}</p>
        {active === "Overview" && (
          <>
            <div className="metrics">
              <article>
                <span>Approved learners</span>
                <strong>{students.length}</strong>
              </article>
              <article>
                <span>Live teaching days</span>
                <strong>3</strong>
              </article>
              <article>
                <span>Programme weeks</span>
                <strong>12</strong>
              </article>
            </div>
            <div className="notice">
              <strong>Next teaching rhythm</strong>
              <p>
                Monday orientation · Wednesday review · Friday practical class,
                8:00–9:00 p.m. GMT+1.
              </p>
            </div>
          </>
        )}
        {active === "Learners" && (
          <div className="student-list">
            {students.length === 0 ? (
              <div className="empty">No approved learners yet.</div>
            ) : (
              students.map((s) => (
                <article key={s.id}>
                  <span className="student-avatar">{s.fullName[0]}</span>
                  <div className="student-info">
                    <h3>{s.fullName}</h3>
                    <p>
                      {s.email} · {s.phone || "No phone"}
                    </p>
                    <small>
                      {s.experienceLevel} — {s.learningGoal}
                    </small>
                  </div>
                  <b className="status approved">approved</b>
                </article>
              ))
            )}
          </div>
        )}
        {active === "Attendance" && <AttendanceCenter mode="staff" />}
        {active === "Learning" && <LearningCenter mode="staff" />}
        {active === "Live quiz" && <QuizCenter mode="admin" />}
      </section>
    </main>
  );
}

export default function App() {
  const [page, setPage] = useState("home");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = (p) => {
    setPage(p);
    scrollTo(0, 0);
  };
  const onLogin = (u) => {
    setUser(u);
    setPage("dashboard");
  };
  const logout = () => {
    localStorage.removeItem("lw_token");
    localStorage.removeItem("lw_demo_admin");
    setUser(null);
    setPage("home");
  };
  useEffect(() => {
    if (localStorage.getItem("lw_demo_admin")) {
      setUser({
        id: "demo-admin",
        fullName: "Livingworth Administrator",
        email: "admin@livingworthacademy.com",
        role: "admin",
        status: "approved",
        demo: true,
      });
      setPage("dashboard");
      setLoading(false);
      return;
    }
    const token = localStorage.getItem("lw_token");
    if (token)
      api("/auth/me")
        .then((u) => {
          setUser(u);
          setPage("dashboard");
        })
        .catch(() => localStorage.removeItem("lw_token"))
        .finally(() => setLoading(false));
    else setLoading(false);
  }, []);
  if (loading)
    return <div className="loading">Loading Livingworth Academy…</div>;
  if (page === "register") return <Register navigate={navigate} />;
  if (page === "student-login")
    return <Login portal="student" navigate={navigate} onLogin={onLogin} />;
  if (page === "mentor-login")
    return <Login portal="mentor" navigate={navigate} onLogin={onLogin} />;
  if (page === "admin-login")
    return <Login portal="admin" navigate={navigate} onLogin={onLogin} />;
  if (page === "dashboard" && user) {
    if (user.role === "admin")
      return <AdminDashboard user={user} logout={logout} />;
    if (user.role === "mentor")
      return <MentorDashboard user={user} logout={logout} />;
    return <StudentDashboard user={user} logout={logout} />;
  }
  return <Home navigate={navigate} />;
}
