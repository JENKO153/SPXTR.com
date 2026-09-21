#!/usr/bin/env python3
"""Local preview server for the site: serves this folder at http://localhost:8080 with caching
turned off, so edits always show up on refresh. Usage: python3 tools/serve.py [port]"""
import http.server
import os
import sys

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
print(f'Serving on http://localhost:{port}')
http.server.ThreadingHTTPServer(('127.0.0.1', port), NoCacheHandler).serve_forever()
