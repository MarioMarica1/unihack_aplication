"""Build the local STPT routing graph from the public SMTT GTFS ZIP."""
import csv
import io
import json
import sys
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path


FEED = "https://smtt.ro/transit/gtfs/maps/smtt-timisoara-ro.zip"
OUTPUT = Path(__file__).resolve().parents[1] / "public/data/stpt-network.json"
TYPES = {"0": "tram", "3": "bus", "11": "trolleybus"}


def rows(feed, name):
    with feed.open(f"{name}.txt") as file:
        return list(csv.DictReader(io.TextIOWrapper(file, encoding="utf-8-sig")))


def project_stops(points, stops):
    """Choose the closest ordered positions along the actual trip shape."""
    previous = [0.0] * len(points)
    back = []
    for lon, lat in stops:
        best = 0
        costs = []
        predecessors = []
        for index, (x, y) in enumerate(points):
            if previous[index] < previous[best]:
                best = index
            predecessors.append(best)
            costs.append(previous[best] + ((x - lon) * 0.7) ** 2 + (y - lat) ** 2)
        back.append(predecessors)
        previous = costs
    index = min(range(len(points)), key=previous.__getitem__)
    result = []
    for predecessors in reversed(back):
        result.append(index)
        index = predecessors[index]
    return result[::-1]


def build(feed):
    routes = {row["route_id"]: row for row in rows(feed, "routes") if row["route_type"] in TYPES}
    trips = {row["trip_id"]: row for row in rows(feed, "trips") if row["route_id"] in routes}
    times, shapes = defaultdict(list), defaultdict(list)
    for row in rows(feed, "stop_times"):
        if row["trip_id"] in trips:
            times[row["trip_id"]].append(row)
    for row in rows(feed, "shapes"):
        shapes[row["shape_id"]].append(row)
    shapes = {
        key: [[round(float(row["shape_pt_lon"]), 6), round(float(row["shape_pt_lat"]), 6)]
              for row in sorted(shape, key=lambda row: int(row["shape_pt_sequence"]))]
        for key, shape in shapes.items()
    }
    all_stops = {
        row["stop_id"]: {"name": row["stop_name"], "lon": float(row["stop_lon"]), "lat": float(row["stop_lat"])}
        for row in rows(feed, "stops")
    }
    stops, stop_indexes, patterns, seen = [], {}, [], set()
    for trip_id, trip in trips.items():
        shape = shapes.get(trip["shape_id"], [])
        route = routes[trip["route_id"]]
        line = route["route_short_name"]
        sequence = sorted(times[trip_id], key=lambda row: int(row["stop_sequence"]))
        stop_ids = tuple(row["stop_id"] for row in sequence)
        if not line or len(shape) < 2 or len(stop_ids) < 2 or any(stop not in all_stops for stop in stop_ids):
            continue
        direction = trip["trip_headsign"] or all_stops[stop_ids[-1]]["name"]
        restrictions = tuple((row.get("pickup_type"), row.get("drop_off_type")) for row in sequence)
        key = (trip["route_id"], trip["shape_id"], direction, stop_ids, restrictions)
        if key in seen:
            continue
        seen.add(key)
        positions = project_stops(shape, [(all_stops[stop]["lon"], all_stops[stop]["lat"]) for stop in stop_ids])
        entries = []
        for stop_id, position, (pickup, dropoff) in zip(stop_ids, positions, restrictions):
            if stop_id not in stop_indexes:
                stop_indexes[stop_id] = len(stops)
                stops.append(all_stops[stop_id])
            entries.append([stop_indexes[stop_id], position, int(pickup != "1"), int(dropoff != "1")])
        patterns.append({"line": line, "type": TYPES[route["route_type"]], "direction": direction,
                         "shape": shape, "stops": entries})
    info = rows(feed, "feed_info")[0]
    return {"version": info["feed_version"], "validFrom": info["feed_start_date"], "validTo": info["feed_end_date"],
            "stops": stops, "patterns": patterns}


if __name__ == "__main__":
    if len(sys.argv) > 1:
        archive = Path(sys.argv[1]).read_bytes()
    else:
        with urllib.request.urlopen(FEED, timeout=30) as response:
            archive = response.read()
    with zipfile.ZipFile(io.BytesIO(archive)) as feed:
        network = build(feed)
    OUTPUT.write_text(json.dumps(network, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(network['stops'])} stops, {len(network['patterns'])} patterns, GTFS {network['version']}")
