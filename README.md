# 💬 Chatbot template

A simple Streamlit app that shows how to build a chatbot using OpenAI's GPT-3.5.

[![Open in Streamlit](https://static.streamlit.io/badges/streamlit_badge_black_white.svg)](https://chatbot-template.streamlit.app/)

### How to run it on your own machine

1. Install the requirements

   ```
   $ pip install -r requirements.txt
   ```

2. Run the app

   ```
   $ streamlit run streamlit_app.py
   ```
## Getting Started

### Prerequisites
- Node 20+ (or 22)
- Git
- OpenSSL (the one bundled with Git for Windows is fine)
- PostgreSQL (managed by Supabase)

### 1) Clone and install
\\\powershell
git clone https://github.com/Afunian/chatbot.git
cd chatbot\packages\ingest
npm ci
\\\

### 2) Environment
Copy the template and fill in real values:

\\\powershell
# repo root
copy .\.env.example .\.env
\\\

Required vars (in repo-root .env):
- **SUPABASE_DB_URL** — e.g. postgresql://postgres:<URL_ENCODED_PASSWORD>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require
- **SSL_CA_PEM_PATH** — e.g. C:\certs\supabase-root-2021.pem

Tip: URL-encode passwords  
PowerShell:
\\\powershell
 = [System.Uri]::EscapeDataString('PlainPassword!$@')
\\\

### 3) TLS trust (Windows)
Download/keep the **Supabase Root 2021 CA** at:
\C:\certs\supabase-root-2021.pem\

### 4) Run DB checks / migrations
\\\powershell
cd C:\dentistrygpt\packages\ingest

# Connectivity/status
node .\src\db-status.mjs

# Migrations (runner auto-loads C:\dentistrygpt\.env)
npm run migrate            # runs migrations\001_init.sql
npm run migrate -- 002_add_fks.sql
npm run migrate -- 003_indexes.sql
npm run migrate -- 004_seed.sql
\\\

### 5) Useful scripts
- \
ode .\src\test-db.mjs\ — quick connection check  
- \
ode .\src\seed-smart.mjs\ — schema-aware seed  
- \
pm run migrate -- <file.sql>\ — run a specific migration by name or path  
  (Override folder per run: \$env:MIGRATIONS_DIR="C:\dentistrygpt\migrations"\)

### Troubleshooting
- **28P01 password authentication failed** → Check \SUPABASE_DB_URL\ user/password; if unsure, reset DB password in Supabase and update .env.
- **UNABLE_TO_VERIFY_LEAF_SIGNATURE** → Ensure \SSL_CA_PEM_PATH\ points to supabase-root-2021.pem.
- **Migration not found** → Confirm the file path or set \MIGRATIONS_DIR\.
