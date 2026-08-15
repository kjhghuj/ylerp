import http.server
import hashlib
import hmac
import json
import subprocess
import os

PORT = 9000
SECRET = os.environ.get("WEBHOOK_SECRET", "your-webhook-secret-here")
DEPLOY_SCRIPT = "/opt/ylerp/deploy.sh"
LOG_FILE = "/var/log/ylerp-deploy.log"
DEPLOY_TIMEOUT_SECONDS = int(os.environ.get("DEPLOY_TIMEOUT_SECONDS", "1800"))


class WebhookHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/webhook":
            self.send_response(404)
            self.end_headers()
            return

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        sig_header = self.headers.get("X-Hub-Signature-256", "")
        if not self.verify_signature(body, sig_header):
            self.send_response(403)
            self.end_headers()
            self.wfile.write(b"Forbidden")
            return

        payload = json.loads(body)
        ref = payload.get("ref", "")
        if ref != "refs/heads/main":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Ignored (not main branch)")
            return

        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"Deploy triggered")

        self.log("收到 GitHub push 事件，开始部署...")
        try:
            result = subprocess.run(
                ["bash", DEPLOY_SCRIPT],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=DEPLOY_TIMEOUT_SECONDS,
            )
            self.log(f"部署退出码: {result.returncode}")
        except subprocess.TimeoutExpired:
            self.log(f"部署超时（{DEPLOY_TIMEOUT_SECONDS}秒）")
        except Exception as e:
            self.log(f"部署异常: {e}")

    def verify_signature(self, body, sig_header):
        if not sig_header:
            return False
        expected = "sha256=" + hmac.new(
            SECRET.encode(), body, hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, sig_header)

    def log(self, msg):
        with open(LOG_FILE, "a") as f:
            f.write(f"[Webhook] {msg}\n")
        print(msg)

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    server = http.server.HTTPServer(("0.0.0.0", PORT), WebhookHandler)
    print(f"Webhook listener running on port {PORT}")
    server.serve_forever()
