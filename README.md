# ⚡ Flowlet — AI-Native Workflow Automation Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Next.js 14](https://img.shields.io/badge/Next.js-14-black?logo=nextdotjs)](https://nextjs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.0+-000000?logo=fastify)](https://fastify.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql)](https://postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7.0+-DC382D?logo=redis)](https://redis.io/)
[![BullMQ](https://img.shields.io/badge/BullMQ-Worker_Queue-8B5CF6)](https://docs.bullmq.io/)

> **"Automations that can actually think."**

Flowlet is a highly-concurrent, multi-tenant AI workflow automation engine. Users visually compose pipelines (`Trigger` $\rightarrow$ `Action` $\rightarrow$ `AI-Step` $\rightarrow$ `Branch`) on a node-based canvas, enabling complex data classification, extraction, and branching logic. It runs reliably at volume without the steep per-task costs of Zapier or Make.

🔗 **Live Demo:** [flowlet-automate.vercel.app](http://flowlet-automate.vercel.app/)  
👨‍💻 **Developer Portfolio:** [portfolio-shayan-hussain.vercel.app](https://portfolio-shayan-hussain.vercel.app/)

---

## 📑 Table of Contents
- [Key Features](#-key-features)
- [Production Performance Benchmarks](#-production-performance-benchmarks)
- [System Architecture](#-system-architecture)
- [Tech Stack](#-tech-stack)
- [Getting Started (Local Setup)](#-getting-started-local-setup)
- [Environment Variables](#-environment-variables)
- [Node Reference](#-node-reference)
- [License](#-license)

---

## ✨ Key Features

- 🛡️ **3-Layer Idempotency Guarantee:** Prevents duplicate runs and double-executions during webhook storms. Enforced via webhook idempotency tokens, atomic Postgres transitions (`pending` $\rightarrow$ `queued`), and deduplication ledgers.
- ⚡ **AI Semantic Caching:** A Redis-backed output cache that intercepts identical LLM queries to completely eliminate redundant API token costs.
- 🎨 **Visual Node Builder:** An interactive React Flow canvas allowing drag-and-drop creation of complex Directed Acyclic Graphs (DAGs) for automations.
- 🎯 **Crash-Safe Fairness Leases:** Ensures no single heavy-usage tenant starves the worker pool. Implemented using Redis concurrency leases and BullMQ sandboxed job processors.
- 🚨 **Decoupled Worker Architecture:** Ingestion (Fastify API) runs in $O(1)$ time, immediately returning HTTP 200s, while heavy DAG traversal, HTTP calls, and LLM reasoning are offloaded to asynchronous background BullMQ workers.
- 🔄 **Multi-Tenant Rate Limiting:** Edge Nginx limits (50 req/s) paired with application-level per-workspace LLM budget tracking to prevent runaway automation loops.

---

## 📊 Production Performance Benchmarks

Calculated via automated load-testing artifacts (`packages/loadtest`) running against the production deployment:

| Metric | Measured Value | Engineering Significance |
| :--- | :--- | :--- |
| **Enqueue Latency (p95)** | **~20 ms** | Flat, $O(1)$ ingestion speed regardless of worker load |
| **Sustained Throughput** | **96 req/sec** | Capable of seamlessly absorbing major webhook spikes |
| **Burst Drain Speed** | **500 runs in < 14s** | Handled 500 concurrent trigger bursts with zero dropped jobs |
| **Duplicate Execution Rate**| **0.0%** | Guaranteed exactly-once processing under heavy concurrency |
| **AI Token Cost Reduction** | **Up to 100%** | For redundant inputs via exact prompt hashing semantic cache |

---

## 🏗️ System Architecture

```mermaid
graph TD
    Client([User / Webhook]) -->|HTTP Trigger| Web[Next.js 14 App / API]
    Client -->|Dashboard UI| Web
    
    Web -->|Create/Update Workflows| API[Fastify Engine API]
    Web -->|Proxy Executions| API
    
    API <-->|Transaction / Validation| DB[(PostgreSQL)]
    API -->|O(1) Enqueue| RedisQueue[(Redis BullMQ Queue)]
    
    RedisQueue -->|Consume Runs| Worker[Node.js DAG Worker Pool]
    
    Worker <-->|State & Tracing| DB
    Worker <-->|Concurrency & Rate Limits| RedisCache[(Redis Cache & Leases)]
    Worker -->|AI Step| LLM([Google Gemini API])
    Worker -->|HTTP Node| ExternalAPI([External Services])
```

### Request Flow Overview
1. **Ingestion (Trigger):** A webhook hits the Fastify API. The API validates the idempotency key, inserts a `workflow_runs` row into Postgres as `pending`, and drops the job onto the Redis queue in $O(1)$ time.
2. **Worker Pool (Traversal):** The BullMQ worker picks up the job. It traverses the DAG level-by-level, executing nodes concurrently where possible.
3. **Execution Isolation:** "Fast" steps (HTTP, Transform) run in one concurrency pool, while "Slow" steps (AI) execute in a separate pool to prevent head-of-line blocking.
4. **Resiliency:** If a worker crashes mid-step, BullMQ's stalled job tracker reclaims it. The system's idempotency ensures external APIs aren't double-called.

---

## 🛠️ Tech Stack

- **Frontend / Builder:** Next.js 14 (App Router), React Flow, TailwindCSS, Base UI, Lucide Icons
- **Backend API:** Fastify, TypeScript, Drizzle ORM
- **Engine / Workers:** Node.js, BullMQ, Redis
- **Databases:** PostgreSQL 16 (Relational state), Redis 7 (Queues, Leases, Caching)
- **Deployment:** Vercel (Frontend), Render (API & Background Worker)

---

## 🚀 Getting Started (Local Setup)

### Prerequisites
- Node.js 20+
- Docker & Docker Compose (for local Postgres & Redis)
- A Google Gemini API Key (for AI nodes)

### 1. Clone the repository
```bash
git clone https://github.com/SShayanHussain/flowlet.git
cd flowlet
```

### 2. Install dependencies
```bash
npm install
```

### 3. Start local infrastructure (Database & Redis)
```bash
docker-compose up -d
```

### 4. Setup Environment Variables
Copy the example environment files into `.env` for the workspace roots:
```bash
cp web/.env.example web/.env.local
cp api/.env.example api/.env
cp packages/worker/.env.example packages/worker/.env
```
*Ensure you fill in `GEMINI_API_KEY` in the worker `.env` file.*

### 5. Run Database Migrations
```bash
npm run db:migrate -w @flowlet/api
```

### 6. Start the Development Servers
Open three separate terminal tabs and start the services:
```bash
# Terminal 1: Start the Next.js Frontend (Port 3000)
npm run dev -w web

# Terminal 2: Start the Fastify API Engine (Port 8080)
npm run dev -w @flowlet/api

# Terminal 3: Start the BullMQ Execution Worker
npm run dev -w @flowlet/worker
```

---

## 📖 Node Reference

Flowlet provides modular nodes to build your DAG:

- **Trigger:** Entry point (Webhook or Cron).
- **HTTP Request:** Fire GET/POST/PUT/DELETE requests to any external API.
- **Transform:** Write sandboxed, synchronous JavaScript to mutate JSON payloads mid-flight.
- **AI Step:** Prompt an LLM with strict JSON schema enforcement to parse, extract, or route unstructured text.
- **Branch:** Visually route execution paths based on evaluated JS conditions.
- **Output:** Terminate a synchronous webhook trigger with a custom HTTP response payload.

*(Full documentation available in the Dashboard `/docs` route).*

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
