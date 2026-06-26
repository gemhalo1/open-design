---
name: od-social-card
description: Default social-card scenario for X, Threads, LinkedIn, Instagram stories, Rednote, WeChat covers, and multi-platform social visuals.
triggers:
  - social card
  - carousel
  - X card
  - LinkedIn card
  - 小红书
  - 公众号封面
od:
  scenario: social-card
  mode: social-card
---

# Social Card Scenario

Create export-ready social frames as a single HTML artifact. The output must be inspectable in-browser and ready to export/capture as static images.

## Workflow

1. Read `assets/template.html` and `references/layouts.md`.
2. Choose the closest platform/layout contract from the inputs.
3. Produce the exact frame count needed by the brief. Default: 1 frame for post/quote/data, 4 frames for carousel, 2 frames for WeChat cover pair.
4. Keep copy short, specific, and crop-safe.
5. Check `references/checklist.md`.

## Hard Rules

- Respect platform ratio and safe area.
- One main message per frame.
- Use strong typography and simple composition before decoration.
- Avoid generic AI gradients, blob backgrounds, and vague marketing copy.
- Include export-size comments in the HTML for each frame.
