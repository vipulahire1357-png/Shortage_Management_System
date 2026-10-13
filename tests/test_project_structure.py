from pathlib import Path


def test_core_directories_exist():
    root = Path(__file__).resolve().parents[1]
    for relative in ("parsers", "database", "services", "dashboard", "data", "tests"):
        assert (root / relative).is_dir()
