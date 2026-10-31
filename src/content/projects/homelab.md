---
title: Homelab
summary: Set up and maintain a self-hosted Linux server running 8+ containerised services, managed over SSH from any device on my Tailscale network.
stack: [Docker, Linux, Bash, SSH, Tailscale]
status: in progress
role: Designed the container layout, wrote Bash CLI tools for remote monitoring, configured the reverse proxy and networking.
ai_note: AI drafted the initial docker-compose files. Networking, volume mounts, and reverse proxy config I worked out myself. Generated configs kept conflicting or using deprecated syntax.
links: []
media: []
order: 2
featured: false
---

## Problem

I wanted full control over my own data: photo backup, cloud storage, media streaming. No cloud subscriptions, no third-party access. I also wanted to manage and monitor everything from my phone or any laptop.

## What I built

A Linux server running 8+ Docker services: photo backup, cloud storage, media streaming, private search, automation, and a few others.

I wrote custom Bash CLI tools to check service status, restart containers, and view logs over SSH. Everything is reachable through a Tailscale network, so I don't need to expose ports to the internet.

## Constraints

Student budget. Hardware I already had. Stability mattered more than features. If it went down at 3am I needed it to recover on its own or be fixable from my phone.
