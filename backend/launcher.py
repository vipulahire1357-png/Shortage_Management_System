"""Race-safe local server launcher with per-project runtime state.

The launcher holds the chosen socket open and hands that exact socket to
Uvicorn. If the preferred port is busy, the OS assigns port 0 atomically.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from pathlib import Path
import signal
import socket
import sys
import threading
import time
from typing import TextIO

import uvicorn

APP_ROOT = Path(__file__).resolve().parents[1]
RUNTIME_DIR = APP_ROOT / ".runtime"
DEFAULT_STATE_FILE = RUNTIME_DIR / "backend-state.json"


def bind_listener(host: str, preferred_port: int) -> tuple[socket.socket, int]:
    """Bind the preferred port or atomically ask the OS for an available one."""
    attempts = (preferred_port, 0) if preferred_port else (0,)
    last_error: OSError | None = None
    for port in attempts:
        listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
                listener.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            listener.bind((host, port))
            listener.listen(socket.SOMAXCONN)
            listener.set_inheritable(True)
            return listener, int(listener.getsockname()[1])
        except OSError as error:
            last_error = error
            listener.close()
    if last_error is not None:
        raise last_error
    raise OSError("Could not bind a local application socket.")


class ProjectLock:
    """Hold a single-instance file lock for this project directory."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.file: TextIO | None = None

    def acquire(self) -> bool:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.file = self.path.open("a+")
        self.file.seek(0, os.SEEK_END)
        if self.file.tell() == 0:
            self.file.write("0")
            self.file.flush()
        self.file.seek(0)
        try:
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(self.file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(self.file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            return True
        except (OSError, BlockingIOError):
            self.file.close()
            self.file = None
            return False

    def release(self) -> None:
        if self.file is None:
            return
        try:
            self.file.seek(0)
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(self.file.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(self.file.fileno(), fcntl.LOCK_UN)
        finally:
            self.file.close()
            self.file = None


def write_state(path: Path, values: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(values, indent=2), encoding="utf-8")
    os.replace(temporary, path)


async def serve_until_stopped(server: uvicorn.Server, listener: socket.socket, stop_file: Path) -> None:
    async def watch_stop_file() -> None:
        while not server.should_exit:
            if stop_file.exists():
                server.should_exit = True
                return
            await asyncio.sleep(0.2)

    watcher = asyncio.create_task(watch_stop_file())
    try:
        await server.serve(sockets=[listener])
    finally:
        watcher.cancel()
        try:
            await watcher
        except asyncio.CancelledError:
            pass


def run_reloader(config: uvicorn.Config, listener: socket.socket, stop_file: Path) -> None:
    from uvicorn.supervisors import ChangeReload

    server = uvicorn.Server(config)
    reloader = ChangeReload(config=config, target=server.run, sockets=[listener])

    def watch_stop_file() -> None:
        while not reloader.should_exit.is_set():
            if stop_file.exists():
                reloader.should_exit.set()
                return
            time.sleep(0.2)

    watcher = threading.Thread(target=watch_stop_file, name="abb-stop-watcher", daemon=True)
    watcher.start()
    reloader.run()


def run(args: argparse.Namespace) -> int:
    state_file = Path(args.state_file).resolve()
    stop_file = state_file.with_name("backend-stop.request")
    lock = ProjectLock(state_file.with_name("backend-instance.lock"))
    if not lock.acquire():
        print("This project already has a backend process running.", file=sys.stderr, flush=True)
        return 2

    listener: socket.socket | None = None
    try:
        stop_file.unlink(missing_ok=True)
        listener, port = bind_listener(args.host, args.preferred_port)
        root = APP_ROOT.resolve()
        config = uvicorn.Config(
            "backend.app.main:app",
            host=args.host,
            port=port,
            reload=args.reload,
            reload_dirs=[str(root)] if args.reload else None,
            log_level=args.log_level,
        )
        state = {
            "pid": os.getpid(),
            "project_root": str(root),
            "host": args.host,
            "port": port,
            "url": f"http://{args.host}:{port}",
            "state_file": str(state_file),
            "stop_file": str(stop_file),
            "started_at": time.time(),
        }
        write_state(state_file, state)
        print(f"APP_URL={state['url']}", flush=True)

        if args.reload:
            run_reloader(config, listener, stop_file)
        else:
            server = uvicorn.Server(config)
            asyncio.run(serve_until_stopped(server, listener, stop_file))
            listener = None
        return 0
    except Exception as error:
        print(f"Could not start this project: {error}", file=sys.stderr, flush=True)
        return 1
    finally:
        if listener is not None:
            listener.close()
        try:
            current = json.loads(state_file.read_text(encoding="utf-8"))
            if current.get("pid") == os.getpid():
                state_file.unlink(missing_ok=True)
        except (OSError, ValueError):
            pass
        stop_file.unlink(missing_ok=True)
        lock.release()


def main() -> int:
    parser = argparse.ArgumentParser(description="Run this ABB project on an available localhost port.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--preferred-port", type=int, default=8000)
    parser.add_argument("--state-file", default=str(DEFAULT_STATE_FILE))
    parser.add_argument("--reload", action="store_true")
    parser.add_argument("--log-level", default="info")
    args = parser.parse_args()
    if not 0 <= args.preferred_port <= 65535:
        parser.error("--preferred-port must be between 0 and 65535")
    return run(args)


if __name__ == "__main__":
    raise SystemExit(main())
