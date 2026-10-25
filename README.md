# HiperMeal - AI Visual Nutrition Diary

Hacktoberfest Hack Day (KodeKurrent S2 x Open Science Labs) - **HiperMeal** problem statement.
Turn a meal photo into a reviewable nutrition record without typing every food item.

## What it does

1. **Upload** a meal photo.
2. **Gemma 4** (multimodal, open-weights) identifies the visible foods and estimates a portion for each.
3. Each food is matched against a small **local nutrition dataset** (`backend/nutrition.json`, per 100 g). Foods not in the dataset fall back to the model's own estimate and are clearly labelled.
4. **Review and correct**: rename items, change grams, remove or add items. Totals recompute instantly.
5. **Confirm and log** the meal to a daily diary with calorie and macro totals.

### Responsible-use choices
- Portions and mixed dishes can't be known exactly from a photo, so every value is **editable** and labelled as an estimate.
- No medical or dietary claims. Progress bars use generic reference values, not personal targets.
- Photos are downscaled and re-encoded server-side (this strips EXIF/GPS), sent once to the model, and **never stored**. Only the confirmed meal (names and macros) is saved, in the browser's `localStorage`.

## Architecture

```
React (Vite) --/analyze--> FastAPI --> Gemma 4 (Hugging Face Inference Providers)
     |                        |
     |--/nutrition (recompute)--> nutrition.json lookup (aliases + fuzzy match)
     '--/foods (autocomplete)
```

| Part | Tech |
| --- | --- |
| Frontend | React 19, Vite, lucide-react |
| Backend | FastAPI, Pillow, Pydantic |
| Model | `google/gemma-4-E4B-it` via the Hugging Face router (configurable with `GEMMA_MODEL`) |
| Hosting | DigitalOcean App Platform (`.do/app.yaml`) |

## Run locally

```bash
# backend
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export HF_TOKEN=hf_xxx            # or: export MOCK_MODE=1 to demo without a token
uvicorn main:app --reload --port 8000

# frontend (new terminal)
cd frontend
npm install
npm run dev                       # http://localhost:5173
```

The frontend talks to `http://127.0.0.1:8000` by default; override with `VITE_API_URL`.

## Deploy on DigitalOcean

1. Push this repo to GitHub (public).
2. In DigitalOcean: **Apps > Create App**, choose the repo, or run `doctl apps create --spec .do/app.yaml`.
3. In the app's settings, set the secret **`HF_TOKEN`** (never commit it).
4. The static site serves the UI at `/` and the API is routed at `/api`.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness + model name |
| GET | `/foods` | Known food names for autocomplete |
| POST | `/analyze` | Multipart `image` -> items, per-item nutrition, totals |
| POST | `/nutrition` | Recompute after edits: `{items:[{name, grams, per100?}]}` |

## Limitations
- Nutrition dataset is small (about 50 common foods, many Indian staples) and values are approximate; it is not a clinical reference.
- Portion estimation from a single photo is inherently rough - always review before logging.
- Diary is stored per browser; there are no accounts.

## Attribution
- Gemma 4 by Google, accessed through Hugging Face Inference Providers.
- React, Vite, FastAPI, Pillow, lucide-react (open source).
- Nutrition values in `nutrition.json` were compiled by the team from general food-composition knowledge for demo purposes.
- Project scaffold and original dashboard UI by the HiperMeal team; analysis flow, dataset matching, editing and logging added during the Hack Day with AI coding assistance (Claude).
