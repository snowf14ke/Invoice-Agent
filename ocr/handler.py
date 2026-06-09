import os, io, base64, time
from typing import Any
import json
import logging
from PIL import Image
import torch
import runpod
import requests
from io import BytesIO

# ── env ───────────────────────────────────────────────────────────────────────
os.environ['HF_HOME'] = "/app/model_cache"
MODEL_PATH = os.environ.get("HF_MODEL_ID", "PaddlePaddle/PaddleOCR-VL-1.6")
DEVICE     = "cuda" if torch.cuda.is_available() else "cpu"
DTYPE      = torch.bfloat16

SPOTTING_UPSCALE_THRESHOLD = 1500
MAX_PIXELS = {
    "spotting": 2048 * 28 * 28,  # ~1 605 632
    "default":  1280 * 28 * 28,  # ~1 003 520
}
PROMPTS = {
    "ocr":      "OCR:",
    "table":    "Table Recognition:",
    "formula":  "Formula Recognition:",
    "chart":    "Chart Recognition:",
    "spotting": "Spotting:",
    "seal":     "Seal Recognition:",
}
VALID_TASKS = set(PROMPTS.keys())

# ── lazy singletons ───────────────────────────────────────────────────────────
_MODEL     = None
_PROCESSOR = None


def now_ms() -> int:
    return int(time.time() * 1000)

def download_image_from_s3(url: str) -> bytes:
    response = requests.get(url)
    response.raise_for_status()   # raises exception if failed
    img = Image.open(BytesIO(response.content))
    return img

# ── model loader ──────────────────────────────────────────────────────────────
def load_model():
    global _MODEL, _PROCESSOR
    if _MODEL is None:
        from transformers import AutoModelForImageTextToText, AutoProcessor
        print(f"Loading model {MODEL_PATH} …")
        if torch.cuda.is_available():
            print(f"CUDA device: {torch.cuda.get_device_name(0)}")
            print(f"CUDA version: {torch.version.cuda}")
        else:
            print("WARNING: CUDA not available, running on CPU")
        _MODEL = (
            AutoModelForImageTextToText
            .from_pretrained(MODEL_PATH, torch_dtype=DTYPE)
            .to(DEVICE)
            .eval()
        )
        if DEVICE == 'cpu':
            return None
        print("Loading processor …")
        _PROCESSOR = AutoProcessor.from_pretrained(MODEL_PATH)
        print("Model ready.")
    return _MODEL, _PROCESSOR



# ── pre-processing ────────────────────────────────────────────────────────────
def preprocess_image(image: Image.Image, task: str) -> Image.Image:
    """Upscale small images for the spotting task (mirrors reference script)."""
    if task != "spotting":
        return image
    orig_w, orig_h = image.size
    if orig_w < SPOTTING_UPSCALE_THRESHOLD and orig_h < SPOTTING_UPSCALE_THRESHOLD:
        try:
            resample = Image.Resampling.LANCZOS
        except AttributeError:
            resample = Image.LANCZOS
        image = image.resize((orig_w * 2, orig_h * 2), resample)
    return image


# ── core inference ────────────────────────────────────────────────────────────
@torch.inference_mode()
def run_inference(image: Image.Image, task: str, max_new_tokens: int = 512) -> str:
    model, processor = load_model()

    max_pixels = MAX_PIXELS["spotting"] if task == "spotting" else MAX_PIXELS["default"]

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text",  "text":  PROMPTS[task]},
            ],
        }
    ]

    inputs = processor.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt",
        images_kwargs={
            "size": {
                "shortest_edge": processor.image_processor.size.shortest_edge,
                "longest_edge":  max_pixels,
            }
        },
    ).to(model.device)

    outputs = model.generate(**inputs, max_new_tokens=max_new_tokens)
    # Strip prompt tokens; -1 drops the trailing EOS appended by the model
    result = processor.decode(outputs[0][inputs["input_ids"].shape[-1]:-1])
    return result


# ── single-item helper ────────────────────────────────────────────────────────
def process_single(img_input: Any, task: str, max_new_tokens: int = 512) -> dict:
    task = task.lower()
    if task not in VALID_TASKS:
        raise ValueError(f"Invalid task '{task}'. Choose from: {sorted(VALID_TASKS)}")

    t0    = now_ms()
    image = img_input#load_image(img_input)
    image = preprocess_image(image, task)

    ti0    = now_ms()
    result = run_inference(image, task, max_new_tokens)
    ti1    = now_ms()

    return {
        "result":     result,
        "task":       task,
        "timings_ms": {"total": now_ms() - t0, "inference": ti1 - ti0},
    }


# ── RunPod handler ────────────────────────────────────────────────────────────
def handler(job):
    inp            = job.get("input", {}) or {}
    max_new_tokens = min(int(inp.get("max_new_tokens", 512)),3096)
    default_task   = inp.get("task", "ocr")
    webhook = inp.get("webhook", None)
    image_id = inp.get("image_id","No idea")
    boxes = inp.get("boxes",'no_box')


    # ── single ─────────────────────────────────────────────────────────────────
    if "image" not in inp:
        raise ValueError("Provide 'image' (or 'images' for batch) in input.")
    image = download_image_from_s3(inp["image"]) #if isinstance(inp["image"], str) else inp["image"]
    
    if boxes == "no_box":
        
        result =  process_single(image, default_task, max_new_tokens)
    else:
        for inx, box in enumerate(boxes):
            try:
                if box['label'] == 'image':
                    logging.debug("skipping image layout")
                    continue
                cut = image.crop(box['coordinate'])
                task = PROMPTS.get(box['label'],default_task)
                
                boxes[inx]['text'] =  process_single(cut,task,max_new_tokens)['result']
            except Exception as e:
                logging.debug(f"failed on some boxes cuz of {e}")
        result = boxes
    try:
        content = {
            "id":job.get("id",None),
            "image_id":image_id,
            "status":"completed",
            "output":result
        }
   
        if webhook:
            response = requests.post(
                webhook,
                data=json.dumps(content),
                headers={'Content-Type': 'application/json'}
            )
            # Check if the request was successful (e.g., status code 200)
            response.raise_for_status() 
            print(f"Webhook sent successfully. Status code: {response.status_code}")
        else:
        
            print("No webhook URL provided, skipping webhook POST.")
    except requests.exceptions.RequestException as e:
        
        print(f"An error occurred: {e}")
    except Exception as e:
        print(f"Some other error :{ e}")
    return result

if __name__ == "__main__":
    print("Warming up model before accepting requests …")
    rees =load_model()
    if rees == None:
        import sys
        print(f"failed to load model to GPU, is cuda available: {torch.cuda.is_available()}")
        sys.exit(1)
    print("Ready.")
    runpod.serverless.start({"handler": handler})