"""Локальная башкирская озвучка Silero v5 с файловым кэшем."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
import threading

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = Path(os.getenv("TTS_CACHE_DIR", BASE_DIR / "tts_cache"))
SPEAKER = "bak_alfia"
MODEL_ID = "v5_cis_base_nostress"
SAMPLE_RATE = 24000

# Все загруженные модели остаются внутри проекта.
os.environ.setdefault("TORCH_HOME", str(BASE_DIR / ".cache" / "torch"))

router = APIRouter()
_lock = threading.Lock()
_model = None
_load_error: Exception | None = None


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)


def tts_enabled() -> bool:
    return os.getenv("TTS_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}


def preload_tts():
    """Загружает модель ровно один раз; повторные вызовы возвращают её."""
    global _model, _load_error
    if not tts_enabled():
        raise RuntimeError("Silero TTS отключён переменной TTS_ENABLED=0")
    if _model is not None:
        return _model
    with _lock:
        if _model is not None:
            return _model
        try:
            import torch

            torch.set_num_threads(max(1, min(4, os.cpu_count() or 1)))
            model_path = Path(os.getenv("TTS_MODEL_PATH", BASE_DIR / ".cache" / "models" / f"{MODEL_ID}.pt"))
            if model_path.is_file():
                # Файловый объект обходит ошибку PyTorch с Unicode-путями Windows.
                with model_path.open("rb") as model_file:
                    model = torch.package.PackageImporter(model_file).load_pickle("tts_models", "model")
            else:
                from silero import silero_tts

                model, _ = silero_tts(language="ru", speaker=MODEL_ID)
            model.to(torch.device("cpu"))
            if hasattr(model, "eval"):
                model.eval()
            _model = model
            _load_error = None
            return _model
        except Exception as exc:
            _load_error = exc
            raise


def synthesize(text: str) -> Path:
    clean_text = " ".join(text.split())
    if not clean_text:
        raise HTTPException(status_code=422, detail="Введите текст для озвучки.")
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    digest = hashlib.md5(f"{SPEAKER}:{clean_text}".encode("utf-8")).hexdigest()
    target = CACHE_DIR / f"{digest}.wav"
    if target.is_file() and target.stat().st_size > 44:
        return target
    try:
        import wave
        import numpy as np

        model = preload_tts()
        with _lock:
            if target.is_file() and target.stat().st_size > 44:
                return target
            audio = model.apply_tts(
                text=clean_text,
                speaker=SPEAKER,
                sample_rate=SAMPLE_RATE,
                put_accent=False,
                put_yo=False,
            )
            samples = audio.detach().cpu().numpy() if hasattr(audio, "detach") else audio
            pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2")
            temporary = target.with_suffix(".tmp.wav")
            with wave.open(str(temporary), "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(SAMPLE_RATE)
                wav.writeframes(pcm.tobytes())
            temporary.replace(target)
        return target
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Башкирская озвучка временно недоступна. Проверьте загрузку Silero.",
        ) from exc


@router.post("/api/tts", tags=["Озвучка"], summary="Озвучить башкирский текст")
def tts(payload: TTSRequest):
    path = synthesize(payload.text)
    return FileResponse(
        path,
        media_type="audio/wav",
        filename=f"aitalay-{path.stem}.wav",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
