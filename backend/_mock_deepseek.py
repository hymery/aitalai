import json
from http.server import BaseHTTPRequestHandler, HTTPServer

REPLY = {
    "reply_ba": "Сәй бик тәмле, ҡунағым! Бал яратыуыңа шөкөр.",
    "reply_ru": "Чай очень вкусный, мой гость! Хорошо, что ты любишь мёд.",
    "emotion": "success",
    "corrections": [{"wrong": "сәй тәмле", "correct": "сәй бик тәмле", "explanation_ru": "«Бик» усиливает качество: очень вкусный."}],
    "new_words": [{"ba": "шөкөр", "ru": "хорошо, слава богу"}],
    "hint": "Рәхмәт, өләсәй!|Сәй бик тәмле.",
}

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        self.rfile.read(length)
        body = json.dumps({"choices": [{"message": {"content": json.dumps(REPLY, ensure_ascii=False)}}]}, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass

HTTPServer(("127.0.0.1", 8001), Handler).serve_forever()
