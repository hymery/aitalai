FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app/bot
COPY bot/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY bot/ ./
COPY frontend/ /app/frontend/

ENV WEBAPP_DIR=/app/frontend
EXPOSE 8080
CMD ["python", "bot.py"]
