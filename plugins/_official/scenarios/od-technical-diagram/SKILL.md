---
name: od-technical-diagram
description: Default diagram scenario for architecture, workflow, RAG/agent, UML, data-flow, comparison, and infographic diagrams.
triggers:
  - diagram
  - architecture diagram
  - flow chart
  - UML
  - data flow
  - 信息图表
  - 架构图
od:
  scenario: technical-diagram
  mode: diagram
---

# Technical Diagram Scenario

Create a polished, editable SVG/HTML diagram. The output should explain a system, process, or comparison clearly enough for product and engineering readers.

## Workflow

1. Read `assets/template.html` and `references/patterns.md`.
2. Choose the diagram grammar that matches `diagramType`.
3. Name every important node and edge. Do not leave generic labels like "Service" unless the user gave no better source.
4. Use visual grouping, legends, and arrow styles to distinguish semantics.
5. Verify against `references/checklist.md`.

## Hard Rules

- Prefer SVG for the diagram body.
- Use semantic labels on arrows.
- Keep node count readable; summarize or group instead of cramming.
- Make the diagram editable by using normal SVG/text, not raster screenshots.
