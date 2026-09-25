# Mera Ghar

**Live:** https://apoorvagramle.github.io

A walk-through 3D voxel house that tells my story: work, art, music, coffee, sunsets. It covers everything I do for a living and for fun, and it ends on the obvious conclusion: jack of all trades, master of none.

Built by Apoorva Gramle, a full-stack engineer who also designs things.

## What's inside

- **The house:** modelled in Blender as voxels and exported as one glTF file (`MeraGHAR.glb`).
- **The walkthrough:** plain Three.js with ES modules, with no build step.
  - Click-to-move with A* pathfinding.
  - BVH collision (three-mesh-bvh).
  - Doors, seats, a stairs ride, and a desktop you can boot.
  - Stars to collect, and small interactions in every room.

## Layout

```
index.html         → redirects to web/
web/               the app (index.html, src/, vendor/)
MeraGHAR.glb       the house model, loaded by web/ as ../MeraGHAR.glb
Sound Effect/      audio, loaded as ../Sound%20Effect/...
Apoorva's_Resume.pdf
```

## Run locally

Serve the repo root with any static server and open `/web/`:

```
python -m http.server 8010
# http://localhost:8010/web/
```
