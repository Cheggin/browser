"""
hello_daemon.py — stub Python daemon for Track F packaging validation.

Prints "ready" to stdout (main process detects daemon readiness by reading this line),
then listens on a Unix socket at ${userData}/daemon-${pid}.sock.

Protocol (JSON-line over Unix socket):
  Request:  {"meta": "ping"}       -> {"ok": true, "result": "pong"}
  Request:  {"meta": "shutdown"}   -> {"ok": true} then exits cleanly
  Any other: {"ok": false, "error": {"code": "unknown_meta", "message": "...", "retryable": false}}

Socket path is passed via DAEMON_SOCKET_PATH env var (set by Electron main via utilityProcess).
Falls back to /tmp/agent_daemon-<pid>.sock for local testing.

NOTE: main process must use utilityProcess (NOT child_process) to spawn this binary.
      RunAsNode fuse is false; child_process.fork would fail. utilityProcess is the
      Electron-sanctioned path for spawning helper processes.
"""

import json
import os
import signal
import socket
import sys

SOCKET_PATH = os.environ.get(
    "DAEMON_SOCKET_PATH",
    f"/tmp/agent_daemon-{os.getpid()}.sock",
)

RECV_BUFFER_SIZE = 65536
SOCKET_BACKLOG = 5


def handle_message(raw: bytes) -> dict:
    """Parse a JSON message and return a response dict."""
    try:
        msg = json.loads(raw.decode("utf-8").strip())
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        return {
            "ok": False,
            "error": {
                "code": "parse_error",
                "message": str(exc),
                "retryable": False,
            },
        }

    meta = msg.get("meta")
    if meta == "ping":
        return {"ok": True, "result": "pong"}
    if meta == "shutdown":
        return {"ok": True}
    return {
        "ok": False,
        "error": {
            "code": "unknown_meta",
            "message": f"unknown meta: {meta!r}",
            "retryable": False,
        },
    }


def cleanup(path: str) -> None:
    """Remove the socket file on exit."""
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass


def main() -> None:
    # Remove stale socket from a previous run.
    cleanup(SOCKET_PATH)

    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(SOCKET_PATH)
    server.listen(SOCKET_BACKLOG)

    # Signal readiness to the parent (Electron main reads this line).
    print("ready", flush=True)
    sys.stderr.write(f"[hello_daemon] listening on {SOCKET_PATH} pid={os.getpid()}\n")
    sys.stderr.flush()

    shutdown_requested = False

    def _sigterm_handler(signum, frame):
        nonlocal shutdown_requested
        shutdown_requested = True

    signal.signal(signal.SIGTERM, _sigterm_handler)

    try:
        while not shutdown_requested:
            try:
                server.settimeout(1.0)  # allow SIGTERM to interrupt accept()
                conn, _ = server.accept()
            except socket.timeout:
                continue
            except OSError:
                break

            with conn:
                raw = conn.recv(RECV_BUFFER_SIZE)
                if not raw:
                    continue

                response = handle_message(raw)
                conn.sendall((json.dumps(response) + "\n").encode("utf-8"))

                if raw and json.loads(raw).get("meta") == "shutdown":
                    sys.stderr.write("[hello_daemon] shutdown requested — exiting\n")
                    sys.stderr.flush()
                    shutdown_requested = True
    finally:
        server.close()
        cleanup(SOCKET_PATH)
        sys.stderr.write("[hello_daemon] exited cleanly\n")
        sys.stderr.flush()


if __name__ == "__main__":
    main()
