
import os
import io
import json
import base64
import requests

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

app = FastAPI(title="HiperMeal API")

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

MODEL = "google/gemma-4-E4B-it"
API_URL = "https://router.huggingface.co/v1/chat/completions"


@app.get("/")
def home():
    return {"message": "HiperMeal backend is running!"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze")
async def analyze_meal(image: UploadFile = File(...)):
    token = os.getenv("HF_TOKEN")

    if not token:
        raise HTTPException(503, "HF_TOKEN is not configured.")

    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(400, "Please upload an image.")

    image_bytes = await image.read()

    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(413, "Image must be under 10 MB.")

    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img.verify()
    except Exception:
        raise HTTPException(400, "Invalid image file.")

    # Convert image into a format the vision API can receive.
    encoded_image = base64.b64encode(image_bytes).decode("utf-8")

    mime_type = image.content_type
    image_url = f"data:{mime_type};base64,{encoded_image}"

    prompt = """
    You are a meal analysis assistant for a nutrition diary.
    Examine the food photo and identify the visible food items.
    Estimate a typical serving size and its nutrition.

    Return ONLY valid JSON in this exact format:
    {
      "food": "name of food",
      "serving": "estimated serving size",
      "calories": 300,
      "protein": 12,
      "carbs": 35,
      "fat": 10,
      "description": "brief explanation"
    }

    Calories must be kcal. Protein, carbs and fat must be grams.
    Use reasonable estimates. Do not claim exact measurements
    from an image. If the image is not food, say so in food.
    """

    try:
        response = requests.post(
            API_URL,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={
                "model": MODEL,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {"url": image_url},
                            },
                        ],
                    }
                ],
                "max_tokens": 400,
                "temperature": 0.2,
            },
            timeout=120,
        )

        if response.status_code != 200:
            print("Model API error:", response.status_code, response.text)
            raise HTTPException(
                502,
                "Gemma API failed. Check model availability, token permissions and provider access."
            )

        result = response.json()
        content = result["choices"][0]["message"]["content"]

        # Extract JSON even if the model wraps it in Markdown.
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[-1]
            content = content.rsplit("```", 1)[0].strip()
            if content.startswith("json"):
                content = content[4:].strip()

        data = json.loads(content)

        return {
            "food": data.get("food", "Unknown"),
            "serving": data.get("serving", "Estimated serving"),
            "confidence": None,
            "nutrition": {
                "calories": data.get("calories", 0),
                "protein": data.get("protein", 0),
                "carbs": data.get("carbs", 0),
                "fat": data.get("fat", 0),
            },
            "description": data.get("description", ""),
            "note": "AI-generated nutrition estimates; verify food and serving size."
        }

    except requests.RequestException:
        raise HTTPException(502, "Could not connect to Hugging Face.")

    except (KeyError, IndexError, ValueError, json.JSONDecodeError):
        raise HTTPException(
            502,
            "The model returned an unexpected response. Please try again."
        )
