import argparse
import os
from pathlib import Path

import uvicorn

from woc_osm.geometry import REPO

parser = argparse.ArgumentParser(description="Run World Studio on localhost only")
parser.add_argument("--data", type=Path, default=REPO / "build/osm-input")
parser.add_argument("--workspace", type=Path, default=REPO / "build/world-studio")
parser.add_argument("--port", type=int, default=8000)
args = parser.parse_args()
os.environ["WOC_STUDIO_DATA"] = str(args.data.resolve())
os.environ["WOC_STUDIO_WORKSPACE"] = str(args.workspace.resolve())
os.environ["WOC_STUDIO_PORT"] = str(args.port)
uvicorn.run("studio.app:app", host="127.0.0.1", port=args.port, log_level="info")
