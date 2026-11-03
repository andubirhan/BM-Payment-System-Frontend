# POS Tax and VAT Frontend Improvement Plan

## Purpose

This plan describes how to make the frontend easier and safer to use, more consistent with common business software conventions, and more efficient as it grows. It is based on the current React/Vite frontend review. Backend behavior has not been verified, so payment payload and transaction status details must be confirmed against the backend API before implementation.

## Product goals

1. Help staff complete a payment without guessing which fields matter or whether it succeeded.
2. Make it easy to find a transaction and understand its complete status and history.
3. Show trustworthy sales and VAT figures with a clear currency and reporting period.
4. Keep interactions consistent across screens, including validation, loading, errors, and confirmation.
5. Reduce unnecessary requests and avoid loading costly code until it is needed.
6. Ensure controls that look functional really persist changes or clearly explain their purpose.

## Recommended end-to-end workflow

1. **Dashboard:** The user sees current-period totals, pending/failed payments, recent transactions, and a clear “New transaction” action. Every metric shows its date range and currency.
2. **Start payment:** The user enters or selects the BEFA reference and the relevant register and cashier. The frontend retrieves payment details where the API supports it.
3. **Review:** The user sees the customer, items, tender amounts, VAT, and total in a readable summary. The system validates required identifiers, positive amounts, date/value formats, and any supported total rules. The user confirms before execution.
4. **Execute once:** The submit action is disabled while processing. An idempotency key is created for the operation and reused for retries of that same operation. It is not silently replaced after a timeout where the payment outcome is unknown.
5. **Show outcome:** The user sees a clear settled/completed, pending, or failed outcome, the transaction reference, amount, timestamp, and an appropriate next step. Unknown or delayed outcomes provide a safe way to refresh status without initiating a second payment.
6. **Track:** The result links to a transaction detail page. The transaction list supports search, filters, pagination, and opening that detail page.
7. **Report:** A user selects a date range, applies it, and sees totals and charts for that same range. Export downloads the currently displayed report.
8. **Configure:** An authorized user changes only settings supported by the application, saves them, and receives a success or actionable error message.

## Priority and phases

### Phase 0 — Confirm contracts and product rules

**Why first:** The payment form currently exposes more data than its submit handler sends. The correct fix depends on what the backend accepts and how the payment service behaves after timeouts.

**Work**

- Document the bank payment execute request and response, including which fields are authoritative and whether the service fetches the BEFA record itself.
- Confirm whether amounts are major currency units or minor units (for example, shillings versus cents), and identify the supported currency and locale.
- Confirm transaction status values and allowed transitions, including pending reconciliation, failure, refund, reversal, and retry behavior.
- Confirm idempotency requirements: who creates the key, how long it remains valid, and how clients should handle unknown outcomes.
- Confirm what transaction detail, status refresh, search, pagination, and report export endpoints are available.
- Identify user roles and which roles can execute, refund, reverse, configure VAT, or view reports.
- Decide which payment screen is the primary execution route. Recommended: one primary route, with any other page linking to it or focused on monitoring.

**Deliverable:** A short API and business-rules note agreed with the backend owner. No UI assumptions about payload or payment safety should be made until this is available.

### Phase 1 — Payment flow safety and clarity (highest priority)

**Likely areas:** `src/pages/NewTransaction.jsx`, `src/pages/BankPayments.jsx`, `src/lib/api.js`, shared form and formatting utilities.

**Work**

- Consolidate duplicate payment execution UI into one canonical workflow.
- Align the form with the confirmed API contract. Remove, disable, or clearly mark fields that are not submitted or used to construct the request.
- Add field-level validation and associate errors with the relevant input. Validate required identifiers and numeric amounts; validate totals only if the backend contract defines the rule.
- Add a review/confirmation summary before execution, showing customer, item/tender details where available, VAT, total, register, and cashier.
- Preserve the same idempotency key for retries of the same payment attempt. Generate a new key only when starting a genuinely new operation, with a clear UI action and explanation if needed.
- When a request times out or the connection drops, show an “outcome unknown” state and guide the user to check status using the same idempotency key or payment reference before retrying.
- Prevent accidental double submits and retain safe form values after recoverable failures.
- Standardize result states and wording. Map backend status values to readable labels and next steps while retaining the raw status for support/debugging where appropriate.
- Make pending transactions reachable from the payment result and provide a refresh/status check when supported.
- Keep sample/mock response functionality out of production workflows, or isolate it behind an explicit development/demo mode.

**Acceptance criteria**

- A user can tell exactly what data will be used before payment execution.
- The frontend sends only contract-approved values and formats.
- Repeated clicks cannot create overlapping requests.
- An ambiguous network failure does not encourage a blind second charge.
- Success, pending, failure, and unknown outcome each have a clear message and next action.

### Phase 2 — Transaction lifecycle and discoverability

**Likely areas:** `src/pages/Transactions.jsx`, `src/pages/Search.jsx`, `src/App.jsx`, new transaction detail page, `src/lib/api.js`.

**Work**

- Add a transaction detail route, such as `/transactions/:transactionId`, and link each list row to it. The current eye icon should navigate to a real detail view or be removed until that view exists.
- Display transaction identifiers, status history where available, transaction type, customer details, gross/net/VAT/tax breakdown, tender/payment details, cashier/register, created/updated timestamps, and links to related refunds or reversals.
- Show actions only when allowed for the current status and user role. Confirm irreversible or financial actions and explain their consequences.
- Make transaction list filters consistent: free-text search, date range, status, transaction type, and payment method where the backend supports them.
- Keep filters and pagination in URL query parameters so users can bookmark and share a view, and browser Back/Forward behaves predictably.
- Show result count and active filters, with a visible clear-filters action.
- Preserve server pagination and ensure the displayed page count and total count match the backend response.
- Use stable row keys and accessible action names.

**Acceptance criteria**

- From a payment result, a user can reach the transaction record directly.
- Every transaction row has a functioning way to open details.
- Users can distinguish no matches from a failed request and can recover from either state.
- The list does not load every transaction into the browser for filtering.

### Phase 3 — Currency, dates, dashboard, and report trustworthiness

**Likely areas:** `src/pages/Dashboard.jsx`, `src/pages/Reports.jsx`, transaction/search pages, shared formatter utilities.

**Work**

- Add one shared currency formatter configured with the confirmed currency and locale. Replace all hardcoded `$` concatenation and inconsistent amount division.
- Confirm whether API amount values are major or minor units, then encode that conversion once in the shared formatter. Add clear labels when a report contains gross, net, VAT, or tendered amounts.
- Add shared date/time formatting with a confirmed timezone policy. Display the timezone where it matters for audit and reconciliation.
- Select one dashboard period (recommended: current month to date) and use it consistently across metrics, recent activity, and comparisons. Make the period visible and allow selecting common ranges if useful.
- Compare each metric with the equivalent previous period. Do not compare a partial month with a full month or mix year totals and month totals without saying so.
- Make partial failures visible per metric/section. Avoid displaying a failed metric as a genuine zero.
- In Reports, validate date ranges, use the selected dates consistently, and show useful empty states when the range has no data.
- Make report export work for the currently selected period and visible report data. If ExcelJS is used, load it only when export is requested; otherwise remove the unused dependency after confirming no required usage.
- Add accessible chart names/summaries and a tabular alternative for key figures so chart information is not color-only.

**Acceptance criteria**

- Every monetary value uses the same currency and unit convention.
- A user can understand the period behind every total and comparison.
- A missing/failed API metric is not misleadingly shown as zero.
- Export output matches the selected range and on-screen totals.

### Phase 4 — Settings and permissions

**Likely area:** `src/pages/Settings.jsx`, authentication/authorization integration, backend settings API.

**Work**

- Inventory each setting and classify it as supported/persistent, frontend-local preference, backend/operator-only configuration, or unsupported.
- Remove controls that do not save. Implement save/load for supported settings and show saved state, validation, and server errors.
- Remove database host, port, and database name controls from the user-facing frontend unless there is a carefully designed administrative use case. Database credentials and internal connection details belong on the server.
- Keep API base URL and timeout as deployment configuration unless end users have a real supported need to edit them. Do not imply that editing a field changes the active client if it does not.
- Scope VAT settings by permission, include effective date/audit information where required, and validate against backend rules.
- Add role-based access around configuration and financial actions when identity/roles are supplied by the backend.

**Acceptance criteria**

- Every visible Save button persists its values and reports the outcome.
- Users cannot see or change options that they are not authorized to manage.
- Server-only connection details are not presented as ordinary application settings.

### Phase 5 — Consistency, accessibility, and responsive behavior

**Likely areas:** `src/components/Layout.jsx`, shared UI components, all pages, `src/index.css`.

**Work**

- Add a page title/breadcrumb in the top bar and make the active navigation state accurate for nested routes.
- Give the mobile menu button an accessible label and state. Close the menu on Escape, manage focus when it opens, and ensure the backdrop is announced/usable appropriately.
- Ensure every input has a programmatically associated label, focus is visible, keyboard interaction works, and status is not communicated by color alone.
- Use consistent button styles, status badges, spacing, headings, date formats, and empty/loading/error states.
- Make wide tables usable on narrow screens with intentional horizontal scrolling or a compact mobile row/card treatment.
- Improve error messages so they explain what happened and what the user can try next; reserve technical details for logs/support context.
- Add a not-found route and a clear fallback if a user opens an invalid path.

**Acceptance criteria**

- Core workflows are usable with keyboard and at common mobile/tablet widths.
- All interactive controls have accessible names and visible focus.
- The same status and error have consistent presentation across all pages.

### Phase 6 — Performance and maintainability

**Likely areas:** `src/pages/Dashboard.jsx`, `src/pages/Reports.jsx`, `src/lib/api.js`, `src/App.jsx`, dependencies.

**Work**

- Reduce dashboard request fan-out. Prefer one backend summary endpoint for current and comparison metrics; if that is not available, keep requests concurrent and avoid requesting data already returned by another endpoint.
- Avoid firing report requests on every date keystroke when the UI presents an Apply button. Keep draft filter values separate from applied values, or remove Apply and debounce intentionally.
- Add request cancellation or ignore stale responses consistently when navigating or changing filters. Handle component unmount and avoid stale data overwriting newer results.
- Consider route-level lazy loading, especially for the report charts, so users who only process payments do not download chart code immediately.
- Review dependency usage, bundle size, and production build output. Remove unused packages only after confirming no runtime or export feature needs them.
- Share common status, date, money, and table components instead of reimplementing display rules in each page.
- Add an environment-based API proxy/configuration for development and production. Avoid presenting a localhost URL as a production setting.

**Acceptance criteria**

- Navigating to payment screens does not require loading report-only chart code.
- Rapid filter changes cannot show stale results as current.
- Dashboard and report requests are bounded and do not duplicate on ordinary user interaction.
- Production bundle and API configuration are appropriate for deployment.

## Suggested implementation order

1. Confirm backend and business rules (Phase 0).
2. Fix the canonical payment flow and ambiguous-outcome handling (Phase 1).
3. Add transaction detail and connect it to payment results and lists (Phase 2).
4. Standardize currency/date formatting and repair dashboard/report period definitions (Phase 3).
5. Remove or implement nonfunctional settings and apply permissions (Phase 4).
6. Improve accessibility, mobile behavior, and shared interaction patterns (Phase 5).
7. Optimize request behavior, route loading, and dependencies (Phase 6).

This order handles the highest financial and user-trust risks first, then builds discoverability and consistency, then optimizes the implementation.

## Cross-cutting implementation requirements

- Treat backend validation as authoritative; frontend validation improves usability but does not replace server validation.
- Never treat a timeout as proof that a payment failed. Check status/idempotency before retrying.
- Do not hardcode currency, timezone, or status assumptions in individual screens.
- Keep payment data and sensitive identifiers out of unnecessary browser storage and logs.
- Do not show sample payment responses as real results.
- Make partial API failures visible and distinguish them from valid zero values.
- Prefer server-side filtering and pagination for transaction data.

## Risks and open questions

- **Payment contract:** The create form has fields that its execute handler does not submit. Backend ownership of transaction details must be confirmed.
- **Amount units:** Fixture amounts are large integers and one screen divides an amount by 100 while others do not. Confirm the backend unit before changing displays or validation.
- **Currency:** Dollar symbols are currently hardcoded. Confirm the actual operating currency and locale.
- **Dashboard definitions:** Current metric endpoints use different time ranges; agree on business definitions before comparing values.
- **Settings:** The current UI includes settings that do not appear connected to persistence. Confirm supported settings and authorization requirements.
- **Statuses:** Some pages use different status values (for example, `COMPLETED` and `SETTLED`). Confirm the canonical backend states and map them centrally.
- **API capabilities:** Transaction details, status lookup, refunds/reversals, export, and role enforcement may require backend work.

## Definition of done

The improvement work is complete when a staff member can reliably execute or monitor a payment, understand the result, open and search its transaction record, and review accurate reports for a clearly identified period and currency. All visible controls work as described, financial actions handle retries safely, and core screens remain usable with keyboard and mobile-sized layouts.

## Validation approach

For each implementation phase, verify the affected workflow against the agreed API contract and representative backend responses, including success, pending, validation failure, authorization failure, timeout/unknown outcome, empty results, and server error. Confirm production build behavior, keyboard interaction, mobile layout, and that monetary values/date ranges are consistent across Dashboard, Transactions, Search, Bank Payments, transaction details, and Reports.
