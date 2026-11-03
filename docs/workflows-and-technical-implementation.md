# POS, Payment, VAT, and Financial Reporting Workflows

This document records the business workflows, design decisions, and current technical implementation discussed for the POS Tax/VAT application. It describes the intended operating model while calling out where the current system is simulated, incomplete, or needs business/legal confirmation before production use.

## 1. Application structure and navigation

- The application has separate **Purchase** and **Sale** workflows. A Sale is handled in the POS terminal; Purchase uses the transaction/payment form.
- The payment workflow first identifies the business transaction type, loads the BEFA payment details, and routes the user to the corresponding workflow.
- **Complete payment is the default.** Pre-authorization is an optional checkbox selected before loading/processing the transaction; transaction type is not re-selected after the details are loaded.
- The POS terminal is presented as a right-side, device-like modal rather than navigating to a separate full-page terminal. It supports closing from the bezel, backdrop, or Escape key when the transaction is not busy.
- Authenticated users should remain signed in after restarting the application when their stored session remains valid. Login and protected routes use the frontend authentication context and route guards.
- The financial report is separate from the general dashboard and contains financial audit detail. Its **Payment method totals** section is placed last on the page and last in the CSV export.

## 2. Business transaction types and payment operations

The business transaction describes what the organization is doing; payment operations describe what happens to funds. These concepts should not be conflated.

| Business/payment record | Meaning |
|---|---|
| `SALE` | Goods or services sold to a customer. |
| `PURCHASE` | A supplier or business purchase/payment. |
| `PRE_AUTH` | A temporary authorization hold for an eventual Sale or Purchase. It is a payment lifecycle, not the underlying business type. |
| Capture | Converts some or all of an existing authorization into a payment. |
| Refund | Returns some or all of a confirmed captured payment. |
| Authorization cancellation/void | Releases an authorization that has not been captured. |
| Reversal | Technical correction for an eligible unsettled transaction; it is not a substitute for refunding a captured payment. |

### Standard Sale and Purchase

1. Select Sale or Purchase and enter the BEFA payment reference, cashier, and register identifiers.
2. Load the BEFA data and review customer, item, quantity, tender, currency, and calculated pricing information.
3. Review the VAT-inclusive-price choice. For Sale, optionally select the customer service fee.
4. Confirm the transaction and send the calculated amount due to the configured payment flow.
5. On successful payment, record the transaction, tender details, calculated financial values, currency, timestamps, and any applicable fiscal reference. Sale/Purchase inventory adjustments are guarded to avoid applying the same transaction twice.

For Purchase, the customer service fee is not applied. The fee checkbox is Sale-only.

### Pre-authorization, capture, expiry, and cancellation

Pre-authorization is selected before the loaded transaction is submitted. The operator specifies:

- The authorization expiry duration in hours (default UI value: 72 hours).
- The amount to capture automatically at expiry. A value of `0.00` means capture nothing automatically.

Expected lifecycle:

1. Authorize the requested hold without treating it as collected revenue or a captured payment.
2. Before expiry, an authorized, uncaptured transaction can be cancelled/voided; the hold is released.
3. A merchant may make **one manual capture** before expiry, for an amount no greater than the remaining hold. The unused remainder is released, the scheduled expiry capture is suppressed, and no further manual capture is allowed.
4. If there was no manual capture by expiry and the configured automatic amount is greater than zero, capture that amount and release the rest of the hold.
5. If the automatic amount is zero and there was no manual capture, release the full hold and expire the authorization without a payment capture.

Capture history records operation type, idempotency key, amount, cumulative captured amount, provider reference/status, and timestamp. The business type remains Sale or Purchase after capture finalization. A partially captured amount is refundable only up to the captured balance.

### Refunds

- A refund is allowed only for a Sale with confirmed captured value, not for a Purchase or an authorization-only hold.
- The refundable ceiling is bounded by the captured/recorded refundable amount, less all prior refunds. This also applies to a partially captured authorization once capture has completed.
- The refund operation is idempotent. Repeating the same request key and amount should return the existing refund record, rather than create a second refund.
- Each refund is represented as a child transaction with its own identifiers. The parent Sale/Purchase retains its original gross, VAT, fee, and net amounts for audit history; its refunded total and status are updated.
- The refund allocation is proportional to the original recorded taxable base, VAT, and customer fee. Rounding is to two decimal places; any rounding remainder is assigned to the taxable-base allocation so the refund components sum exactly to the requested refund.
- The parent status becomes `PARTIALLY_REFUNDED` until its refundable captured balance is exhausted, then `REFUNDED`.
- A refund does not depend on whether the processor has paid out the funds to the merchant. Provider settlement/cutoff rules may affect the provider operation, but payout settlement is distinct from the ability to refund a captured transaction.

An uncaptured pre-authorization should normally be voided, not refunded. Provider-specific rules determine whether a recently captured transaction can be voided instead of refunded.

### Reversal

A technical reversal is intended for a pending transaction that has not settled or captured. Once funds have been captured, use a refund. Once an authorization exists but remains uncaptured, use authorization cancellation. Reversal eligibility is deliberately narrower than refund eligibility.

## 3. Monetary model, VAT, and fees

### Amount units and totals

- Monetary values are represented in **major currency units with two decimal places**: for example, `12.50` means twelve and one-half currency units, not 1,250 minor units.
- Backend monetary fields use `BigDecimal`; financial database columns are migrated to decimal precision. Calculations use two-decimal `HALF_UP` rounding.
- Currency defaults to `ETB`. The code is retained with each transaction so later currency changes do not relabel old transactions.

The financial terms used for newly calculated transactions are:

| Field | Meaning |
|---|---|
| Gross / taxable base | Item subtotal after discounts, before VAT and service fee. |
| VAT | Tax calculated using the applicable configured category rate. |
| Service fee | Optional Sale-only fee calculated on the taxable base. |
| Net / amount due | Taxable base + VAT + service fee. This is the intended customer amount, not the accounting definition of net income. |
| Amount paid | Confirmed applied/captured tender amount. For a pre-authorization, the hold alone is not paid. |

The historical database values were preserved when converted to decimal; they were not multiplied by 100. As a result, older records may follow earlier gross/net semantics. Do not assume old and new rows have identical field meanings.

### VAT-exclusive and VAT-inclusive prices

- By default, entered item prices are VAT-exclusive, and VAT is added.
- If **Entered prices already include VAT** is selected, the VAT portion is extracted from the entered total. For taxable base `B`, VAT rate `r`, and inclusive price `P`, the model uses `B = P / (1 + r)` and `VAT = P - B`.
- VAT is calculated per line and rounded to two decimals. A discount cannot exceed the item subtotal.
- VAT-exempt and zero-rated categories produce zero VAT. Other categories require an active configured rate; an unknown/inactive category is rejected rather than silently treated as zero.

The editable initial VAT configuration includes Standard (15%), Reduced (5%), Zero Rated (0%), and Exempt (0%). Rates are stored as decimal fractions (for example `0.15` = 15%). Administrators can edit rates and categories; each line item records its VAT category/rate used for the transaction.

### Service fee

- The customer service fee is optional and unchecked by default.
- It is applied only when explicitly selected on a Sale and uses the configured service-fee rate (initial default 2%).
- It is calculated on the taxable base, separately from VAT.
- Purchase and Sale may have different commercial treatment; current behavior applies this customer-facing fee only to Sale.

The exact tax treatment of a service fee and any jurisdiction-specific VAT obligations require confirmation by the business's tax/accounting adviser. The application records configured calculations; it does not determine legal tax liability.

### Currency configuration

- The currency code is an ISO 4217 code. ETB is the default.
- Currency updates are restricted to users with the backend `ADMIN` role and apply to new transactions.
- A transaction stores its currency code at creation and retains that code.
- Changing the currency does **not** convert existing balances, historical values, or report totals. Do not combine different currencies in a report total until currency-aware grouping/filtering is implemented.

## 4. Settings and API implementation

The Settings page provides:

- Business currency configuration.
- VAT category/rate and service-fee configuration.
- Payment integration mode/status information.

Backend configuration is stored in `pos_configuration`. The settings controller exposes:

| Method and path | Purpose |
|---|---|
| `GET /api/v1/pos/settings/currency` | Read current configured currency. |
| `PUT /api/v1/pos/settings/currency` | Update the currency (ADMIN only). |
| `GET /api/v1/pos/settings/pricing` | Read service-fee rate and VAT categories. |
| `PUT /api/v1/pos/settings/pricing` | Update service-fee rate and VAT categories (ADMIN only). |

The pricing update validates the percentage range, unique category codes, and that at least one VAT rate remains active. Deactivated categories are retained in storage rather than physically deleted.

Primary backend transaction endpoints include:

| Endpoint | Operation |
|---|---|
| `POST /api/v1/pos/transactions/purchase` | Create/process a Purchase. |
| `POST /api/v1/pos/transactions/preauth` | Create a pre-authorization for a Sale or Purchase. |
| `POST /api/v1/pos/transactions/{id}/capture` | Capture against an authorization. |
| `POST /api/v1/pos/transactions/{id}/cancel` | Cancel/release an uncaptured authorization. |
| `POST /api/v1/pos/transactions/{id}/refund` | Refund confirmed captured funds. |
| `POST /api/v1/pos/transactions/{id}/reverse` | Reverse an eligible pending transaction. |
| `GET /api/v1/pos/transactions/{id}` | Read transaction detail. |

Request/response DTOs carry decimal money, currency, pricing flags, transaction identifiers, and operation idempotency keys. Database migrations convert monetary columns to decimal and add pricing/currency snapshots and pre-authorization capture policy fields.

## 5. Fixture mode and future payment-provider integration

Fixture mode is a local simulation, not a connection to BEFA or a bank:

- BEFA and bank responses can be supplied from local JSON fixtures.
- POS transaction records and fixture payment operations are held in browser `localStorage` when frontend POS data fixture mode is enabled.
- The local fixture store simulates authorization expiry, capture, release, cancellation, refund, and reversal, and updates related parent/child transaction records.
- Backend pre-authorization operations are isolated behind an operations interface; the current implementation is simulated.
- Fixture data is browser-local and does not sync to the POS backend or other browsers/devices.

### Payment instrument details

The UI/fixture tender data can describe methods such as cash, card, mobile money, QR, and bank transfer, including a provider and tender amount. This does **not** mean the application currently has a production-grade bank-account, wallet, or ATM-card credential collection and processing integration.

Before a real provider is connected:

- Use provider-hosted payment pages, tokenization, or certified terminals for card credentials. Do not store raw card numbers, CVV, PIN, or online-banking passwords in POS records, fixtures, logs, or browser storage.
- For bank transfer and wallet payments, collect only provider-approved identifiers and references; verify the payment status server-side before marking it paid.
- Implement provider-specific authorization, capture, void, refund, webhook/status reconciliation, timeouts, retries, and idempotency.
- Keep provider credentials and secrets on the server, not in frontend code or fixture JSON.

The payment provider—not this POS UI—must be the source of truth for whether an operation was approved. A request timeout or lost response is an unknown outcome and must be reconciled by status/idempotency lookup before retrying.

## 6. Financial reporting and search

### Financial report

The financial report supports a date range (current month by default) and includes:

- Sale and Purchase totals after linked refunds/reversals.
- Recorded Sale VAT and Purchase VAT, refunds, reversals, service fees, and payment variance.
- An audit summary by transaction type.
- Daily activity, item activity, cashier/register activity, and outstanding activity.
- Payment method totals (tender count and applied amount), deliberately shown at the very bottom of the report and last in its CSV export.

The backend report uses settlement time where available, with creation time as fallback. It distinguishes captured/paid amounts from amounts due. A refund or reversal is subtracted from Sale/Purchase totals only when linked to that parent type; an unlinked correction cannot be reliably allocated.

Report caveats:

- Payment variance compares recorded paid and due amounts before refund payouts; it is not a processor settlement reconciliation.
- Purchase VAT recoverability is not assessed.
- Net Sale less Purchase is not profit; the report does not include operating costs, inventory valuation, or other accounting adjustments.
- Aggregated financial reports are not yet grouped by currency. Use a single-currency period or add currency grouping before reporting across currency changes.
- Historical amounts may use earlier field semantics, and existing records do not carry a financial-model version.

### Search and transaction detail

Transaction lookup/search supports transaction ID, BEFA payment ID, bank transaction ID, customer, cashier/register, status/type, amount, method, and date criteria where supported by the endpoint. Detail and search presentation should retain recorded currency and distinguish `PARTIALLY_CAPTURED` and `PARTIALLY_REFUNDED` rather than flattening them into generic Authorized/Refunded labels.

## 7. Data migration, compatibility, and production readiness

- Decimal migration converts existing numeric values to two-decimal values without scaling them. Review a database backup and Flyway history before production migration.
- The V5 migration in the backend uses PostgreSQL-specific SQL (including `::NUMERIC` and `ON CONFLICT`). Confirm the deployed database engine and migration history: the backend dependency list includes both PostgreSQL and MySQL drivers, and this migration will need a dialect-compatible strategy if MySQL is the target.
- The migration introduces new snapshots/configuration fields, but existing financial rows have no model-version marker. Historical reporting/refund calculations need data review before relying on them for statutory accounting.
- The code contains simulated provider operations. A real integration requires an adapter for the selected bank/payment gateway and reconciliation of real provider outcomes.
- Review controller authorization before production. Existing security configuration and controller actor values should be verified end-to-end so that role checks use authenticated identities rather than hard-coded or client-supplied actors.
- Review unique identifier constraints and operation retry paths against the actual database schema before enabling refunds/reversals at scale.
- Validate VAT categories, fee treatment, rounding, fiscal receipt requirements, retention, privacy, and report definitions with local tax/accounting and payment-provider requirements.

## 8. Main implementation locations

Frontend paths below are relative to the frontend project root:

- `src/App.jsx` — protected routes and page routing.
- `src/pages/PaymentChannelRouter.jsx` — Sale/Purchase choice, BEFA load, and pre-auth selection.
- `src/pages/TerminalPurchase.jsx` — Sale terminal modal, pricing preview, tender entry, and pre-auth inputs.
- `src/pages/NewTransaction.jsx` — Purchase/pre-auth workflow and transaction actions.
- `src/pages/Settings.jsx` — currency and VAT/fee controls.
- `src/pages/FinancialReport.jsx` — financial report, Payment method totals placement, and CSV export.
- `src/lib/pricing.js` — shared browser-side pricing preview calculations.
- `src/lib/mockStore.js` — local fixture transaction store and simulated operations.
- `src/lib/api.js` — API endpoints and fixture/HTTP routing.
- `src/lib/format.js` — currency and status formatting.

Backend implementation is in the separate `C:\Users\andub\IdeaProjects\POS_Tax_VAT_System` project:

- `src/main/java/com/example/postaxvatsystem/service/VATCalculationService.java` — VAT, fee, rounding, and refund allocation.
- `src/main/java/com/example/postaxvatsystem/service/POSTransactionService.java` — purchase/pre-auth lifecycle, capture, expiry, refund, reversal, and response mapping.
- `src/main/java/com/example/postaxvatsystem/service/PricingConfigurationService.java` and `POSConfigurationService.java` — persistent pricing/currency settings.
- `src/main/java/com/example/postaxvatsystem/controller/POSConfigurationController.java` — settings endpoints.
- `src/main/java/com/example/postaxvatsystem/service/PreAuthorizationOperations.java` and its simulated implementation — payment-provider operation boundary.
- `src/main/java/com/example/postaxvatsystem/controller/FinancialReportController.java` — financial audit report calculations.
- `src/main/resources/db/migration/` — database schema evolution.
