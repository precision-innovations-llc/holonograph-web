#!/usr/bin/env python3
"""Clean-URL static server for local preview.

Plain `python -m http.server` can't resolve extensionless paths, so the guide's
clean-URL links (/guide/overview) 404 locally even though they work on Cloudflare
Pages. This mirrors Pages: an extensionless path that doesn't exist falls back to
`<path>.html`. It also sends `Cache-Control: no-store`, so edits to shared assets
(site.css/js, guide.css, changelog.json...) show on a normal reload — no hard-refresh.

Usage:  python3 scripts/serve.py [port]        (default 8642)
"""
import http.server, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # holonograph_web/
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8642


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def translate_path(self, path):
        p = super().translate_path(path)
        # extensionless + missing → try the .html file (clean URLs, like CF Pages)
        if not os.path.exists(p) and not os.path.splitext(p)[1] and os.path.exists(p + ".html"):
            return p + ".html"
        return p

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")  # always fresh in local preview
        super().end_headers()


if __name__ == "__main__":
    with http.server.ThreadingHTTPServer(("", PORT), Handler) as httpd:
        print(f"Clean-URL preview → http://localhost:{PORT}/   (serving {ROOT})")
        print("  /guide/overview resolves to overview.html · no-store cache · Ctrl+C to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
