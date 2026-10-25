
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Trash2,
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

// Local dev talks to uvicorn directly; the DigitalOcean build sets VITE_API_URL=/api
const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

// Generic reference values for the progress bars only (not personalised advice).
const REFERENCE = { calories: 2000, protein: 50, carbs: 275, fat: 70 };

const STORAGE_KEY = "hipermeal.meals.v1";

const nutritionItems = [
  { key: "protein", name: "Protein", icon: Activity, color: "green" },
  { key: "carbs", name: "Carbohydrates", icon: Wheat, color: "yellow" },
  { key: "fat", name: "Fats", icon: Leaf, color: "orange" },
];

const ZERO = { calories: 0, protein: 0, carbs: 0, fat: 0 };

function sumItems(items) {
  return items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.nutrition.calories,
      protein: acc.protein + item.nutrition.protein,
      carbs: acc.carbs + item.nutrition.carbs,
      fat: acc.fat + item.nutrition.fat,
    }),
    { ...ZERO }
  );
}

function scaleItem(item, grams) {
  const g = Math.max(0, Number(grams) || 0);
  const nutrition = {};
  for (const k of Object.keys(ZERO)) {
    nutrition[k] = Math.round(((item.per100[k] * g) / 100) * 10) / 10;
  }
  return { ...item, grams: g, nutrition };
}

function loadMeals() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [];
  } catch {
    return [];
  }
}

const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();
const round = (n) => Math.round(n);

function App() {
  const [image, setImage] = useState(null);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [items, setItems] = useState(null); // null = nothing analysed yet
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [foodNames, setFoodNames] = useState([]);
  const [meals, setMeals] = useState(loadMeals);
  const fileInput = useRef(null);

  // Persist only the diary entries (names + macros). Photos are never stored.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(meals));
    } catch {
      /* storage unavailable - diary just won't persist */
    }
  }, [meals]);

  useEffect(() => {
    fetch(`${API_URL}/foods`)
      .then((r) => (r.ok ? r.json() : { foods: [] }))
      .then((d) => setFoodNames(d.foods ?? []))
      .catch(() => {});
  }, []);

  const draftTotals = useMemo(() => (items ? sumItems(items) : ZERO), [items]);
  const todayMeals = meals.filter((m) => isToday(m.loggedAt));
  const todayTotals = todayMeals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.totals.calories,
      protein: acc.protein + m.totals.protein,
      carbs: acc.carbs + m.totals.carbs,
      fat: acc.fat + m.totals.fat,
    }),
    { ...ZERO }
  );
  const hasToday = todayMeals.length > 0;

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
    setItems(null);
    setDescription("");
    setMessage("");
  }

  function resetImage() {
    if (image) URL.revokeObjectURL(image);
    setImage(null);
    setFile(null);
    setItems(null);
    setDescription("");
    setMessage("");
    if (fileInput.current) fileInput.current.value = "";
  }

  async function analyzeMeal() {
    if (!file) return;

    setLoading(true);
    setMessage("");

    try {
      const form = new FormData();
      form.append("image", file);
      const response = await fetch(`${API_URL}/analyze`, { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(data.detail || "Analysis failed.");

      setItems(data.items);
      setDescription(data.description || "");
      setNote(data.note || "");
      if (data.items.length === 0) {
        setMessage("No food was detected in this photo. Try a clearer, closer shot.");
      }
    } catch (err) {
      setMessage(
        err instanceof TypeError
          ? "Could not reach the server. Check that the backend is running."
          : err.message
      );
    } finally {
      setLoading(false);
    }
  }

  // ---- review / edit helpers -------------------------------------------

  function updateGrams(index, grams) {
    setItems((prev) => prev.map((it, i) => (i === index ? scaleItem(it, grams) : it)));
  }

  function renameItem(index, name) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, name } : it)));
  }

  // When the user finishes editing a name, ask the backend to re-match it
  // against the dataset so nutrition updates for the corrected food.
  async function commitName(index) {
    const target = items[index];
    if (!target?.name.trim()) return;
    try {
      const res = await fetch(`${API_URL}/nutrition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ name: target.name.trim(), grams: target.grams || 1, per100: target.per100 }],
        }),
      });
      if (!res.ok) return;
      const [fresh] = (await res.json()).items;
      setItems((prev) =>
        prev.map((it, i) => (i === index ? scaleItem({ ...fresh, name: target.name }, target.grams) : it))
      );
    } catch {
      /* keep the user's edit even if the lookup fails */
    }
  }

  function removeItem(index) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addItem() {
    setItems((prev) => [
      ...(prev ?? []),
      { name: "", grams: 100, per100: { ...ZERO }, nutrition: { ...ZERO }, source: "unknown" },
    ]);
  }

  function logMeal() {
    const clean = (items ?? []).filter((it) => it.name.trim() && it.grams > 0);
    if (clean.length === 0) return;
    const entry = {
      id: Date.now(),
      loggedAt: new Date().toISOString(),
      items: clean.map(({ name, grams, nutrition }) => ({ name, grams, nutrition })),
      totals: sumItems(clean),
    };
    setMeals((prev) => [entry, ...prev].slice(0, 100));
    resetImage();
    setMessage("Meal added to your diary.");
  }

  function deleteMeal(id) {
    setMeals((prev) => prev.filter((m) => m.id !== id));
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
              <div className="summary-value">{hasToday ? round(todayTotals.calories) : "—"} <span>kcal</span></div>
              <p className="summary-note">{hasToday ? "Estimated from today's logged meals" : "Waiting for your first meal"}</p>
              <div className="mini-track"><span style={{ width: `${Math.min(100, (todayTotals.calories / REFERENCE.calories) * 100)}%` }} /></div>
              <div className="summary-bottom">
                <span>Consumed</span>
                <span>{hasToday ? `of ${REFERENCE.calories} kcal reference` : "Not calculated yet"}</span>
              </div>
            </article>

            <article className="summary-card">
              <div className="summary-card-top">
                <span className="summary-icon protein-icon"><Activity size={19} /></span>
                <span className="summary-label">PROTEIN</span>
              </div>
              <div className="summary-value">{hasToday ? round(todayTotals.protein) : "—"} <span>g</span></div>
              <p className="summary-note">Your protein intake</p>
              <div className="mini-track track-green"><span style={{ width: `${Math.min(100, (todayTotals.protein / REFERENCE.protein) * 100)}%` }} /></div>
              <div className="summary-bottom">
                <span>Daily progress</span><span>{hasToday ? `${round((todayTotals.protein / REFERENCE.protein) * 100)}%` : "—"}</span>
              </div>
            </article>

            <article className="summary-card">
              <div className="summary-card-top">
                <span className="summary-icon carbs-icon"><Target size={19} /></span>
                <span className="summary-label">MEALS LOGGED</span>
              </div>
              <div className="summary-value">{todayMeals.length} <span>{todayMeals.length === 1 ? "meal" : "meals"}</span></div>
              <p className="summary-note">{hasToday ? "Logged today" : "Your diary starts with a photo"}</p>
              <div className="summary-bottom summary-bottom-spaced">
                <span className="tiny-tag"><Plus size={12} /> {hasToday ? "Add another meal" : "Add your first meal"}</span>
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
                {loading ? "Analysing your meal..." : "Analyse meal"}
                {!loading && <ArrowUpRight size={18} />}
              </button>

              <div className="privacy-note">
                <span className="privacy-check"><Check size={12} /></span>
                Your photo is sent once for analysis and is never saved. Only your confirmed meal is kept, on this device.
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
              {items && items.length > 0 && (
                <article className="review-card">
                  <div className="card-heading-row">
                    <div>
                      <span className="step-label">02 / REVIEW &amp; CORRECT</span>
                      <h3>Is this what you ate?</h3>
                    </div>
                  </div>

                  {description && <p className="review-description">{description}</p>}

                  <div className="review-list">
                    <div className="review-head">
                      <span>Food</span><span>Grams</span><span>kcal</span><span />
                    </div>
                    {items.map((item, index) => (
                      <div className="review-row" key={index}>
                        <input
                          className="review-name"
                          list="food-names"
                          value={item.name}
                          placeholder="Food name"
                          aria-label="Food name"
                          onChange={(e) => renameItem(index, e.target.value)}
                          onBlur={() => commitName(index)}
                        />
                        <input
                          className="review-grams"
                          type="number"
                          min="0"
                          max="5000"
                          value={item.grams}
                          aria-label={`Grams of ${item.name || "item"}`}
                          onChange={(e) => updateGrams(index, e.target.value)}
                        />
                        <span className="review-kcal">{round(item.nutrition.calories)}</span>
                        <button
                          className="remove-button"
                          onClick={() => removeItem(index)}
                          aria-label={`Remove ${item.name || "item"}`}
                        >
                          <Trash2 size={15} />
                        </button>
                        <span className="review-source">
                          {item.source === "dataset"
                            ? "Matched in nutrition dataset"
                            : item.source === "ai-estimate"
                              ? "AI estimate - not in dataset"
                              : "No nutrition data - pick a known food"}
                        </span>
                      </div>
                    ))}
                    <datalist id="food-names">
                      {foodNames.map((n) => <option key={n} value={n} />)}
                    </datalist>
                  </div>

                  <button className="add-item-button" onClick={addItem}>
                    <Plus size={14} /> Add a missing item
                  </button>

                  <div className="review-totals">
                    <div><strong>{round(draftTotals.calories)}</strong><span>kcal</span></div>
                    <div><strong>{round(draftTotals.protein)}g</strong><span>protein</span></div>
                    <div><strong>{round(draftTotals.carbs)}g</strong><span>carbs</span></div>
                    <div><strong>{round(draftTotals.fat)}g</strong><span>fat</span></div>
                  </div>

                  <p className="review-note">{note}</p>

                  <button className="analyze-button" onClick={logMeal}>
                    Confirm &amp; log meal <Check size={18} />
                  </button>
                </article>
              )}

              <article className="nutrition-card">
                <div className="card-heading-row">
                  <div>
                    <span className="step-label">{items?.length ? "03" : "02"} / NUTRITION</span>
                    <h3>Your nutrition balance</h3>
                  </div>
                  <span className="subtle-icon"><BarChart3 size={19} /></span>
                </div>

                <div className="calorie-visual">
                  <div className="calorie-ring">
                    <svg viewBox="0 0 160 160" className="ring-svg" aria-label={hasToday ? `${round(todayTotals.calories)} kcal logged today` : "No meals logged yet"}>
                      <circle cx="80" cy="80" r="65" className="ring-track" />
                      <circle
                        cx="80"
                        cy="80"
                        r="65"
                        className="ring-progress"
                        style={{ strokeDashoffset: 408.4 * (1 - Math.min(1, todayTotals.calories / REFERENCE.calories)) }}
                      />
                    </svg>
                    <div className="ring-center">
                      <span className="ring-flame"><Flame size={21} /></span>
                      <strong>{hasToday ? round(todayTotals.calories) : "—"}</strong>
                      <span>kcal logged</span>
                    </div>
                  </div>
                  <div className="calorie-copy">
                    <span className="calorie-status"><span /> {hasToday ? "TODAY SO FAR" : "READY WHEN YOU ARE"}</span>
                    <h4>Every meal<br />tells a story.</h4>
                    <p>{hasToday ? "Totals from the meals you confirmed today." : "Log your first meal to see its nutritional breakdown."}</p>
                  </div>
                </div>

                <div className="macro-list">
                  {nutritionItems.map(({ key, name, icon: Icon, color }) => (
                    <div className="macro-row" key={key}>
                      <span className={`macro-icon ${color}`}><Icon size={15} /></span>
                      <span className="macro-name">{name}</span>
                      <div className="macro-track">
                        <span className={color} style={{ width: `${Math.min(100, (todayTotals[key] / REFERENCE[key]) * 100)}%` }} />
                      </div>
                      <span className="macro-value">{hasToday ? `${round(todayTotals[key])} g` : "— g"}</span>
                    </div>
                  ))}
                </div>

                <div className="nutrition-footnote">
                  <Sparkles size={15} />
                  Estimates only, based on a photo. Bars use generic reference values and are not medical or dietary advice.
                </div>
              </article>

              <article className="recent-card">
                <div className="card-heading-row">
                  <div>
                    <span className="step-label">YOUR HISTORY</span>
                    <h3>Recent meals</h3>
                  </div>
                  <span className="meal-count">{meals.length} logged</span>
                </div>

                {meals.length === 0 ? (
                  <div className="recent-empty">
                    <div className="recent-empty-icon"><Utensils size={21} /></div>
                    <div>
                      <strong>A fresh page</strong>
                      <p>Your logged meals will show up here.</p>
                    </div>
                    <ArrowDownRight size={17} className="recent-arrow" />
                  </div>
                ) : (
                  <ul className="meal-list">
                    {meals.slice(0, 5).map((m) => (
                      <li key={m.id}>
                        <div>
                          <strong>{m.items.map((i) => i.name).join(", ")}</strong>
                          <span>
                            {new Date(m.loggedAt).toLocaleString("en-IN", {
                              day: "numeric",
                              month: "short",
                              hour: "numeric",
                              minute: "2-digit",
                            })}{" "}
                            · {round(m.totals.calories)} kcal · P {round(m.totals.protein)}g · C {round(m.totals.carbs)}g · F {round(m.totals.fat)}g
                          </span>
                        </div>
                        <button className="remove-button" onClick={() => deleteMeal(m.id)} aria-label="Delete meal">
                          <Trash2 size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
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
