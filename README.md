# POS Tax VAT System - Frontend

A modern React frontend for the POS Tax VAT System with a clean, professional UI.

## Tech Stack

- **React 18** - UI library
- **Vite** - Build tool and dev server
- **TailwindCSS** - Styling
- **React Router** - Navigation
- **Axios** - HTTP client
- **Recharts** - Charts and visualizations
- **Lucide React** - Icons

## Features

- **Dashboard** - Overview with key metrics, recent transactions, and payment method breakdown
- **Transactions** - List all transactions with pagination and search
- **Search** - Advanced search with multiple filters (customer, date, status, type, etc.)
- **Reports** - Revenue trends, payment distribution, cashier performance charts
- **Settings** - API configuration, database settings, notifications, VAT configuration

## Installation

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

## Development

Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

The API proxy forwards `/api` requests to `http://localhost:8082` by default. The POS API client adds `/api/v1/pos` as its base path.

## Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── Layout.jsx          # Main layout with sidebar
│   │   └── ui/                 # Reusable UI components
│   │       ├── button.jsx
│   │       ├── card.jsx
│   │       ├── input.jsx
│   │       └── table.jsx
│   ├── lib/
│   │   ├── api.js              # API client with all endpoints
│   │   └── utils.js            # Utility functions
│   ├── pages/
│   │   ├── Dashboard.jsx       # Dashboard with metrics
│   │   ├── Transactions.jsx    # Transaction list
│   │   ├── Search.jsx          # Advanced search
│   │   ├── Reports.jsx         # Reports with charts
│   │   ├── FiscalReports.jsx   # Fiscal submission register
│   │   ├── FiscalReceiptDetail.jsx # Fiscal receipt/submission details
│   │   └── Settings.jsx        # Settings page
│   ├── App.jsx                 # Main app with routing
│   ├── main.jsx                # Entry point
│   └── index.css               # Global styles
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

## API Integration

The frontend connects to the backend API at `/api/v1/pos`. All API calls are centralized in `src/lib/api.js`:

- `transactionAPI` - CRUD operations for transactions
- `searchAPI` - Search and filter transactions
- `reportsAPI` - Reports and analytics

## Payment integration mode

The BEFA-to-bank payment flow uses the backend HTTP integration by default. Payment previews and executions are sent to the configured backend; a payment is not reported successful from a local fixture. To explicitly run a local simulation, set `VITE_PAYMENT_INTEGRATION_MODE=fixtures`. Fixture mode reads the request from `public/mock-api/befa-payment.json` and the response from `public/mock-api/bank-payment-response.json`, then saves simulated transactions in browser local storage. Demo history does not sync to the POS backend.

The BEFA/bank mode and endpoint paths are centralized in `src/lib/api.js`. HTTP integration is the default; set `VITE_PAYMENT_INTEGRATION_MODE=fixtures` only when explicitly running a local simulation. Optional `VITE_BEFA_PAYMENT_URL`, `VITE_BANK_PAYMENT_URL`, and `VITE_BANK_HEALTH_URL` values override its request, execute, and health URLs. `VITE_POS_API_BASE_URL` overrides the POS API base URL. POS transaction, search, and report requests use the backend by default, independently of the BEFA/bank mode. Set `VITE_POS_DATA_MODE=fixtures` only when you want those screens to use browser-local demo history instead. The current default live bank routes remain `POST /api/v1/bank-payments/execute` and `GET /api/v1/bank-payments/health`.

The standalone **Upload test transaction data** page (`/mock-transaction-files`) lets each signed-in user edit and save private PURCHASE and SALE fixture JSON files. The fixture-profile-only backend stores them under `payment.fixture.user-upload-dir` (default `./uploads/test-transaction-data`), using a private per-user directory and separate `purchase.json` / `sale.json` files. Fixture-mode payments read the authenticated user's saved fixture; before a user saves one, the configured BEFA fixture is used as the default. The shared bank response fixture and non-fixture payment services are unchanged. Configure `PAYMENT_FIXTURE_UPLOAD_DIR` to point to a persistent mounted directory on cloud hosts; otherwise uploads may be lost when an instance restarts or is redeployed.

The existing POS endpoint paths, methods, and query parameter names are retained in `API_ENDPOINTS` in `src/lib/api.js`:

| Area | Method and route |
| --- | --- |
| Transactions | `POST /transactions/purchase`, `POST /transactions/pre-auth`, `GET /transactions`, `GET /transactions/pending`, `GET /transactions/{id}`, and `POST /transactions/{id}/{capture\|refund\|reverse}` |
| Search | `GET /search/transactions`, `/search/fulltext`, `/search/customer-name`, `/search/customer-tin`, `/search/amount-range`, `/search/payment-method`, and `/search/recent` |
| Related transactions | `GET /search/refunds/{id}`, `/search/reversals/{id}`, and `/search/children/{id}` |
| Reports | `GET /reports/revenue`, `/vat`, `/service-fees`, `/refunds`, `/cashier-performance`, `/payment-method-breakdown`, `/daily-summary`, `/monthly-summary`, `/transaction-stats`, `/hourly-volume`, `/average-transaction-value`, `/gross-vs-net`, `/refund-rate`, `/top-cashiers`, `/top-registers`, `/financial-audit`, `/fiscal-submissions`, and `/fiscal-submissions/{taxTransactionId}` |

Paginated responses are normalized to `content`, `totalElements`, `totalPages`, and `page` for the amended list screens. Report list responses are normalized to arrays. Confirm backend field names and financial units with the service. Update the HTTP adapter in `bankPaymentAPI.execute` if the bank service requires a different method, authentication, or payload. Do not put private API secrets in this browser application; use an authenticated backend or secure token flow.

The fixture amount values are treated as whole UGX amounts by the frontend. Currency formatting is centralized in `src/lib/format.js` and should be changed if the backend uses another currency or stores amounts in minor units.

## Customization

### Colors

Edit `tailwind.config.js` to customize the color scheme.

### API URL

Edit `vite.config.js` to change the backend API proxy target.

### Navigation

Add new pages by:
1. Creating a new component in `src/pages/`
2. Adding a route in `src/App.jsx`
3. Adding a nav item in `src/components/Layout.jsx`
