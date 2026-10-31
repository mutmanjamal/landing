---
title: Sudan POS
summary: Built a multi-device restaurant POS that syncs orders live over local WiFi with no internet dependency.
stack: [Electron, WebSockets, SQLite, Node.js]
status: shipped
role: Chose the architecture, designed the database schema, debugged WebSocket sync failures and receipt printer encoding.
ai_note: AI scaffolded the Electron boilerplate and WebSocket server. I rewrote the sync and reconnection logic from scratch. The generated version didn't handle conflicts or dropped connections.
links: []
# TODO(mutman): Add a link (GitHub repo, demo video, or "Private — ask me for a walkthrough")
media: []
# TODO(mutman): Add at least one real screenshot of the manager app, waiter tablet, or kitchen display
order: 1
featured: true
---

## Problem

A restaurant in Sudan needed a POS running across multiple devices at once: manager desktop, waiter tablets, kitchen display. No internet connection required. Everything synced over local WiFi.

## What I built

An Electron desktop app for the manager (orders, menu, receipts), a web app for waiters to take orders on tablets, and a kitchen display that updates in real time. They communicate over a WebSocket server running on the manager machine. SQLite sits on each device; state syncs over the local network.

## Constraints

Offline-first by requirement. No cloud, no server outside the building. Had to work on the existing Windows machines the client already owned. Solo build.

<!-- TODO(mutman): How many devices did it run on? Rough order count during testing? Any incident worth noting (duplicate orders, printer encoding issue with Arabic text)? -->

