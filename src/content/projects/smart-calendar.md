---
title: Smart Calendar
summary: Building a CLI tool that aggregates class schedules and deadlines from multiple sources into one place, with a Flask web interface for phone input.
stack: [Python, Flask]
status: in progress
role: Designed the data model, wrote the schedule parsing and CLI formatting, directed the overall tool structure.
ai_note: AI writes the Flask route boilerplate. Schedule parsing and CLI output formatting I wrote myself. The AI kept introducing class hierarchies and abstractions the tool doesn't need.
links: []
media: []
order: 4
featured: false
---

## Problem

My class schedule, deadlines, and assignments live in five different places. I wanted one command to tell me what's due this week.

## What I built

A terminal tool that reads from a local data store and prints today's schedule and upcoming deadlines. A Flask page takes phone input for the same data store.

## Constraints

Personal tool, so no budget, no deadline, no user other than me. That made it easy to over-engineer. I had to keep pulling it back to what I'd actually use daily.
