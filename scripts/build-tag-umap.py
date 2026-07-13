#!/usr/bin/env python3
"""
Embed site tags with a local MiniLM model, project with UMAP, cluster into
islands named by top tags, write src/data/tag-umap.json.

Usage: python3 scripts/build-tag-umap.py
"""
from __future__ import annotations

import json
import math
import random
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import yaml
from sentence_transformers import SentenceTransformer
from sklearn.cluster import AgglomerativeClustering
from umap import UMAP

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "src" / "content"
OUT = ROOT / "src" / "data" / "tag-umap.json"
MODEL = "sentence-transformers/all-MiniLM-L6-v2"

FM_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)


def kind_from_path(path: Path) -> str:
    top = path.relative_to(CONTENT).parts[0]
    if top in {"papers", "interesting-papers", "projects", "posters"}:
        return "research"
    if top == "collaborators":
        return "collaborators"
    if top in {"conferences", "prizes", "experience"}:
        return "cv"
    return "research"


def href_for_tag(tag: str, kind: str) -> str:
    from urllib.parse import quote

    q = quote(tag)
    if kind == "collaborators":
        return f"/collaborators/?tag={q}"
    if kind == "cv":
        return f"/cv/?tag={q}"
    return f"/research/?tag={q}"


def collect_tags():
    counts: dict[str, int] = defaultdict(int)
    kinds: dict[str, set[str]] = defaultdict(set)
    for path in CONTENT.rglob("*.md"):
        text = path.read_text(encoding="utf-8")
        m = FM_RE.match(text)
        if not m:
            continue
        try:
            data = yaml.safe_load(m.group(1)) or {}
        except yaml.YAMLError:
            continue
        tags = data.get("tags") or []
        if not isinstance(tags, list):
            continue
        kind = kind_from_path(path)
        for raw in tags:
            tag = str(raw).strip()
            if not tag:
                continue
            counts[tag] += 1
            kinds[tag].add(kind)

    rows = []
    for tag, count in counts.items():
        kset = kinds[tag]
        preferred = (
            "research"
            if "research" in kset
            else "collaborators"
            if "collaborators" in kset
            else "cv"
            if "cv" in kset
            else "research"
        )
        rows.append(
            {
                "tag": tag,
                "count": count,
                "href": href_for_tag(tag, preferred),
            }
        )
    rows.sort(key=lambda r: (-r["count"], r["tag"]))
    return rows


def palette(n: int):
    base = [
        "#0F766E",
        "#B45309",
        "#1D4ED8",
        "#9F1239",
        "#3F6212",
        "#0E7490",
        "#A16207",
        "#334155",
    ]
    return [base[i % len(base)] for i in range(n)]


def name_island(indices, tags):
    ranked = sorted(
        (tags[i] for i in indices),
        key=lambda t: (-t["count"], t["tag"]),
    )
    return " · ".join(t["tag"] for t in ranked[:3])


def main():
    tags = collect_tags()
    if len(tags) < 3:
        raise SystemExit("Need at least 3 tags to build a UMAP.")

    print(f"Embedding {len(tags)} tags with {MODEL}…")
    model = SentenceTransformer(MODEL)
    texts = [t["tag"] for t in tags]
    embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=True)

    n_neighbors = max(2, min(8, len(tags) // 3))
    print(f"UMAP (n_neighbors={n_neighbors})…")
    reducer = UMAP(
        n_neighbors=n_neighbors,
        n_components=2,
        min_dist=0.15,
        spread=1.2,
        metric="cosine",
        random_state=42,
    )
    coords = reducer.fit_transform(embeddings)

    # Normalize to [0, 1]
    mins = coords.min(axis=0)
    spans = np.maximum(coords.max(axis=0) - mins, 1e-9)
    pad = 0.06
    normalized = pad + (coords - mins) / spans * (1 - 2 * pad)

    n_clusters = int(min(8, max(3, round(math.sqrt(len(tags))))))
    print(f"Clustering into ~{n_clusters} islands…")
    clustering = AgglomerativeClustering(
        n_clusters=n_clusters,
        metric="euclidean",
        linkage="ward",
    )
    labels = clustering.fit_predict(normalized)

    islands = []
    colors = palette(n_clusters)
    for cid in range(n_clusters):
        members = [i for i, lab in enumerate(labels) if lab == cid]
        cx = float(np.mean([normalized[i, 0] for i in members]))
        cy = float(np.mean([normalized[i, 1] for i in members]))
        islands.append(
            {
                "id": cid,
                "label": name_island(members, tags),
                "color": colors[cid],
                "size": len(members),
                "x": cx,
                "y": cy,
            }
        )
    islands.sort(key=lambda i: -i["size"])

    # Re-map ids after sort for stable display? Keep original cluster ids for points.
    points = [
        {
            "tag": t["tag"],
            "count": t["count"],
            "href": t["href"],
            "x": float(normalized[i, 0]),
            "y": float(normalized[i, 1]),
            "cluster": int(labels[i]),
        }
        for i, t in enumerate(tags)
    ]

    # Log nearest to IBD if present
    try:
        ibd_idx = next(i for i, t in enumerate(tags) if t["tag"].lower() == "ibd")
        sims = embeddings @ embeddings[ibd_idx]
        order = np.argsort(-sims)
        near = [
            f"{tags[j]['tag']} ({sims[j]:.3f})"
            for j in order
            if j != ibd_idx
        ][:5]
        print(f"Nearest to “IBD”: {', '.join(near)}")
    except StopIteration:
        pass

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "model": MODEL,
        "method": "umap + agglomerative (2d)",
        "islands": islands,
        "points": points,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(points)} points / {len(islands)} islands → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    random.seed(42)
    main()
