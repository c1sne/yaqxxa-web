#!/usr/bin/env bash
# servir.sh — servidor local de desarrollo, sin caché.
#
# python3 -m http.server sirve con Last-Modified y el navegador cachea: editás
# un archivo, recargás, y ves el anterior. Este manda no-store en cada
# respuesta, así que recargar siempre trae lo último.

PUERTO="${1:-8099}"

python3 - "$PUERTO" <<'PY'
import sys, functools, http.server, socketserver

class SinCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

    def log_message(self, formato, *args):
        if '304' not in formato % args:
            super().log_message(formato, *args)

puerto = int(sys.argv[1])
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('', puerto), SinCache) as httpd:
    print(f'yaqxxa en http://localhost:{puerto}  ·  sin caché  ·  ctrl-c para parar')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nservidor detenido')
PY
