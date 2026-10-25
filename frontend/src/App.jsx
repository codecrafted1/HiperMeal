
import { useRef, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  Clock3,
  Flame,
  Home,
  Leaf,
  Menu,
  Plus,
  Salad,
  Settings,
  Sparkles,
  Target,
  Upload,
  Utensils,
  X,
  Wheat,
} from "lucide-react";
import "./App.css";

const nutritionItems = [
  { name: "Protein", icon: Activity, color: "green" },
  { name: "Carbohydrates", icon: Wheat, color: "yellow" },
  { name: "Healthy fats", icon: Leaf, color: "orange" },
];



function App() {
  const [image, setImage] = useState(null);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const fileInput = useRef(null);

  function handleImage(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;

    if (!selected.type.startsWith("image/")) {
      alert("Please select an image file.");
      return;
    }

    if (image) URL.revokeObjectURL(image);

    setFile(selected);
    setImage(URL.createObjectURL(selected));
    setMessage("");
  }

  function resetImage() {
    if (image) URL.revokeObjectURL(image);
    setImage(null);
    setFile(null);
    setMessage("");
    if (fileInput.current) fileInput.current.value = "";
  }

  async function analyzeMeal() {
    if (!file) return;

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("http://127.0.0.1:8000/health");

      if (!response.ok) throw new Error("Backend unavailable");

      setMessage(
        "Backend connected successfully. Food recognition and nutrition calculations are not connected yet."
      );
    } catch {
      setMessage(
        "Could not connect to the backend. Make sure your server is running on port 8000."
      );
    } finally {
      setLoading(false);
    }
  }

  const navItems = [
    { label: "Overview", icon: Home, active: true },
    { label: "Meal diary", icon: Utensils },
    { label: "Nutrition insights", icon: BarChart3 },
  ];

  return (
    <main className="dashboard-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <a className="brand" href="/">
          <span className="brand-mark"><Leaf size={23} /></span>
          <span>hiper<span className="brand-highlight">meal</span><i>.</i></span>
        </a>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="side-nav">
          {navItems.map(({ label, icon: Icon, active }) => (
            <button
              key={label}
              className={`nav-item ${active ? "active" : ""}`}
              onClick={() => {
                if (label !== "Overview") {
                  setMessage(
                    `${label} will be available when meal history and nutrition analysis are implemented.`
                  );
                } else {
                  setMessage("");
                }
                setSidebarOpen(false);
              }}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
              {active && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-divider" />

        <div className="workspace-label">PREFERENCES</div>
        <button className="nav-item" onClick={() => setMessage("Settings are coming soon.")}>
          <Settings size={19} strokeWidth={1.8} />
          <span>Settings</span>
        </button>

        <div className="sidebar-spacer" />

        <div className="sidebar-tip">
          <div className="tip-icon"><Sparkles size={18} /></div>
          <p className="tip-title">Small steps, big changes.</p>
          <p className="tip-copy">
            Build a healthier relationship with the food you love.
          </p>
          <div className="tip-decoration"><Leaf size={49} /></div>
        </div>

        <div className="profile-row">
          <div className="avatar">H</div>
          <div className="profile-info">
            <strong>Healthy beginnings</strong>
            <span>Your personal space</span>
          </div>
          <ChevronDown size={16} />
        </div>
      </aside>

      {sidebarOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <section className="main-area">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle navigation"
          >
            <Menu size={21} />
          </button>

          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="breadcrumb-slash">/</span>
            <strong>Overview</strong>
          </div>

          <div className="topbar-right">
            <div className="date-chip">
              <CalendarDays size={16} />
              <span>
                {new Date().toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
            <button
              className="icon-button notification-button"
              aria-label="Notifications"
              onClick={() => setMessage("You're all caught up!")}
            >
              <Bell size={19} />
              <span className="notification-dot" />
            </button>
          </div>
        </header>

        <div className="dashboard-content">
          <section className="welcome-row">
            <div>
              <div className="welcome-eyebrow">
                <span className="status-dot" />
                YOUR DAILY NUTRITION SPACE
              </div>
              <h1>A little better, <span>every day.</span></h1>
              <p className="welcome-copy">
                Your food, your habits, your journey. Let's make it count.
              </p>
            </div>

            <div className="streak-chip">
              <span className="streak-icon"><Flame size={20} /></span>
              <div>
                <strong>Fresh start</strong>
                <span>Your journey begins here</span>
              </div>
            </div>
          </section>

          <section className="summary-grid">
            <article className="summary-card featured-summary">
              <div className="summary-card-top">
                <span className="summary-icon"><Flame size={19} /></span>
                <span className="summary-label">DAILY CALORIES</span>
                <span className="summary-trend"><Activity size={14} /></span>
              </div>
              <div className="summary-value">— <span>kcal</span></div>
              <p className="summary-note">Waiting for your first meal</p>
              <div className="mini-track"><span /></div>
              <div className="summary-bottom">
                <span>Consumed</span>
                <span>Not calculated yet</span>
              </div>
            </article>

            <article className="summary-card">
              <div className="summary-card-top">
                <span className="summary-icon protein-icon"><Activity size={19} /></span>
                <span className="summary-label">PROTEIN</span>
              </div>
              <div className="summary-value">— <span>g</span></div>
              <p className="summary-note">Your protein intake</p>
              <div className="mini-track track-green"><span /></div>
              <div className="summary-bottom">
                <span>Daily progress</span><span>—</span>
              </div>
            </article>

            <article className="summary-card">
              <div className="summary-card-top">
                <span className="summary-icon carbs-icon"><Target size={19} /></span>
                <span className="summary-label">MEALS LOGGED</span>
              </div>
              <div className="summary-value">0 <span>meals</span></div>
              <p className="summary-note">Your diary starts with a photo</p>
              <div className="summary-bottom summary-bottom-spaced">
                <span className="tiny-tag"><Plus size={12} /> Add your first meal</span>
              </div>
            </article>
          </section>

          <section className="section-heading">
            <div>
              <span className="section-kicker">YOUR FOOD DIARY</span>
              <h2>Today's overview</h2>
            </div>
            <span className="today-label"><Clock3 size={15} /> Live workspace</span>
          </section>

          <section className="content-grid">
            <article className="upload-card">
              <div className="upload-card-heading">
                <div>
                  <span className="step-label">01 / MEAL CAPTURE</span>
                  <h3>What's on your plate?</h3>
                  <p>One photo is all it takes to get started.</p>
                </div>
                <div className="camera-bubble"><Camera size={22} /></div>
              </div>

              <label
                className={`dropzone ${image ? "dropzone-filled" : ""}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const dropped = event.dataTransfer.files?.[0];
                  if (dropped) handleImage({ target: { files: [dropped] } });
                }}
              >
                {image ? (
                  <>
                    <img src={image} className="meal-preview" alt="Selected meal" />
                    <span className="image-overlay-label">
                      <Check size={15} /> Photo ready
                    </span>
                  </>
                ) : (
                  <div className="dropzone-content">
                    <div className="upload-illustration">
                      <div className="illustration-ring"><Salad size={34} /></div>
                      <span className="illustration-plus"><Plus size={15} /></span>
                    </div>
                    <strong>Drop your meal photo here</strong>
                    <span className="dropzone-subtext">or browse files from your device</span>
                    <span className="browse-pill"><Upload size={14} /> Choose a photo</span>
                    <span className="file-hint">JPG, PNG or WEBP · Image files only</span>
                  </div>
                )}

                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  onChange={handleImage}
                  hidden
                />
              </label>

              {image && (
                <div className="selected-file-row">
                  <div className="file-thumbnail"><Camera size={16} /></div>
                  <div className="file-details">
                    <strong>{file?.name}</strong>
                    <span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : ""}</span>
                  </div>
                  <button
                    className="remove-button"
                    onClick={resetImage}
                    aria-label="Remove selected photo"
                  >
                    <X size={17} />
                  </button>
                </div>
              )}

              <button
                className="analyze-button"
                disabled={!file || loading}
                onClick={analyzeMeal}
              >
                {loading ? "Checking connection..." : "Continue to analysis"}
                {!loading && <ArrowUpRight size={18} />}
              </button>

              <div className="privacy-note">
                <span className="privacy-check"><Check size={12} /></span>
                Your meal photo stays in this session.
              </div>

              {message && (
                <div className="feedback-message" role="status">
                  <span>{message}</span>
                  <button onClick={() => setMessage("")} aria-label="Dismiss message">
                    <X size={15} />
                  </button>
                </div>
              )}
            </article>

            <div className="right-column">
              <article className="nutrition-card">
                <div className="card-heading-row">
                  <div>
                    <span className="step-label">02 / NUTRITION</span>
                    <h3>Your nutrition balance</h3>
                  </div>
                  <span className="subtle-icon"><BarChart3 size={19} /></span>
                </div>

                <div className="calorie-visual">
                  <div className="calorie-ring">
                    <svg viewBox="0 0 160 160" className="ring-svg" aria-label="Calorie progress not yet available">
                      <circle cx="80" cy="80" r="65" className="ring-track" />
                      <circle cx="80" cy="80" r="65" className="ring-progress" />
                    </svg>
                    <div className="ring-center">
                      <span className="ring-flame"><Flame size={21} /></span>
                      <strong>—</strong>
                      <span>kcal logged</span>
                    </div>
                  </div>
                  <div className="calorie-copy">
                    <span className="calorie-status"><span /> READY WHEN YOU ARE</span>
                    <h4>Every meal<br />tells a story.</h4>
                    <p>Log your first meal to see its nutritional breakdown.</p>
                  </div>
                </div>

                <div className="macro-list">
                  {nutritionItems.map(({ name, icon: Icon, color }) => (
                    <div className="macro-row" key={name}>
                      <span className={`macro-icon ${color}`}><Icon size={15} /></span>
                      <span className="macro-name">{name}</span>
                      <div className="macro-track"><span className={color} /></div>
                      <span className="macro-value">— g</span>
                    </div>
                  ))}
                </div>

                <div className="nutrition-footnote">
                  <Sparkles size={15} />
                  Nutrition estimates appear after food analysis is connected.
                </div>
              </article>

              <article className="recent-card">
                <div className="card-heading-row">
                  <div>
                    <span className="step-label">YOUR HISTORY</span>
                    <h3>Recent meals</h3>
                  </div>
                  <span className="meal-count">0 logged</span>
                </div>

                <div className="recent-empty">
                  <div className="recent-empty-icon"><Utensils size={21} /></div>
                  <div>
                    <strong>A fresh page</strong>
                    <p>Your logged meals will show up here.</p>
                  </div>
                  <ArrowDownRight size={17} className="recent-arrow" />
                </div>
              </article>
            </div>
          </section>

          <section className="bottom-note">
            <div className="bottom-note-icon"><Leaf size={20} /></div>
            <div>
              <strong>Healthy eating isn't about being perfect.</strong>
              <p>It's about understanding your food and making choices that work for you.</p>
            </div>
            <span className="bottom-note-decoration">NOURISH WELL</span>
          </section>

          <footer className="dashboard-footer">
            <span>© 2026 HiperMeal</span>
            <span>Made for a healthier everyday <Leaf size={13} /></span>
          </footer>
        </div>
      </section>
    </main>
  );
}

export default App;
