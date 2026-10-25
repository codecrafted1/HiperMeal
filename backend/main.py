import base64
import csv
import io
import json
import os
import re
from pathlib import Path
from typing import List, Optional

import requests
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageOps
from pydantic import BaseModel, Field

app = FastAPI(title="HiperMeal API")

# Comma-separated list of allowed origins. Defaults cover local Vite dev.
# In production on DigitalOcean the frontend and API share one domain, so
# CORS is not needed, but you can still set CORS_ORIGINS to be explicit.
origins = os.getenv(
    "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Primary: Gemma 4 through the Gemini API (set GEMINI_API_KEY).
# Fallback: Hugging Face Inference Providers (set HF_TOKEN).
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemma-4-26b-a4b-it")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
MODEL = os.getenv("GEMMA_MODEL", "google/gemma-4-26B-A4B-it")
API_URL = os.getenv(
    "GEMMA_API_URL", "https://router.huggingface.co/v1/chat/completions"
)
MOCK_MODE = os.getenv("MOCK_MODE", "").lower() in ("1", "true", "yes")
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_IMAGE_SIDE = 1024

NOTE = (
    "AI-generated estimates. Portion sizes and mixed dishes cannot be "
    "determined exactly from a photo - please review and edit. "
    "This is not medical or dietary advice."
)

# --------------------------------------------------------------------------
# Small local nutrition dataset (per 100 g)
# --------------------------------------------------------------------------

def _num(value, default=0.0) -> float:
    try:
        return max(0.0, float(value))
    except (TypeError, ValueError):
        return default


def _normalise(name: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9()\s]", " ", name.lower())).strip()


def _keys(entry: dict) -> set:
    """Every lookup key for a food: the name, each side of 'A / B', the name
    without any '(...)' part, and all aliases."""
    keys = set()
    for text in [entry["name"], *entry.get("aliases", [])]:
        for part in re.split(r"\s*/\s*", text):
            keys.add(_normalise(part))
            keys.add(_normalise(re.sub(r"\([^)]*\)", " ", part)))
    keys.discard("")
    return keys


def _load_csv(path: Path) -> List[dict]:
    foods = []
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            name = (row.get("food_name") or "").strip()
            cols = {
                "calories": "kcal_per_100g",
                "protein": "protein_per_100g",
                "carbs": "carbs_per_100g",
                "fat": "fat_per_100g",
            }
            try:
                vals = {k: float(row[c]) for k, c in cols.items()}
            except (TypeError, ValueError, KeyError):
                continue
            if not name:
                continue
            aliases = [
                a.strip()
                for a in (row.get("aliases") or "").split(";")
                if a.strip()
            ]
            foods.append(
                {
                    "name": name,
                    "aliases": aliases,
                    "serving": _num(row.get("serving_g"), 100.0) or 100.0,
                    "category": (row.get("category") or "").strip(),
                    "ref": None,
                    **vals,
                }
            )
    return foods


_BASE = Path(__file__).parent
_json_foods = json.loads((_BASE / "nutrition.json").read_text(encoding="utf-8"))["foods"]
_verified = [f for f in _json_foods if f.get("ref")]  # checked against USDA / a label
_approx = [f for f in _json_foods if not f.get("ref")]
_csv_foods = _load_csv(_BASE / "nutrition_starter.csv")

# Later layers win on an exact name/alias clash:
#   approximate JSON  <  starter CSV (dishes, servings)  <  verified JSON
_INDEX = {}
for _layer in (_approx, _csv_foods, _verified):
    for _f in _layer:
        for _k in _keys(_f):
            _INDEX[_k] = _f

_seen = set()
FOODS = []
for _f in (*_verified, *_csv_foods, *_approx):
    _n = _normalise(_f["name"])
    if _n not in _seen:
        _seen.add(_n)
        FOODS.append(_f)


def lookup_food(name: str) -> Optional[dict]:
    """Find a dataset entry for a food name: exact/alias match first, then
    a whole-word containment match (longest key wins)."""
    key = _normalise(name)
    if not key:
        return None
    if key in _INDEX:
        return _INDEX[key]
    best = None
    for k, entry in _INDEX.items():
        if re.search(rf"\b{re.escape(k)}\b", key) or re.search(
            rf"\b{re.escape(key)}\b", k
        ):
            if best is None or len(k) > len(best[0]):
                best = (k, entry)
    return best[1] if best else None


def _per100(entry: dict) -> dict:
    return {k: entry[k] for k in ("calories", "protein", "carbs", "fat")}


def build_item(name: str, grams: float, model_macros: Optional[dict] = None,
               per100: Optional[dict] = None) -> dict:
    """Return a normalised item. Prefers dataset values; falls back to the
    per-100g values supplied by the client, then to the model's estimate."""
    entry = lookup_food(name)
    grams = _num(grams, 0.0) or (entry or {}).get("serving") or 100.0
    if entry:
        p100, source = _per100(entry), "dataset"
    elif per100:
        p100 = {k: _num(per100.get(k)) for k in ("calories", "protein", "carbs", "fat")}
        source = "ai-estimate"
    elif model_macros:
        p100 = {
            k: round(_num(model_macros.get(k)) / grams * 100, 1)
            for k in ("calories", "protein", "carbs", "fat")
        }
        source = "ai-estimate"
    else:
        p100, source = {"calories": 0, "protein": 0, "carbs": 0, "fat": 0}, "unknown"
    return {
        "name": name,
        "grams": round(grams),
        "per100": p100,
        "source": source,
        "nutrition": {k: round(v * grams / 100, 1) for k, v in p100.items()},
    }


def totals(items: List[dict]) -> dict:
    return {
        k: round(sum(i["nutrition"][k] for i in items), 1)
        for k in ("calories", "protein", "carbs", "fat")
    }


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------


@app.get("/")
def home():
    return {"message": "HiperMeal backend is running!"}


@app.get("/health")
def health():
    provider = "mock" if MOCK_MODE else "gemini" if GEMINI_API_KEY else "huggingface"
    return {
        "status": "ok",
        "mock": MOCK_MODE,
        "provider": provider,
        "model": GEMINI_MODEL if provider == "gemini" else MODEL,
    }


@app.get("/foods")
def foods():
    """Names the user can pick from when correcting an item."""
    return {"foods": sorted(f["name"] for f in FOODS)}


class ItemIn(BaseModel):
    name: str = Field(..., max_length=80)
    grams: float = Field(..., gt=0, le=5000)
    per100: Optional[dict] = None


class NutritionIn(BaseModel):
    items: List[ItemIn] = Field(..., max_length=30)


@app.post("/nutrition")
def nutrition(body: NutritionIn):
    """Recompute nutrition after the user edits names or portions."""
    items = [build_item(i.name.strip(), i.grams, per100=i.per100) for i in body.items]
    return {"items": items, "totals": totals(items), "note": NOTE}


PROMPT = """You are a meal analysis assistant for a nutrition diary.
Look at the food photo and list each distinct visible food item.
For every item estimate the portion in grams and its nutrition for that portion.

Return ONLY valid JSON in exactly this shape:
{
  "items": [
    {"name": "white rice (cooked)", "grams": 180, "calories": 234,
     "protein": 4.9, "carbs": 50, "fat": 0.5}
  ],
  "description": "one or two sentences describing the meal"
}

Rules:
- calories are kcal; protein, carbs and fat are grams.
- Use simple, common food names (e.g. "chapati", "dal", "grilled chicken breast").
- These are rough estimates; do not claim exact measurements.
- If the image is not food, return {"items": [], "description": "No food detected."}.
"""


def _prepare_image(raw: bytes) -> str:
    """Validate, fix orientation, downscale and re-encode as JPEG. This keeps
    the request small and strips EXIF metadata (e.g. GPS) from the photo."""
    try:
        with Image.open(io.BytesIO(raw)) as img:
            img = ImageOps.exif_transpose(img).convert("RGB")
            img.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE))
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=85)
    except Exception:
        raise HTTPException(400, "Invalid image file.")
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def _parse_json(text: str) -> dict:
    text = text.strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("no JSON object")
    raw = match.group(0)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Models sometimes leave trailing commas; strip them and retry.
        return json.loads(re.sub(r",\s*([}\]])", r"\1", raw))


MOCK_RESPONSE = {
    "items": [
        {"name": "chapati", "grams": 80, "calories": 238, "protein": 7.2, "carbs": 40, "fat": 6},
        {"name": "dal", "grams": 200, "calories": 232, "protein": 18, "carbs": 40, "fat": 1},
        {"name": "mixed vegetable curry", "grams": 150, "calories": 135, "protein": 3.7, "carbs": 15, "fat": 6.8},
        {"name": "paneer tikka", "grams": 100, "calories": 250, "protein": 16, "carbs": 5, "fat": 19},
    ],
    "description": "An Indian thali-style meal with flatbread, lentils, a vegetable curry and a paneer dish.",
}


def _call_gemini(image_url: str) -> str:
    """Gemma 4 via the Gemini API (generateContent) with an inline image."""
    b64 = image_url.split(",", 1)[1]
    response = requests.post(
        GEMINI_URL.format(model=GEMINI_MODEL),
        headers={"x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json"},
        json={
            "contents": [
                {
                    "parts": [
                        {"inline_data": {"mime_type": "image/jpeg", "data": b64}},
                        {"text": PROMPT},
                    ]
                }
            ],
            "generationConfig": {"temperature": 0.2, "maxOutputTokens": 4096},
        },
        timeout=120,
    )
    if response.status_code != 200:
        print("Gemini API error:", response.status_code, response.text[:500])
        raise HTTPException(
            502, "Gemma API failed. Check the GEMINI_API_KEY and model name."
        )
    body = response.json()
    candidate = (body.get("candidates") or [{}])[0]
    parts = (candidate.get("content") or {}).get("parts") or []
    # Skip any "thought" parts; keep only the answer text.
    text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
    if not text.strip():
        print(
            "Gemini returned no answer text. finishReason:",
            candidate.get("finishReason"),
            "| promptFeedback:",
            body.get("promptFeedback"),
        )
    return text


def _call_huggingface(image_url: str) -> str:
    token = os.getenv("HF_TOKEN")
    if not token:
        raise HTTPException(
            503, "No model key configured. Set GEMINI_API_KEY (or HF_TOKEN) on the server."
        )
    response = requests.post(
        API_URL,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={
            "model": MODEL,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": PROMPT},
                        {"type": "image_url", "image_url": {"url": image_url}},
                    ],
                }
            ],
            "max_tokens": 700,
            "temperature": 0.2,
        },
        timeout=120,
    )
    if response.status_code != 200:
        print("Model API error:", response.status_code, response.text[:500])
        raise HTTPException(
            502,
            "Gemma API failed. Check model availability, token permissions and provider access.",
        )
    return response.json()["choices"][0]["message"]["content"]


@app.post("/analyze")
async def analyze_meal(image: UploadFile = File(...)):
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(400, "Please upload an image.")

    raw = await image.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Image must be under 10 MB.")

    image_url = _prepare_image(raw)  # validates too

    if MOCK_MODE:
        data = MOCK_RESPONSE
    else:
        content = ""
        try:
            content = (
                _call_gemini(image_url) if GEMINI_API_KEY else _call_huggingface(image_url)
            )
            data = _parse_json(content)
        except requests.RequestException:
            raise HTTPException(502, "Could not connect to the model provider.")
        except (KeyError, IndexError, ValueError, TypeError) as exc:
            print("Could not parse model output:", repr(exc), "| raw:", repr(content)[:1200])
            raise HTTPException(
                502, "The model returned an unexpected response. Please try again."
            )

    items = []
    for raw_item in (data.get("items") or [])[:15]:
        name = str(raw_item.get("name", "")).strip()[:80]
        if not name:
            continue
        items.append(build_item(name, raw_item.get("grams"), model_macros=raw_item))

    return {
        "items": items,
        "totals": totals(items),
        "description": str(data.get("description", ""))[:400],
        "note": NOTE,
    }
