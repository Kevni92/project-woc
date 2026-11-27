import argparse
import json
from pathlib import Path
import sys

from .geometry import REPO, ImportFailure, load_json
from .importer import import_world


def main():
    parser = argparse.ArgumentParser(description="Generate a playable WOC world from local OSM data.")
    parser.add_argument("--pbf", type=Path, required=True)
    parser.add_argument("--land", type=Path, required=True, help="WGS84 GeoJSON from a documented land polygon source")
    parser.add_argument("--aoi", type=Path, required=True, help="WGS84 GeoJSON Polygon")
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True, help="New world directory; parent must exist")
    parser.add_argument("--native", type=Path, default=REPO / "build/native" / ("woc_cli.exe" if sys.platform == "win32" else "woc_cli"))
    parser.add_argument("--node", default="node")
    parser.add_argument("--report", type=Path, help="Optional diagnostic and timing JSON outside the package")
    args = parser.parse_args()
    report = {}
    try:
        if args.report and (args.report.resolve().is_relative_to(args.output.resolve())
                            or args.report.resolve() in [path.resolve() for path in (args.pbf, args.land, args.aoi, args.config)]):
            raise ImportFailure("The report must be outside the package and input paths")
        import_world(args.pbf, args.land, load_json(args.aoi), load_json(args.config), args.output,
                     args.native, args.node, lambda phase: print(phase, file=sys.stderr, flush=True), report)
    except (ImportFailure, OSError, ValueError) as error:
        print(error, file=sys.stderr)
        result = 1
    else:
        result = 0
    if report:
        data = json.dumps(report, ensure_ascii=True, indent=2) + "\n"
        if args.report:
            args.report.write_text(data, encoding="utf-8")
        else:
            print(data, end="")
    return result


if __name__ == "__main__":
    sys.exit(main())
