"""One-time local setup. No cloud accounts, global package installation or keys."""
from pathlib import Path
import shutil
import subprocess
import sys
import venv

ROOT = Path(__file__).resolve().parent


def setup():
    if sys.version_info < (3, 12):
        raise SystemExit("Use Python 3.12 or newer (verified with 3.12).")
    npm = shutil.which("npm.cmd" if sys.platform == "win32" else "npm")
    if not npm:
        raise SystemExit("Install Node.js (Vite-compatible; verified here with Node 25), then rerun setup.")
    environment = ROOT / ".venv"
    python = environment / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
    if not python.is_file():
        print("Creating the project-local Python environment…", flush=True)
        venv.create(environment, with_pip=True)
    subprocess.run([str(python), "-m", "pip", "install", "-r", str(ROOT / "requirements.txt")], check=True)
    subprocess.run([npm, "ci", "--no-fund"], cwd=ROOT / "frontend", check=True)
    subprocess.run([npm, "run", "build"], cwd=ROOT / "frontend", check=True)
    print("Setup complete. Run: python launch.py", flush=True)


if __name__ == "__main__":
    setup()
