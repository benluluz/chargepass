# ⚡ ChargePass

**EV charging spot handoff app for the Herzliya Microsoft campus.**

No more WhatsApp flooding. Drivers who are leaving post their spot, colleagues ping them for it, and confirmed handoffs earn credit points that can be spent on notifications.

---

## How it works

1. **Post a departure** — "I'm leaving spot 5248 in ~15 min"
2. **Ping for the spot** — interested drivers tap "I Want This Spot"
3. **Accept a ping** — the leaver picks one person via My Activity (optional, first-come otherwise)
4. **Confirm the handoff** — incoming driver taps "I Got the Spot!" once they arrive
5. **Earn credits** — the leaver gets +5 ⚡ points, improving their queue priority for next time

---

## Tech stack

| Layer | Service | Cost |
|---|---|---|
| Hosting + API | Azure Static Web Apps (F1) | Free |
| Database | Azure Cosmos DB (free tier) | Free |
| Auth | Azure Static Web Apps built-in Entra ID | Free (corp accounts) |

**Total running cost: $0**

## Allowed charging spot ranges (Herzliya campus)

Posts are validated against the official charging-spot ranges:

- **Floor -5:** 5262–5246
- **Floor -4:** 4137–4121
- **Floor -3:** 3119–3103
- **Floor -2:** 2040–2054

---

## Local development

### Prerequisites

- Node.js 18+
- [Azure Static Web Apps CLI](https://github.com/Azure/static-web-apps-cli): `npm install -g @azure/static-web-apps-cli`
- [Azure Functions Core Tools v4](https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local): `npm install -g azure-functions-core-tools@4`
- An Azure Cosmos DB account (or use the [emulator](https://learn.microsoft.com/en-us/azure/cosmos-db/local-emulator))

### Setup

```bash
# 1. Install frontend dependencies
npm install

# 2. Install API dependencies
cd api && npm install && cd ..

# 3. Configure your Cosmos DB connection string
cp api/local.settings.json.example api/local.settings.json
# Edit api/local.settings.json and set COSMOS_CONNECTION_STRING

# 4. Start with SWA CLI (handles auth simulation + proxying)
swa start --app-location . --api-location api --run "npm run dev"
```

The app will be available at `http://localhost:4280`.

> **Tip**: `swa start` simulates the `/.auth/me` endpoint so auth works locally without a real Entra ID app registration.

---

## Azure deployment

### 1. Create Azure resources

```bash
# Create a resource group
az group create --name chargepass-rg --location westeurope

# Create Cosmos DB account (free tier)
az cosmosdb create \
  --name chargepass-cosmos \
  --resource-group chargepass-rg \
  --default-consistency-level Session \
  --enable-free-tier true

# Get the connection string
az cosmosdb keys list \
  --name chargepass-cosmos \
  --resource-group chargepass-rg \
  --type connection-strings
```

### 2. Create Azure Static Web App

Either via the [Azure Portal](https://portal.azure.com) or CLI:

```bash
az staticwebapp create \
  --name chargepass \
  --resource-group chargepass-rg \
  --source https://github.com/YOUR_ORG/chargepass \
  --location westeurope \
  --branch main \
  --app-location "/" \
  --api-location "api" \
  --output-location "dist"
```

### 3. Configure app settings

In the Azure Portal → Static Web App → Configuration, add:

| Setting | Value |
|---|---|
| `COSMOS_CONNECTION_STRING` | Your Cosmos DB connection string |
| `AZURE_CLIENT_ID` | Your Entra ID app registration client ID |
| `AZURE_CLIENT_SECRET` | Your Entra ID app secret |

### 4. Configure Entra ID authentication

In `staticwebapp.config.json`, replace `YOUR_TENANT_ID` with your Microsoft tenant ID (`72f988bf-86f1-41af-91ab-2d7cd011db47` for Microsoft corp).

Register an app in [Entra ID](https://entra.microsoft.com):
- Redirect URI: `https://YOUR-SWA-NAME.azurestaticapps.net/.auth/login/aad/callback`
- Grant `User.Read` permission

---

## Project structure

```
chargepass/
├── src/                        # React frontend
│   ├── App.jsx                 # Root with auth check
│   ├── index.css               # All styles
│   ├── components/
│   │   ├── Header.jsx          # Nav + mobile bottom nav
│   │   ├── SpotCard.jsx        # Individual departure card
│   │   └── PostDepartureModal.jsx
│   ├── pages/
│   │   ├── Home.jsx            # Active spots list
│   │   ├── MyActivity.jsx      # Manage your posts + history
│   │   └── Leaderboard.jsx     # Credits ranking
│   └── hooks/
│       └── useApi.js           # Fetch wrapper
├── api/                        # Azure Functions v4 (Node.js)
│   ├── src/
│   │   ├── functions/
│   │   │   ├── departures.js       # GET/POST /api/departures
│   │   │   ├── departureActions.js # ping, accept-ping, confirm, cancel
│   │   │   └── user.js             # /api/me, /api/me/activity, /api/leaderboard
│   │   └── lib/
│   │       └── cosmos.js           # Cosmos DB client + auth helper
│   ├── host.json
│   └── package.json
├── staticwebapp.config.json    # SWA auth + routing config
├── vite.config.js
└── index.html
```

---

## Data model

### `departures` container (partitioned by `/id`)

```json
{
  "id": "uuid",
  "userId": "AAD object ID",
  "userName": "Display Name",
  "userEmail": "email@microsoft.com",
  "spotNumber": "5248",
  "etaMinutes": 15,
  "status": "available | claimed | completed | cancelled",
  "postedAt": "ISO timestamp",
  "pings": [{ "userId", "userName", "userEmail", "pinggedAt" }],
  "claimedBy": null | { "userId", "userName", "userEmail" },
  "completedAt": null | "ISO timestamp",
  "creditsEarned": null | 5
}
```

### `users` container (partitioned by `/id`)

```json
{
  "id": "AAD object ID",
  "userId": "AAD object ID",
  "userName": "Display Name",
  "userEmail": "email@microsoft.com",
  "credits": 15,
  "totalHandoffs": 3
}
```

---

## Microsoft Hackathon 2026

This project was created for the **Microsoft Global Hackathon 2026**.

**Problem**: Herzliya campus employees with EVs have no structured way to share charging spot availability. The existing WhatsApp group creates noise, misses people, and has no fairness mechanism.

**Solution**: A lightweight PWA that replaces the WhatsApp group with a structured handoff system and gamified credits to incentivise sharing behaviour.

**Impact**: 
- Reduces time spent searching for charging spots
- Eliminates unstructured WhatsApp flooding
- Creates a fair, credit-based priority system
- 100% Microsoft tech stack (Entra ID, Azure, Cosmos DB)
