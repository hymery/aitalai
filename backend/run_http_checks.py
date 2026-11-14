"""Запуск e2e_check.py на временной SQLite и гарантированная остановка Uvicorn."""

from __future__ import annotations

from contextlib import contextmanager
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request


BASE_DIR = Path(__file__).resolve().parent


@contextmanager
def temporary_workdir():
    path = Path(tempfile.mkdtemp(prefix="http-check-", dir=BASE_DIR))
    try:
        yield path
    finally:
        for attempt in range(20):
            try:
                shutil.rmtree(path)
                break
            except PermissionError:
                if attempt == 19:
                    raise
                time.sleep(0.25)


def main() -> None:
    with temporary_workdir() as temp_dir:
        database = Path(temp_dir) / "check.db"
        log_path = Path(temp_dir) / "uvicorn.log"
        env = os.environ.copy()
        env["DATABASE_URL"] = f"sqlite:///{database.as_posix()}"
        env["TTS_ENABLED"] = "0"
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        env["AITALAI_TEST_URL"] = f"http://127.0.0.1:{port}"
        for script in ("seed.py", "build_courses.py"):
            subprocess.run([sys.executable, script], cwd=BASE_DIR, env=env, check=True)
        with log_path.open("w", encoding="utf-8") as log:
            server = subprocess.Popen(
                [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(port)],
                cwd=BASE_DIR,
                env=env,
                stdout=log,
                stderr=subprocess.STDOUT,
            )
            try:
                for _ in range(60):
                    if server.poll() is not None:
                        raise RuntimeError("Uvicorn завершился до начала проверок")
                    try:
                        with urllib.request.urlopen(env["AITALAI_TEST_URL"] + "/health", timeout=2) as response:
                            if response.status == 200:
                                break
                    except OSError:
                        time.sleep(0.5)
                else:
                    raise RuntimeError("Uvicorn не ответил на /health за 30 секунд")
                subprocess.run([sys.executable, "e2e_check.py"], cwd=BASE_DIR, env=env, check=True)
            except Exception:
                server.terminate()
                try:
                    server.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait(timeout=5)
                print(log_path.read_text(encoding="utf-8", errors="replace"))
                raise
            finally:
                if server.poll() is None:
                    server.terminate()
                    try:
                        server.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        server.kill()
                        server.wait(timeout=5)
    print("Временный Uvicorn остановлен; изолированная база удалена.")


if __name__ == "__main__":
    main()
