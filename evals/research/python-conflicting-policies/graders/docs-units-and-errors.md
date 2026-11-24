---
type: regex
target: { source: file, path: geotools/distance.py }
pattern: "def great_circle_km\\([^()]*\\)(?: -> [^\\n:]+)?:\\n    \"\"\"[\\s\\S]*?(?:km|kilomet)[\\s\\S]*?ValueError[\\s\\S]*?\"\"\""
---
