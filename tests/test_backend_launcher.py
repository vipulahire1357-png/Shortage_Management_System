from __future__ import annotations

import socket
import tempfile
import unittest
from pathlib import Path

from backend.launcher import ProjectLock, bind_listener


class DynamicPortTests(unittest.TestCase):
    def test_uses_preferred_port_when_available(self) -> None:
        probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        probe.bind(("127.0.0.1", 0))
        preferred = probe.getsockname()[1]
        probe.close()

        listener, selected = bind_listener("127.0.0.1", preferred)
        try:
            self.assertEqual(selected, preferred)
            self.assertEqual(listener.getsockname()[1], preferred)
        finally:
            listener.close()

    def test_falls_back_atomically_when_preferred_port_is_busy(self) -> None:
        occupied = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        occupied.bind(("127.0.0.1", 0))
        occupied.listen()
        preferred = occupied.getsockname()[1]
        listener, selected = bind_listener("127.0.0.1", preferred)
        try:
            self.assertNotEqual(selected, preferred)
            self.assertEqual(listener.getsockname()[1], selected)
            client = socket.create_connection(("127.0.0.1", selected), timeout=2)
            client.close()
        finally:
            listener.close()
            occupied.close()

    def test_port_zero_allocates_distinct_ports_for_two_apps(self) -> None:
        first, first_port = bind_listener("127.0.0.1", 0)
        second, second_port = bind_listener("127.0.0.1", 0)
        try:
            self.assertNotEqual(first_port, second_port)
        finally:
            first.close()
            second.close()


class ProjectLockTests(unittest.TestCase):
    def test_lock_is_exclusive_per_project_and_independent_between_projects(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            first = ProjectLock(root / "root-project" / "backend.lock")
            first_duplicate = ProjectLock(root / "root-project" / "backend.lock")
            second = ProjectLock(root / "portable-project" / "backend.lock")
            try:
                self.assertTrue(first.acquire())
                self.assertFalse(first_duplicate.acquire())
                self.assertTrue(second.acquire())
            finally:
                first.release()
                first_duplicate.release()
                second.release()


if __name__ == "__main__":
    unittest.main()
