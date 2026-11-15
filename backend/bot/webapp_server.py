"""Локальный HTTP-сервер Mini App.

Раздаёт файлы из папки `webapp/` на порту 8080, чтобы Telegram мог
открыть Mini App по адресу WEBAPP_URL.
"""

from __future__ import annotations

import logging
from pathlib import Path

from aiohttp import web

from config import Config

logger = logging.getLogger(__name__)


def _is_inside(base: Path, target: Path) -> bool:
    try:
        target.relative_to(base)
    except ValueError:
        return False
    return True


async def start_webapp_server(config: Config) -> tuple[web.AppRunner, int]:
    """Запускает сервер статики Mini App и возвращает runner и порт."""
    webapp_dir: Path = config.webapp_dir.resolve()
    index_file = webapp_dir / "index.html"

    if not index_file.exists():
        logger.warning(
            "Не найден %s — Mini App будет отвечать ошибкой 404", index_file
        )

    async def index_handler(request: web.Request) -> web.StreamResponse:
        if not index_file.exists():
            raise web.HTTPNotFound(text="Mini App ещё не собран")
        return web.FileResponse(
            index_file, headers={"Cache-Control": "no-store"}
        )

    async def health_handler(request: web.Request) -> web.Response:
        return web.json_response({"status": "ok"})

    async def static_handler(request: web.Request) -> web.StreamResponse:
        relative = request.match_info.get("path", "").lstrip("/")
        if not relative:
            return await index_handler(request)

        target = (webapp_dir / relative).resolve()
        if not _is_inside(webapp_dir, target) or not target.is_file():
            # Для навигации по hash-роутам отдаём index.html,
            # для отсутствующих ассетов — честный 404.
            accept = request.headers.get("Accept", "")
            if "text/html" in accept and index_file.exists():
                return web.FileResponse(
                    index_file, headers={"Cache-Control": "no-store"}
                )
            raise web.HTTPNotFound(text="Файл не найден")

        return web.FileResponse(target)

    app = web.Application()
    app.router.add_get("/health", health_handler)
    app.router.add_get("/{path:.*}", static_handler)

    runner = web.AppRunner(app, access_log=None)
    await runner.setup()
    site = web.TCPSite(runner, config.webapp_host, config.webapp_port)
    await site.start()

    logger.info(
        "WebApp server started on http://localhost:%s (папка: %s)",
        config.webapp_port,
        webapp_dir,
    )
    return runner, config.webapp_port
