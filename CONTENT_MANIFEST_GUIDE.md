# Dynamic content manifest — v1.6

The v1.6 APK can discover new KieranBall courses and new flashcard folders from Vercel without rebuilding the APK.

## Add KieranBall Course 16

1. Put the JSON file at:

`public/content/kieranBall/course16.json`

2. Add this object to `courses` in `public/content/manifest.json`:

```json
{
  "id": "course16",
  "type": "kieranBall",
  "title": "Course 16 - KieranBall",
  "version": 1,
  "cardCount": 500,
  "youtubeUrl": "https://youtu.be/REPLACE_ME",
  "url": "/content/kieranBall/course16.json"
}
```

3. Increase the top-level `contentVersion`, commit and push. Vercel redeploys. The existing APK refreshes the manifest and Course 16 appears in **French - KieranBall**.

## Add a completely new folder, e.g. Building Structure 1–10

Create files:

```
public/content/buildingStructure/1.json
public/content/buildingStructure/2.json
...
public/content/buildingStructure/10.json
```

Each file should use the normal flashcard schema:

```json
[
  { "eng": "example", "fre": "exemple" }
]
```

Then add a `sections` entry:

```json
{
  "id": "building-structure",
  "title": "Building Structure",
  "icon": "🏗️",
  "description": "Build French sentence structure step by step.",
  "type": "folder",
  "children": [
    {
      "id": "building-1",
      "title": "Building Structure 1",
      "type": "flashcards",
      "version": 1,
      "cardCount": 50,
      "url": "/content/buildingStructure/1.json"
    }
  ]
}
```

Add children 2–10 the same way. Increase `contentVersion`, push, and Vercel redeploys.

The Home screen discovers the new section automatically. Its children use the generic level/practice screens and are cached in SQLite after download.

## Updating existing content

When you replace a JSON file, increase **that item's `version`** and also increase top-level `contentVersion`.

Example:

`building-4 version 1 -> 2`

The APK sees the higher version, downloads the new JSON and updates its SQLite cache. No APK rebuild is needed.

## What still requires an APK rebuild?

New data does not. New functionality does. Examples requiring a new APK: camera features, a new exercise interaction, another native permission, or a new Android integration.
