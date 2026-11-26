"""Export the AI service OpenAPI contract to docs/ai-service.openapi.json."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from app.config import Settings
from app.main import create_app

out = Path(sys.argv[1] if len(sys.argv) > 1 else "../docs/ai-service.openapi.json")
spec = create_app(Settings(env="test")).openapi()
out.write_text(json.dumps(spec, indent=2) + "\n")
print(f"wrote {out} ({len(spec['paths'])} paths)")
