CONSOLIDATED MASTER DOCUMENTATION
POS TAX AND VAT SYSTEM

Document version: 2.0
Prepared: 2 November 2026
Document purpose: Business and technical reference, implementation baseline, operational workflows, known gaps, and delivery plan
Systems reviewed:
  Backend: C:\Users\andub\IdeaProjects\POS_Tax_VAT_System
  Frontend: D:\GitHubRepository\POS_TAX_VAT_Payment_frontend
Prior document: Version 1.4.0

DOCUMENT STATUS AND HOW TO USE THIS REFERENCE

This document describes the code and configuration reviewed in the two repositories on the preparation date. It is an implementation-oriented reference, not a statement of regulatory certification, processor approval, production readiness, or successful operation in every deployment.

The terms below distinguish evidence from recommendations:

IMPLEMENTED
  Behavior is represented by application source, configuration, or versioned database migrations in the reviewed repositories. It may still need deployment-level verification.

CONFIGURED IN THE REVIEWED LOCAL BASELINE
  A repository default or local environment file selects the behavior. A deployment can override it, so verify the effective runtime configuration before operating.

PARTIAL OR SIMULATED
  An application path exists but uses demo credentials, generated references, fixture data, a simulated gateway, a placeholder endpoint, or otherwise does not complete a verified external business operation.

PLANNED / RECOMMENDED
  A proposed improvement. It is not represented as delivered merely because it appears in a plan.

Where source behavior and older prose conflict, this document follows the reviewed source and identifies material uncertainty. Configuration values that function as credentials, signing keys, encryption keys, or passwords are intentionally not reproduced. Keep them in protected secret storage and out of shared documentation.


1. EXECUTIVE SUMMARY

The POS Tax VAT System combines a React point-of-sale and administration user interface with a Spring Boot REST service and a relational database. It records business transactions, line items, payment tenders, tax and pricing snapshots, authorization/capture activity, inventory changes, and reporting data. The frontend provides transaction entry and review, a BEFA payment workflow, reports, search, settings, and fixture-authoring tools. The backend owns transaction validation and persistence for its HTTP transaction APIs.

The intended business outcomes are:

• Record sales and business purchases with line-level VAT and optional pricing adjustments.
• Support split payment tenders and retain tender-level status and references.
• Create pre-authorizations and later capture, release, cancel, or expire them.
• Enforce duplicate protection and link refunds or reversals to an originating transaction.
• Update tracked inventory when eligible sales or purchases complete.
• Give operational and finance users search, transaction history, dashboards, and reports.
• Keep an audit trail of important transaction and payment state changes.
• Offer a controlled fixture workflow for development and demonstrations.

Important operational qualification:

The reviewed frontend defaults its payment integration mode to HTTP and its POS data mode to HTTP. The checked-in backend application properties select the "fixture" Spring profile as both the default and active profile in the reviewed baseline. In that backend profile, a payment may be built from configured JSON fixtures and saved in the backend database. This differs from the frontend's optional fixture mode, which can create a browser-local simulated result. Neither kind of fixture result proves that a live bank or BEFA system authorized or settled funds.

In the non-fixture backend service, the BEFA data retrieval method currently reports that no source is configured, and the bank client contains a placeholder internal URL rather than a verified deployment configuration. Therefore, a frontend HTTP request reaches the backend, but the reviewed source does not establish a working production BEFA-to-bank integration. Do not equate "HTTP integration" or a backend `SETTLED` state with external bank settlement until the bank and BEFA connections, confirmation behavior, and reconciliation have been configured and tested end to end.

The backend also includes in-process demo login accounts and generated simulated tender authorization data. Fiscal receipt generation now has an explicit authority-client boundary: the fixture profile reads a configurable JSON authority-response fixture, while non-fixture mode records `NOT_CONFIGURED` rather than inventing an official reference. Fixture receipt references/signatures are explicitly marked test data and are not proof of production tax-authority submission.


2. SCOPE, USERS, AND BUSINESS PERSPECTIVES

2.1 Scope

The reviewed application includes:

• POS transaction creation and transaction action endpoints.
• Purchase, sale, and pre-authorization business flows.
• Bank-payment preview, execution, status, and lookup endpoints.
• VAT, customer-fee, withholding-VAT, currency, and pricing configuration.
• Inventory item tracking and item reports.
• Search, dashboard, operational reporting, financial audit, and a fiscal-submission register with date/status/mode filters and paginated export.
• Authentication using signed bearer tokens and role-based route rules.
• Fixture profile services and user-specific test transaction data uploads.
• Database migrations, key/data migration support, and payment reconciliation code.

The repositories do not establish that a live fiscal authority, production bank processor, identity provider, inventory/ERP platform, or external cash-register service is connected. Such integrations must be treated as dependencies requiring separate confirmation.

2.2 Stakeholder viewpoints

CASHIER / FRONT-LINE OPERATOR
  Needs a fast, clear checkout, reliable customer and register context, payment confirmation, receipt details, and safe recovery from uncertain outcomes. The cashier should not retry a payment blindly when the previous result is unknown; the transaction must first be looked up by its business or processor reference.

SUPERVISOR / SENIOR CASHIER
  Needs oversight of pre-authorizations, pending transactions, capture, void, and reversal decisions. Any privileged override should capture the real actor, reason, time, and related transaction identifiers.

MANAGER
  Needs refund and reconciliation workflows, operational exception visibility, team and register performance, and approval controls. Financial reports must distinguish sales from supplier purchases, tax collected from revenue, and settled from pending activity.

FINANCE / TAX / AUDIT USER
  Needs consistent period definitions, currency context, tax-category reporting, linked refund history, retained pricing/tax snapshots, traceable adjustments, and exports that reconcile to the accounting ledger and statutory reporting rules.

SYSTEM ADMINISTRATOR
  Needs secure configuration, access management, environment promotion, backup and recovery, database migration oversight, and monitored integrations. Administrative settings and migration actions must not be exposed as ordinary cashier tasks.

CUSTOMER / SUPPLIER
  Is represented by transaction data, not a directly authenticated application role in the reviewed frontend. Customer-facing receipt delivery, supplier onboarding, and self-service access are not established by the reviewed implementation.

BANK / BEFA / TAX AUTHORITY
  Are external counterparties. The application contains integration boundaries and fixture workflows, but the reviewed source does not prove that the real external services are connected, reachable, or certified.

2.3 Business terms

SALE
  The business event in which the organization supplies goods or services to a customer and expects payment. SALE is the commercial meaning of the transaction, not a payment method and not the same as the backend's PURCHASE endpoint name.

  In the frontend, the operator chooses Sale in the payment router and is sent to the POS terminal sale workflow. The terminal reviews BEFA details and line-level prices, VAT, optional customer fee, and tender information. In backend records produced by the BEFA bank-payment flow, the sale is represented as a SALE business transaction; the pre-authorization route also accepts SALE as its underlying business type.

  When successfully completed or settled, a SALE can reduce tracked on-hand stock for its line items. The current backend creates its fiscal-submission record at its fiscalization point. A later refund is permitted only for an eligible captured/completed SALE. Whether a sale is actually bank-paid or fiscally accepted depends on the active backend integration: fixture responses are simulated, and the reviewed live integrations are not configured.

PURCHASE
  The backend uses PURCHASE as a business transaction type for acquiring goods or recording a business-side purchase. In the general transaction form, the request contains item lines and tenders; on success, the inventory service adds the purchased quantities. This is the opposite inventory direction from SALE.

  There are two user journeys that use the word Purchase: the general POS transaction form sends line items and tenders to the purchase endpoint; the payment router's Purchase choice uses the BEFA/bank-payment flow. The code does not establish a supplier master record, purchase order, accounts-payable ledger, or proof of a real supplier payout. Confirm the intended finance meaning with the business owner and make labels and reports explicit. The ordinary purchase service also uses simulated tender authorization data in the reviewed implementation.

PRE-AUTHORIZATION
  A temporary authorization hold against a payment source before the final amount is known. It is an operation on a SALE or PURCHASE business transaction; `PRE_AUTH` is the transaction operation/type, while the separate business type preserves what the transaction is for.

  The backend records the expected hold, line/tax snapshot when supplied, tenders, expiry, optional automatic-capture amount, and an AUTHORIZED state after its authorization step. The initial amount held is not treated as an amount paid or sales revenue. A later capture converts an eligible amount into payment. Cancellation releases an uncaptured hold; expiry releases the unused balance and can optionally make a configured automatic capture. A pre-authorization response is not a completed sale receipt or proof of settlement.

CAPTURE
  A payment operation that converts some or all of an existing pre-authorized hold into a collected payment. CAPTURE is an action, not one of the backend's transaction-type values: the capture is represented in capture-operation records attached to the original pre-authorization.

  The cashier supplies an idempotency key and amount. The backend checks that the authorization is active and unexpired, the amount is positive and within the unspent hold, and a prior capture has not closed the authorization. It records the amount and cumulative amount, provider reference/status, updates tender application, and requests release of the unused hold. The current manual-capture policy marks the authorization as manually captured after the operation, so a second manual capture is rejected even when the first capture was partial. When finalized, the underlying transaction becomes SALE or PURCHASE, fiscalization is attempted through the configured authority client, and inventory is adjusted according to that business type.

  The capture code calls a pre-authorization operations interface. Confirm which implementation is active: a recorded capture status must not be presented as processor confirmation unless a real gateway implementation supplied it.

REFUND
  A new, linked transaction representing money returned to a customer for a prior captured SALE. A refund is not a reversal and does not erase the original sale. The parent keeps its original transaction amounts while its refunded total and status are updated.

  The backend requires a SALE business transaction in an eligible completed/captured state, within the configured refund window, with a positive amount no greater than the remaining captured/refundable balance. It creates a separate REFUND transaction with the parent transaction ID, idempotency key, reason, and proportional gross/VAT/service-fee allocation. The original transaction moves to partially refunded or fully refunded based on cumulative returned value. The fiscal workflow marks the refund submission as a credit-note candidate and links it to the original transaction; this does not assert that the tax rules require or that an authority accepted a credit note.

  Critical distinction: the reviewed refund service marks its refund record REFUNDED without making a demonstrated call to a real payment gateway. It therefore records application workflow state, not verified returned funds. The request model includes optional line-item IDs, but the reviewed service calculation is transaction-total based rather than a line-selection refund implementation. A business return/restock decision is not currently applied by the inventory service.

REVERSAL
  A linked operational cancellation for an eligible transaction that remains pending and has not been settled or captured. It creates a REVERSAL child record and marks the original and reversal records REVERSED. Reversal is not a refund: use a refund for a captured/completed customer sale.

  The current service restricts technical reversal to a pending, unsettled, uncaptured transaction. It does not call a verified external processor reversal in the reviewed implementation. For a pre-authorization, use Cancel authorization instead: that releases the hold and changes the existing authorization to CANCELLED rather than creating a reversal child transaction.

LIFECYCLE STATUS
  The transaction's current processing state, such as PENDING, AUTHORIZED, PARTIALLY_CAPTURED, SETTLED, COMPLETED, REFUNDED, REVERSED, FAILED, CANCELLED, or EXPIRED. Status answers "where is this record in its workflow?" and is distinct from transaction type, which answers "what business/payment event does this record represent?"

IDEMPOTENCY KEY
  A request identity used to recognize a retry of the same intended operation and avoid accidentally processing it twice. The caller should keep the key stable for a retry of one operation and use a new key only for a genuinely new action. Reusing the same key with changed transaction details must be rejected.

PARENT / CHILD TRANSACTIONS
  A parent is the original sale or authorization. Refund and reversal records retain a reference to the parent so an operator can trace the original amount, later adjustments, and remaining balance without rewriting the original financial facts.

CUSTOMER FEE
  A configurable service fee that can be applied to the taxable base in supported SALE workflows. It is distinct from VAT and should be displayed and accounted for as its own amount. The reviewed default is configurable, not a claim about a statutory tax or a processor charge.

WITHHOLDING VAT
  A configured withholding amount calculated as a portion of the transaction VAT when explicitly selected with the required certificate number and date. It affects the amount to collect/authorize. It is not the same as output VAT and requires jurisdiction-specific finance approval.

FIXTURE
  Test data used in place of a live external record or processor response. The backend's fixture profile can persist a simulated transaction in the application database; the frontend's optional fixture mode can also store demo history in browser storage. A saved fixture response is not external payment, settlement, or authority confirmation.

2.4 How transaction types and actions fit together

The business transaction describes the commercial purpose; the action describes what happens to the funds; the lifecycle status describes the record's progress. These must be read together:

• SALE + payment execution → customer sale, potentially completed/settled; can reduce inventory and may later be refunded.
• PURCHASE + payment execution → business-side purchase; successful itemized purchases increase inventory in the current inventory service. Supplier-payment/accounting semantics need business confirmation.
• SALE or PURCHASE + PRE_AUTH → temporary hold for that business purpose; no sale completion solely from authorization.
• PRE_AUTH + CAPTURE → applies an amount against the hold and may finalize the underlying SALE/PURCHASE.
• PRE_AUTH + CANCEL AUTHORIZATION → releases the untouched hold and marks the authorization cancelled.
• Eligible SALE + REFUND → creates a child refund/credit-note-candidate record and updates the parent's returned amount.
• Pending unsettled transaction + REVERSAL → creates a linked reversal record; this is not available for a settled sale.

For daily operations, first identify the parent transaction and its current status, then choose the allowed action. Do not select an action based only on what the customer calls it: "void", "cancel", "refund", and "reverse" can describe different financial events.


3. ARCHITECTURE AND RESPONSIBILITY BOUNDARIES

3.1 Logical architecture

The frontend is a React 18 single-page application built with Vite. It renders role-aware navigation and transaction screens, stores the signed-in bearer token and user summary in browser local storage, and calls the backend through shared Axios and fetch-based clients. In local development, the Vite server proxies API requests to the backend on port 8082.

The backend is a Java 17 and Spring Boot 3.2 service. REST controllers bind and validate requests, service classes apply business rules, repositories persist and query entities using JPA/Hibernate, and PostgreSQL stores the operational records in the reviewed baseline. Scheduled services process expired authorizations and, outside the fixture profile, attempt to reconcile aged pending bank payments.

The database model includes a primary transaction ledger and related tables for line items, payment tenders, captures, audit records, bank-payment audit records, VAT rates, application configuration, inventory, and tax-transaction records. The exact deployed schema must be verified against the database's Flyway history and current schema; the Hibernate setting also permits automatic schema updates in the reviewed application configuration.

3.2 Systems of record

BACKEND DATABASE
  The intended durable record for HTTP-created transactions, their state, line items, tender details, audit entries, and reports. The fixture bank-payment service also writes simulated payment transactions here.

FRONTEND BROWSER STORAGE
  Used for authentication context and, only when frontend POS fixture mode is explicitly selected, demo transaction history. Browser-local demo records do not synchronize to the backend database.

JSON FIXTURE FILES
  Used by the backend fixture profile for configured BEFA purchase/sale inputs and bank responses. Authenticated users can save their own purchase and sale templates through fixture-only endpoints. The fixture response remains simulated even when the resulting transaction is persisted by the backend.

EXTERNAL PAYMENT / TAX SERVICES
  Intended counterparties, but not verified as operational from the reviewed source. The non-fixture BEFA source is not configured in the service, the bank client has a placeholder URL, and fiscal-authority behavior is either simulated by the fixture or explicitly not configured.

3.3 Client and server responsibilities

The frontend:
  • Collects transaction identifiers, business choices, line items, register/cashier fields, payment options, and user-entered action reasons.
  • Loads payment previews through the backend bank-payment preview endpoint in the payment-router flow.
  • Formats currency and presents server responses, validation feedback, and transaction history.
  • Can optionally simulate payment responses in browser storage when frontend fixture mode is explicitly selected.
  • Does not hold the authoritative production tax, inventory, or transaction ledger when operating in HTTP mode.

The backend:
  • Validates request DTOs, configured currency, transaction states, amounts, VAT categories, tender sufficiency, and refund eligibility.
  • Calculates line and transaction amounts and persists transaction-related data.
  • Applies idempotency and duplicate BEFA-payment checks in transaction services.
  • Owns item-stock adjustments and report/search query behavior.
  • Applies role rules at the HTTP security layer, subject to the public-route and actor-attribution caveats in Section 10.
  • In fixture mode, substitutes JSON test data and a JSON bank response for live payment services.

The bank / BEFA service, when configured:
  • Must supply authoritative payment data, provide idempotent payment processing, expose a trustworthy status lookup, and return a processor reference.
  • Must be called only by a protected backend integration, not by code that exposes private keys in the browser.
  • Must provide documented status semantics, retry rules, timeouts, reversal/refund behavior, and reconciliation support before production activation.

3.4 Runtime and technology facts

• Backend framework: Spring Boot 3.2.0; Java 17; Maven.
• Frontend framework: React 18; Vite; JavaScript/JSX; Axios; React Router; Tailwind CSS.
• Reviewed backend application port: 8082.
• Reviewed frontend development port: 3000.
• Frontend default POS API base path: `/api/v1/pos`.
• Frontend local Vite proxy target: `http://localhost:8082`.
• Reviewed backend driver and Hibernate dialect: PostgreSQL.
• Versioned migrations are SQL files under the backend's Flyway migration directory. The project includes both PostgreSQL and MySQL driver dependencies, but the reviewed application properties select PostgreSQL. The precise production database vendor/version is not established by a driver declaration alone.
• Flyway is enabled and configured to validate migrations. Hibernate schema auto-update is also configured; teams should choose and enforce one controlled schema-evolution policy rather than relying on competing mechanisms.


4. END-TO-END OPERATING WORKFLOWS

4.1 Sign-in and session

1. An operator opens the frontend and submits credentials through the login page.
2. The frontend posts credentials to the backend authentication endpoint.
3. The current backend login implementation checks a fixed in-source set of demo users and returns a signed bearer token with username and role information.
4. The frontend stores the token and user summary in browser local storage. Protected frontend routes check the token expiry before granting access.
5. Backend requests attach the bearer token through the shared API client. Backend security validates the token and derives the role used by route authorization.
6. Logging out clears the browser's token and user data and navigates to the login page. No backend token-revocation endpoint or distributed token blacklist is established in the reviewed code.

Business meaning: this is a development authentication workflow. Replace the fixed demo-user credential check with a governed identity store or identity provider before production, protect signing keys, define token lifetime and revocation behavior, and test role assignments on the server. Hiding a screen in the frontend is not a substitute for backend authorization.

4.2 Payment-router workflow

1. The operator chooses SALE or PURCHASE. The choice determines the destination workflow.
2. The operator enters a BEFA payment identifier and cashier/register identifiers, and can request a pre-authorization flow.
3. The frontend asks the backend for a BEFA preview. The preview is review data; it is not itself a payment execution.
4. For SALE, the frontend navigates to the POS terminal sale screen. For PURCHASE, it navigates to the general transaction form.
5. The operator reviews the loaded record and any available item, customer, tender, currency, and pricing details.
6. The operator submits the operation. Depending on the selected workflow and runtime mode, the frontend either calls the POS transaction API or the bank-payment execution API.
7. The UI displays the backend response and allows later lookup from transaction history.

Controls and caveats:
  • In backend fixture profile, preview and execution can use local JSON fixture data.
  • In non-fixture backend profile, the current BEFA retrieval method throws an explicit not-configured error. A real integration must be implemented/configured before this workflow can fetch authoritative BEFA data.
  • Frontend `VITE_PAYMENT_INTEGRATION_MODE=http` means the browser sends payment execution to an HTTP endpoint. It does not choose the backend's Spring profile and does not guarantee a live bank call.
  • A transaction in PENDING or an indeterminate state must not be described to the customer as paid. Look up or reconcile the original transaction before retrying.

4.3 Standard POS purchase transaction

1. The operator creates a transaction with register, cashier, optional customer details, line items, VAT categories, and one or more tenders.
2. The backend normalizes or generates an idempotency key and rejects a previously used key. Where supplied, a duplicate BEFA payment identifier is also checked.
3. The backend checks that the requested currency agrees with the configured business currency and computes line-level tax, fee, and due amounts.
4. It checks that tender amounts cover the amount due. The current backend's ordinary purchase path simulates payment authorization data; it does not demonstrate a real card or mobile-money processor call.
5. The service records tender and transaction states through pending, authorized, captured, and completed. It submits a fiscal document to the configured authority adapter. In the fixture profile, the adapter returns a clearly marked simulated authority response and writes a fiscal-submission record; it does not contact the tax authority.
6. On success, the inventory service adds the purchased quantities for a PURCHASE business transaction or subtracts quantities for a SALE business transaction. It rejects insufficient on-hand quantity for a sale and avoids adjusting a line twice by marking inventory-adjustment state.
7. The backend persists the completed transaction and an audit record. The frontend can display it in transaction detail, lists, search, dashboard, and reports.

The actual meaning of "purchase" should be confirmed for each entry point. The backend inventory direction is an objective source-code behavior, whereas a supplier payment is a separate accounting and payment interpretation that must be reconciled with business policy.

4.4 BEFA bank-payment execution workflow

FIXTURE PROFILE:
  1. The backend fixture service checks for an existing transaction using the BEFA payment ID.
  2. It loads the configured BEFA fixture or an authenticated user's saved fixture, then prepares a PENDING transaction using a separate database checkpoint.
  3. It reads a configured bank response fixture.
  4. A recognized successful fixture status finalizes the transaction as SETTLED; a recognized failure finalizes it as FAILED; an unknown or indeterminate fixture status leaves it PENDING.
  5. The transaction and associated data are stored in the backend database, but the outcome is still simulated. A saved fixture does not contact a bank.

NON-FIXTURE PROFILE AS REVIEWED:
  1. The service checks for duplicate BEFA transaction identifiers.
  2. It attempts to obtain private BEFA data, but the current method intentionally throws because no BEFA source is configured.
  3. If an actual BEFA source is subsequently implemented, the intended design stores a PENDING checkpoint before the bank call, sends an idempotency key to the bank, then finalizes the result.
  4. The current bank client targets a placeholder internal URL. It must not be treated as a configured production endpoint.

The intended safety principle is to keep an uncertain payment PENDING until an authoritative bank status is known. The reconciliation scheduler is present in non-fixture code, but an operational reconciliation service still depends on a valid bank endpoint, robust status semantics, credentials, retry controls, alerting, and production testing.

4.5 Fiscal receipt and authority-fixture workflow

PURPOSE AND BOUNDARY:
  Fiscal receipt processing is a separate workflow from payment processing. A bank payment can succeed while the fiscal authority response is rejected, unavailable, or queued. In that case the payment remains completed/settled and the fiscal document is tracked separately for follow-up; receipt rejection must not roll back or mislabel a successful payment.

CURRENT FIXTURE PATH:
  1. A transaction flow reaches a fiscalization point after payment/capture has been finalized. This is used for standard completed purchase/sale transactions, settled BEFA payments, captured pre-authorizations, refunds, and reversals.
  2. The fiscal receipt service sends the transaction and credit-note indication through a `FiscalAuthorityClient` boundary.
  3. Under the `fixture` backend profile, `FixtureFiscalAuthorityClient` reads `src/main/resources/fixtures/fiscal-authority-response.json`. The fixture path can be overridden with the `fiscal.authority.fixture-file` setting in the fixture profile.
  4. The JSON fixture supplies a simulated submission status, response code/message, and prefixes for test authority/document identifiers. The adapter derives reproducible test identifiers from the transaction identity and amount snapshot. Accepted fixture results receive `TEST-FISCAL-...` and `TEST-SIGNATURE-...` values; they are not official identifiers or cryptographic authority signatures.
  5. The service records a `TaxTransaction` fiscal-submission row with POS transaction linkage, currency, gross/VAT/service-fee/net totals, customer TIN where present, register, response fields, status, fixture mode, and credit-note/original-transaction linkage. The POS transaction also stores the latest fiscal status/mode/response metadata for transaction API responses.
  6. The frontend transaction response and detail views display fiscal reference, signature, submission status/mode, authority response code/message, and submission time. An accepted fixture response means only that the local simulator returned ACCEPTED.

FIXTURE OUTCOME TESTING:
  • `ACCEPTED`: creates test-only fiscal reference and signature values.
  • `REJECTED` or `FAILED`: records the response without fiscal reference/signature. Payment remains completed/settled; finance or operations can identify the fiscal exception.
  • `QUEUED`: records a queued result and leaves the authority submission timestamp empty.
  • Other values must match the backend `TaxSubmissionStatus` enumeration; an unsupported fixture status is a configuration error.
  • To test another outcome, modify a non-production fixture copy or point `fiscal.authority.fixture-file` at a test JSON response. Never use fixture mode or fixture identifiers to produce a statutory customer receipt.

NON-FIXTURE PATH AS CURRENTLY IMPLEMENTED:
  The selected `UnconfiguredFiscalAuthorityClient` records `FAILED`, mode `NOT_CONFIGURED`, code `AUTHORITY_NOT_CONFIGURED`, and no official reference/signature. It deliberately does not throw an exception that would roll back an already successful payment. This is a safe integration placeholder, not a real authority connection.

FUTURE AUTHORITY ADAPTER CONTRACT:
  Replace the unconfigured client with a jurisdiction-approved authority adapter while retaining the service boundary and persisted submission history. The future adapter should build a canonical request from the transaction snapshot, including document type, transaction and original-transaction identifiers, issue time, currency, seller/branch/register identity, buyer details permitted by law, each line's code/description/quantity/price/discount/VAT category/rate/taxable base/VAT/fees, transaction totals, withholding/certificate details when applicable, payment-method summaries without card secrets, and a stable idempotency key. Refunds should use a credit-note document only where the tax rules require it; reversals require their own approved fiscal treatment.

  The real adapter must validate and retain the authority's actual accepted reference, signature/token, response code/message, submission timestamp, and status. Rejections and outages must remain visible and retryable under authority rules. Retries must not create duplicate receipts. Any request/response payload retention must be privacy-reviewed, encrypted/redacted as appropriate, access-controlled, and covered by retention rules. Production must fail deployment or health checks if the fixture adapter is active.

4.6 Pre-authorization, capture, cancellation, and expiry

CREATION:
  • A pre-authorization is recorded with business type SALE or PURCHASE, a positive hold amount, expiry time, and optional line-level pricing information.
  • Default expiry is 72 hours when the caller does not specify another value. The request can carry an expiry duration and an automatic-capture amount, subject to validation.
  • Withholding VAT requires itemized VAT detail and certificate information in the relevant flow.
  • The authorization records its hold separately from captured value. It is not automatically treated as settled revenue.

MANUAL CAPTURE:
  • The service accepts capture only for an active AUTHORIZED or PARTIALLY_CAPTURED pre-authorization that has not expired or already been manually captured.
  • Requested amount must be positive, within the remaining hold, and—when withholding VAT applies—must capture the full remaining cash/card balance.
  • A capture operation record stores the amount, cumulative amount, idempotency key, provider reference, provider status, and time.
  • An unused portion is released through the pre-authorization operations interface.
  • The current manual-capture flag closes the authorization after a manual capture; subsequent manual attempts are rejected. Depending on amount, the state becomes CAPTURED or PARTIALLY_CAPTURED.
  • Amount components are proportionally adjusted for itemized captures. Actual processor capture/release behavior depends on which pre-authorization operations implementation is active.

CANCELLATION:
  • Cancellation is intended for an authorized, uncaptured pre-authorization.
  • The request includes an idempotency key and reason. A repeated request with the same cancellation key can return the prior result; a different key is rejected once cancellation is complete.
  • The service requests release of the hold, records release reference/status, changes the authorization to CANCELLED, and writes an audit entry.

EXPIRY:
  • A scheduled service queries AUTHORIZED or PARTIALLY_CAPTURED records whose expiry has passed. Its interval is configured through application properties.
  • If a configured auto-capture amount is positive and no manual capture has taken place, the service attempts to capture that amount and release the remaining hold.
  • Otherwise, the service releases the uncaptured balance. If there is a captured amount, it finalizes the underlying business transaction; if nothing was captured, it marks the record EXPIRED.
  • Scheduler exceptions are logged and one failed item does not intentionally stop the remaining expiry batch.

The auto-capture behavior is an implementation option and must be approved as a business rule before activation. In particular, automatic no-show fees require explicit customer terms, processor support, tax treatment, and operational review.

4.7 Refund workflow

1. A manager-authorized refund request identifies the original transaction, amount, idempotency key, and reason.
2. The backend verifies that the parent is a SALE in a supported captured/completed state and that the configured refund window has not expired.
3. The refundable ceiling is bounded by the lesser of captured value and recorded refundable value, less prior refunds. Attempts to exceed the remaining balance are rejected.
4. The backend calculates a proportional gross/VAT/service-fee allocation using the parent transaction totals. It rounds to two decimal places using HALF_UP and adjusts the gross component for any rounding remainder so the components equal the requested refund total.
5. It creates a REFUND transaction linked to the parent, generates fiscal receipt fields using the current simulated receipt service, and updates the refund and parent statuses.
6. The parent record retains its original transaction amounts while its refunded amount and status are updated.

Critical limitation: the current service explicitly describes the payment-gateway refund as a production integration point and then marks the refund REFUNDED in application state. The code reviewed does not demonstrate an actual bank refund call. A database status of REFUNDED must not be treated as proof that funds were returned until processor integration and reconciliation are implemented.

The current proportional refund method allocates from transaction-level totals; it is not the line-by-line, tax-category-preserving refund algorithm asserted in the previous document. Physical stock restocking on a refund is also not established by the current item-management path.

4.8 Reversal workflow

• A technical reversal is restricted to a PENDING transaction without captured or settled timestamps.
• A reversal is recorded as a linked transaction and audited; it is not a substitute for refunding a completed sale.
• The service rejects requests against settled/captured transactions and prevents incompatible transitions.
• Authorization cancellation is a distinct workflow and should be used for eligible pre-authorizations.
• The security configuration associates reversal with senior cashier/manager/admin roles, but the controller currently supplies a hard-coded SYSTEM/MANAGER audit identity. The real authenticated operator is therefore not reliably represented by the controller's audit attribution.

4.9 Transaction lookup and recovery

Operators can search by transaction details and use bank-payment lookup endpoints for identifiers including transaction, BEFA payment, and bank transaction references. A safe recovery runbook is:

1. Stop repeated payment attempts while the original result is uncertain.
2. Search the backend by the BEFA identifier, POS transaction ID, idempotency key when available, or bank transaction reference.
3. Inspect current status, timestamps, parent/child links, capture records, and audit history.
4. If still PENDING, use the configured authoritative bank status lookup or reconciliation process.
5. Record the investigation and only initiate a new payment after confirming that the prior attempt did not settle.

The backend reconciliation scheduler, when enabled outside the fixture profile, runs on a five-minute fixed delay and selects pending records older than three minutes. It polls by idempotency key. SUCCESS is finalized as settled; FAILED or NOT_FOUND is finalized as failed; unknown status remains pending. These settings are source-code behavior, not a guarantee of effective production operation.


5. PRICING, VAT, WITHHOLDING, AND MONEY

5.1 Monetary representation

The current service model uses Java BigDecimal values and database NUMERIC/DECIMAL monetary columns after the decimal-money migration. Monetary values are represented in major currency units with two decimal places in the current pricing logic. The prior document's assertion that all API values are integer santim/cents is not consistent with the reviewed service and migration state.

The configured business currency defaults to ETB in backend configuration and is stored as a three-letter ISO currency code. Settings validate the code, and new transactions are required to match the currently configured currency. The system does not perform currency conversion. Existing transactions retain their own currency code. Reports spanning a business-currency change should therefore be grouped or filtered by currency before they are used for accounting.

The frontend formatter and currency selector must be kept aligned with backend amounts and transaction currency. Do not label amounts as UGX, ETB, or another currency unless the transaction's currency code confirms it.

5.2 Line calculations

For each line, the service computes the entered subtotal as unit price multiplied by quantity less the line discount. A negative result is rejected.

For VAT-exclusive entered prices:
  Taxable base = entered subtotal.
  VAT = taxable base multiplied by the active category rate, rounded to two decimals.

For VAT-inclusive entered prices:
  VAT = inclusive subtotal multiplied by rate divided by one plus rate, rounded to two decimals.
  Taxable base = inclusive subtotal less VAT.

For exempt lines or a zero VAT rate:
  VAT is zero and the line base remains the entered subtotal.

Line amount due:
  Taxable base plus VAT plus any configured customer service fee.

The service fee is optional and applied to the taxable base. The reviewed default service-fee rate is 2%, but the value is configurable. The sale/pre-authorization flow controls whether a customer fee is applied; it must not be described as a statutory tax.

5.3 VAT category management

• Each taxable item must carry a VAT category code that resolves to an active backend rate. Missing or inactive categories fail calculation rather than silently defaulting to a rate.
• Pricing configuration supports category code, category name, rate, and active state. Duplicate category codes and disabling all categories are rejected.
• Updating the pricing configuration can deactivate omitted existing active categories and creates or updates submitted categories.
• Zero-rated and exempt treatment should remain distinct in reporting and statutory policy even though both can yield zero VAT.
• The source does not establish the previously claimed default rate matrix, country-specific 20% rate, or statutory classification in every deployment. Confirm all rates with the tax authority and finance owner before production.

5.4 Withholding VAT

Withholding VAT is an optional transaction adjustment. The backend selects a separately configured sale or purchase withholding rate and calculates the amount as a proportion of transaction VAT. A request to apply it requires a certificate number and date, and the configured rate must be greater than zero. Certificate data without withholding selection is rejected.

The withholding amount changes the amount that must be covered by tenders/authorization. It does not replace the ordinary output VAT calculation. Confirm its accounting treatment, certificate validation, tax filing, and refund behavior with finance and tax counsel; the implementation does not prove compliance with any particular jurisdiction's filing rules.

5.5 Rounding and reconciliation

Calculations use two-decimal HALF_UP rounding at line and transaction component boundaries. Refund allocation corrects rounding drift in the gross component. Finance acceptance testing should compare:

• Sum of line gross, VAT, fees, and net to transaction totals.
• Sum of tender amounts applied to amount due, including cash change behavior where applicable.
• Captured amount, pre-authorization release, and processor statement values.
• Original sale amounts, linked refunds, and residual refundable balance.
• Report totals against a controlled ledger and source transaction sample.


6. DATA MODEL AND RECORD RETENTION

6.1 Principal entities and their business meanings

POS TRANSACTION
  The principal operational ledger entry. It carries transaction and business types, status, currency, totals, cashier/register context, idempotency and external references, customer details, refund/pre-authorization values, dates, and parent-child linkage.

TRANSACTION LINE ITEM
  An item-level snapshot of product code/name, quantity, unit price, discount, tax category/rate, and gross/VAT/service-fee/net components. The snapshot preserves calculation context for review.

PAYMENT TENDER
  A tender component for split or single-method payments. Fields include payment method/provider, tendered and applied amount, change, tender status, and selected card/reference details. This is not a mandate to retain full payment-card data.

CAPTURE OPERATION
  A record of capture operation type, idempotency key, requested and cumulative amount, provider reference/status, and timestamp. It is used to trace pre-authorization capture activity.

POS AUDIT LOG
  A business audit entry linked to a transaction, with actor identifier/role, action, previous and next statuses, reason/details, and creation time.

BANK PAYMENT AUDIT LOG
  A bank-payment request/response record linked to a transaction, including action/status and payload fields. Payload sensitivity, encryption, retention, access, and redaction require explicit operational controls.

VAT RATE / POS CONFIGURATION
  Tax category definitions and mutable application settings such as currency, service-fee rate, and withholding rates.

INVENTORY ITEM
  A tracked item code/name and on-hand quantity. Transaction line items link to inventory records and record whether a stock adjustment has already been applied.

TAX TRANSACTION
  A fiscal-submission record linked to a POS transaction. It retains currency and financial totals, submission mode/status, response information, optional reference/signature, and refund credit-note linkage. A fixture ACCEPTED record is a simulator outcome, not proof of authority acceptance.

6.2 State vocabulary

The backend transaction status enumeration includes:
  PENDING, AUTHORIZED, CAPTURED, COMPLETED, SETTLED, PARTIALLY_CAPTURED,
  PARTIALLY_REFUNDED, REFUNDED, REFUND_PENDING, REFUND_FAILED,
  REVERSAL_PENDING, REVERSAL_FAILED, REVERSED, FAILED, CANCELLED, EXPIRED.

The transaction type enumeration includes:
  SALE, PURCHASE, PRE_AUTH, REFUND, REVERSAL.

These are not interchangeable. Status describes lifecycle progress; type describes the operation/business record. Screens and reporting should present both fields consistently. The same system also has tender-level statuses; do not infer a whole transaction's settlement solely from one tender's status.

6.3 Retention and immutability

Transactions and audit rows are relationally linked, and migration history evolves their schema. The reviewed migration list ends with an encrypted-column-size migration at V8. It does not include the previously described V8 immutable-audit trigger migration. No claim that transaction/audit rows are append-only, undeletable, or immutable is supported by that migration inventory. The initial schema includes cascading relationships in some tables.

The parent sale retains its original financial totals when the refund workflow updates its refunded amount/status, but that behavior alone does not make the entire audit ledger immutable. Define retention, correction, access, deletion, backup, and legal-hold policies separately.


7. FRONTEND PRODUCT AREAS AND USER JOURNEYS

7.1 Authenticated application and navigation

The frontend routes application pages behind a protected-route wrapper, with a separate login page. The main navigation gives access to dashboard, transactions, transaction actions, purchase/payment flow, terminal sale, search, pending bank payments, sales, reports, item reports, financial audit, settings, and fixture-template tools. Route protection is a user-experience layer; the backend must independently authorize every data-changing and sensitive read operation.

7.2 Dashboard

The dashboard requests a backend summary and presents an operational overview. The actual measures and semantics are determined by the backend dashboard endpoint and query implementation; finance should reconcile definitions such as total sales, tax, pending values, and refunds before using the dashboard as a formal ledger.

7.3 Transactions and transaction details

The transaction list supports backend pagination and navigation to a transaction detail page. The detail workflow presents recorded values, lifecycle status, transaction identifiers, related information, and available actions according to the current data. Transaction-action screens support looking up existing records before capture, refund, reversal, or other permitted operations.

7.4 Sale terminal

The terminal sale workflow loads or accepts sale information, lets the cashier review line items, pricing, VAT, customer and tender details, then submits a sale or pre-authorization. The UI validates inputs and provides a result/unknown-outcome state. In HTTP payment mode it calls the backend integration path; the effective backend profile still determines whether the result comes from a fixture or a real configured processor.

7.5 Purchase form and bank-payment page

The general transaction page handles purchase/pre-authorization and transaction actions. The bank-payment page shows pending records and provides a new-purchase path. A pending list is operational follow-up, not a confirmation that funds have or have not settled. Operators should inspect the authoritative status before retrying.

7.6 Search

The frontend search experience supports transaction search and criteria such as status/type, register/cashier, customer, identifier, and date depending on the selected search. The backend includes additional search filters beyond the current frontend wrapper. Search is subject to server authorization rules and sensitive-data handling requirements.

7.7 Reports and finance

Frontend reporting areas include dashboard metrics, operational reports, financial audit, item reporting, revenue/VAT/fees/refunds, tender breakdowns, cashiers/registers, and transaction trends. Backend reports use date range inputs for many operations and may return no-data responses as HTTP 404. Report contract alignment and exact accounting definitions are covered in Sections 8 and 9.

The Fiscal reports page (`/fiscal-reports`) reads persisted fiscal-submission rows from the backend. It supports created-date, status, submission-mode, receipt/credit-note, and identifier/TIN filters; paginates results; links each row's fiscal record ID to a fiscal receipt/detail view; and exports the visible page as CSV. The detail view shows stored fiscal response/reference metadata, totals, taxpayer/register information, receipt line items, VAT, discounts, fees, and linked original transaction where applicable. It is assembled from the saved fiscal record and linked POS transaction; the application does not currently retain a raw authority wire-request payload. In fixture mode no tax authority is contacted, so a fixture response is simulated rather than an authority acknowledgement. Status counts other than the overall matching-record total describe only the current page.

7.8 Settings

The Settings page displays currency, pricing/VAT configuration, payment integration mode, fixture/HTTP source paths, and POS API status messaging. Currency and pricing writes are rendered for administrators in the UI and restricted in the backend. The UI describes notification preferences as future functionality because the backend does not currently expose a persisted notification-preference service.

Database connection credentials are intentionally not displayed in the browser.

7.9 Test transaction-data editor

The fixture-only editor lets a signed-in user load, edit, and save separate PURCHASE and SALE JSON templates. The backend validates the JSON object and selected arrays, stores each user's uploaded files in a private username-derived directory, and writes updates through a temporary file followed by a move. A user's saved fixture overrides the configured default for that user's fixture payment flow. This is a test-data management tool, not a production transaction editor.


8. BACKEND API CATALOG

The following paths are based on the reviewed Spring controllers. The service commonly uses the `/api/v1` prefix; the POS controller groups use `/api/v1/pos`. HTTP method, request DTO, status code, authorization, and response wrapper should be confirmed in the API contract or Postman collections before external integration.

8.1 Authentication and administrative migration

Authentication:
  POST `/api/v1/auth/login` — authenticate using the current demo login implementation and return a bearer token.
  POST `/api/v1/auth/validate` — validate the presented bearer token and return validity and identity claims.

Administrative migration:
  POST `/api/v1/admin/migration/key-rotation` — invoke payment-tender key/data migration; intended for an ADMIN role. This is an administrative maintenance action, not an ordinary POS workflow. Take and verify backups, confirm the applicable encryption-key versions, and test a rollback/recovery procedure before use.

8.2 Transactions

Base path: `/api/v1/pos/transactions`

  POST `/purchase` — create a purchase transaction with line items and tenders.
  POST `/preauth` — create a pre-authorization.
  GET `/{id}` — retrieve a transaction by identifier.
  GET `/pending` — retrieve paged pending transactions, optionally filtered by date range.
  POST `/{id}/capture` — capture an eligible pre-authorization.
  POST `/{id}/cancel` — cancel an eligible uncaptured authorization.
  POST `/{id}/refund` — create a linked refund subject to policy.
  POST `/{id}/reverse` — reverse an eligible unsettled pending transaction.

There is no dedicated `/transactions/sale` endpoint in the reviewed controller. Sale payments enter through the bank-payment integration flow or through the pre-authorization endpoint with SALE as the business type. The frontend routes are centralized in its API client. Backend path spelling uses `/preauth` (not `/pre-auth`). The controller uses the path variable called `id` for service lookup; operational identifiers should be validated against the repository lookup contract.

8.3 Bank-payment integration

Base path: `/api/v1/pos/bank-payments`

  POST `/preview` — load BEFA payment review data.
  POST `/execute` — execute or simulate a bank-payment workflow according to the active backend profile.
  GET `/status/{befaPaymentId}` — look up a transaction by BEFA payment identifier.
  GET `/lookup/{identifier}` — return one transaction matched by any supported identifier.
  GET `/lookup/{identifier}/all` — return all matching transactions.

The current backend does not expose a bank health endpoint in the reviewed payment controller. A frontend environment variable or README reference to a health URL should not be assumed to correspond to a working backend route.

8.4 Search

Base path: `/api/v1/pos/search`

  GET `/transactions`
  GET `/fulltext`
  GET `/refunds/{parentTransactionId}`
  GET `/reversals/{parentTransactionId}`
  GET `/children/{parentTransactionId}`
  GET `/customer-name`
  GET `/customer-tin`
  GET `/amount-range`
  GET `/card-last-four`
  GET `/payment-method`
  GET `/vat-category`
  GET `/item-code`
  GET `/recent`
  GET `/recent-cashier/{cashierId}`
  GET `/recent-register/{cashRegisterId}`

Search supports pagination in applicable endpoints. Sensitive identifiers must not be written to ordinary logs or exposed to roles that do not need them.

8.5 Reports, dashboard, settings, and items

Dashboard:
  GET `/api/v1/pos/dashboard/summary`

Financial and operational reports under `/api/v1/pos/reports`:
  GET `/financial-audit`
  GET `/fiscal-submissions` (paginated; optional `dateFrom`, `dateTo`, `status`, `mode`, `creditNote`, and `query` filters)
  GET `/fiscal-submissions/{taxTransactionId}` (fiscal receipt result and linked POS receipt line details)
  GET `/revenue`
  GET `/cashier-performance`
  GET `/payment-method-breakdown`
  GET `/daily-summary`
  GET `/monthly-summary`
  GET `/transaction-stats`
  GET `/top-cashiers`
  GET `/top-registers`
  GET `/vat`
  GET `/service-fees`
  GET `/refunds`
  GET `/register-reconciliation/{cashRegisterId}`
  GET `/failed-transactions`
  GET `/unsettled-transactions`
  GET `/high-value-transactions`
  GET `/transaction-count-by-status`
  GET `/hourly-volume`
  GET `/average-transaction-value`
  GET `/gross-vs-net`
  GET `/refund-rate`

Settings:
  GET and PUT `/api/v1/pos/settings/currency`
  GET and PUT `/api/v1/pos/settings/pricing`

Items:
  GET `/api/v1/pos/items`
  GET `/api/v1/pos/items/report`

Fixture-only test templates:
  GET and PUT `/api/v1/test-transaction-data/{transactionType}`, with transaction type restricted to PURCHASE or SALE.

8.6 API contract notes

• The frontend has response-normalization helpers for paginated data and report lists, but this does not change the backend's actual response shape or business meaning.
• Several report methods in the backend require `dateFrom` and `dateTo`. The frontend API wrapper should be checked endpoint by endpoint; for example, frontend daily/monthly summary calls currently use date or year/month parameters while the backend controller accepts date ranges. Align these contracts before treating those screens as fully reliable.
• Backend search includes filters not currently surfaced by the frontend wrapper.
• Some backend endpoints return HTTP 404 when a list is empty; other list APIs may return an empty page or array. Client handling must distinguish "no matching records" from infrastructure failure without hiding genuine service errors.
• API endpoint access is not uniform: some transaction and bank-payment routes are explicitly public in the current security configuration, while reports/settings/other operations have role rules or require authentication. See Section 10.
• Fiscal submission reports are available to the roles authorized for reports (MANAGER and ADMIN in the reviewed backend security configuration). Date filters use the fiscal-row creation timestamp; the separate authority-submission timestamp can be empty, for example for queued outcomes.


9. REPORTING, RECONCILIATION, AND AUDIT

9.1 Report families

The backend exposes:

• Revenue, VAT, service-fee, and refund totals for date intervals.
• Cashier and register activity.
• Daily and monthly aggregations.
• Transaction counts, status counts, average transaction value, refund rate, and hourly volume.
• Gross-versus-net views, failed/unsettled/high-value transaction lists, and register reconciliation.
• A distinct financial-audit endpoint.
• Item-level reporting.
• Payment-method/tender breakdown and linked refunds/reversals/children through search/report endpoints.

The existence of a report endpoint does not by itself prove a statutory accounting definition. Report owners must agree on date basis (created, captured, settled, or refund date), timezone, status inclusion, currency grouping, treatment of withholding VAT, fee classification, and whether refunds are represented by child rows or netted from parent rows.

9.2 Known reporting interpretation risks

• The previous document asserted that revenue always excludes output VAT, includes service charges, and subtracts refunds according to specific status/time rules. The current report query/controller implementation must be audited report by report before adopting these formulas as policy.
• The previous document asserted that supplier purchases are excluded from revenue. This is a reasonable accounting requirement, but it must be confirmed in each report query rather than assumed.
• The previous document specified a fixed payment-method totals placement in CSV exports. The reviewed frontend and backend source do not establish that layout/export behavior.
• Numeric database columns and BigDecimal service calculations are in major units; report repository/controller signatures and frontend display should be tested for consistent units and currency.
• Summary endpoints and empty result behavior are not uniform. Finance users need an explicit "zero activity" versus "data unavailable" distinction.

9.3 Audit records

The application records business transaction actions and bank-payment request/response events. Fiscal submission history is also stored separately in `tax_transactions`, while the POS transaction stores its latest fiscal status/mode/response fields. Events should support investigation of actor, action, status change, reason, timing, processor reference, and parent-child relations. However:

• Some controllers provide hard-coded SYSTEM actor identities for capture, refund, reversal, or cancellation instead of deriving the actual authenticated principal.
• Audit immutability, database triggers, retention, alerting, and privileged access review are not demonstrated by the actual migration set.
• Bank response payload fields and sensitive search inputs require a documented redaction and encryption policy.
• Search currently logs TIN-related request material; production logging must avoid exposing plaintext tax identifiers.
• Only `TEST-...` fixture values are generated by the fixture adapter. Non-fixture mode records `AUTHORITY_NOT_CONFIGURED` and does not invent an official reference. Neither is an authoritative tax-authority acknowledgement.

Reconciliation controls should separately compare backend state against bank settlement reports, cash-register closure, tender totals, inventory movements, refund statements, and tax submissions. Any difference needs an owner, evidence, status, resolution reason, and retained approval trail.


10. AUTHENTICATION, AUTHORIZATION, PRIVACY, AND CONTROL LIMITATIONS

10.1 Current authentication design

• Backend uses Spring Security, a stateless session policy, and a JWT authentication filter.
• Tokens contain a subject, role claim, issue time, and expiry; the signing secret and expiry are configuration inputs.
• The current login controller uses in-source demo account records rather than a database-backed user store or verified external identity provider.
• The frontend stores its bearer token in browser local storage and clears it on logout or when a token is expired/invalid in the local check.
• No backend logout/revocation endpoint or durable token blacklist is established by the reviewed source.

10.2 Authorization is not uniform

The reviewed backend explicitly grants unauthenticated access to the authentication endpoints, purchase creation, pre-authorization creation, transaction-by-ID retrieval, and all bank-payment routes. Other operations include role rules for captures, reversals, refunds, pending transactions, reports, dashboard, search, settings, migration, and fixture file uploads. Unmatched endpoints generally require authentication.

This access matrix requires a security review before production, especially for payment execution, customer/TIN data, transaction reads, public creation routes, and bank-payment lookup. Do not infer access policy from frontend navigation alone.

10.3 Current security configuration caveats

• CORS is configured with wildcard origin patterns, broad methods/headers, and credentials enabled. This is not an appropriate production allowlist.
• CSRF is disabled as part of the stateless API configuration. Validate that all browser/session/token assumptions are correct for the deployed topology.
• Controller-level transaction action audit identities are partly hard-coded instead of being taken from the verified principal.
• The search controller logs TIN search input and its derived hash in a log statement; remove sensitive values from production logs.
• Rate-limit filters and request-per-minute/hour configuration exist, but actual thresholds, proxy/IP behavior, and production effectiveness require verification.

10.4 Cryptographic services

The backend contains services for JWT signing, AES-GCM encryption, deterministic HMAC-based searchable hashes, and an attribute converter. Key derivation uses PBKDF2WithHmacSHA256 in the reviewed encryption/hash services. These source facts do not establish PCI DSS compliance or prove that every sensitive entity field is encrypted.

The reviewed encryption and hash implementations use fixed source-defined salts. Key rotation has an administrative migration endpoint for payment-tender data, but its exact coverage, backup/restore behavior, multi-version key handling, and safe production execution must be documented and tested. Keep JWT, encryption, and hash keys distinct; rotate any key that has been disclosed; never paste secret values into tickets, documentation, source control, or browser code.

10.5 Compliance statement

This application has security-related controls, but this document does not claim PCI DSS certification, tax-system certification, data-protection compliance, or production authorization. Such claims require assessment of the complete system boundary, processor/device contracts, infrastructure, deployment configuration, key custody, network controls, operational evidence, and applicable law.


11. ERRORS, RETRIES, AND OPERATIONAL MESSAGES

The backend global exception handler maps a range of request-validation, duplicate, not-found, state, payment sufficiency, pre-authorization, refund, reversal, and inventory exceptions to structured responses. The ErrorResponse DTO supports a machine-readable code, message, optional details, retryability, and timestamp.

The frontend shared API client reports HTTP/network errors through a global error context and also renders page-level notices where appropriate. Login uses fetch and has its own response parsing and error path. Not every controller path uses the same error envelope; some return local maps, plain strings, 404 responses, or generic 500 responses.

Operational handling:

• Validation errors: correct the form/input; do not retry an unchanged request.
• Duplicate or idempotency conflict: retrieve the existing transaction before doing anything else.
• Not found: confirm identifier type, casing, and route; distinguish expected empty search from a backend issue.
• Timeout or unknown payment result: do not create a new key and resubmit until bank status is confirmed.
• Pending payment: treat as unresolved, not as paid or failed.
• Failed/declined: communicate a failure only when the authoritative processor result confirms it.
• Reconciliation or expiry scheduler error: retain the record for investigation, alert the responsible operator, and retry only according to the approved policy.

The application should standardize error envelopes, retryable flags, correlation IDs, privacy-safe logs, and consistent HTTP status behavior across all controllers before production.


12. ENVIRONMENTS, CONFIGURATION, AND DEPLOYMENT

12.1 Reviewed local settings

• Backend application properties select PostgreSQL, port 8082, Flyway migrations, and the fixture profile as both default and active profile in the reviewed repository baseline.
• Frontend local environment sets payment integration mode and POS data mode to HTTP.
• Vite proxies `/api` to the backend on localhost port 8082 during local development.
• Frontend HTTP mode and backend fixture profile are separate controls and can be active together.
• No production deployment manifest, orchestration target, production TLS certificate deployment, or independently verified production profile was established during this documentation review.

Frontend environment controls reviewed:
  `VITE_POS_API_BASE_URL` changes the POS API base path; otherwise the frontend uses `/api/v1/pos`.
  `VITE_POS_DATA_MODE` selects backend HTTP or browser-local fixture data; its code default is HTTP.
  `VITE_PAYMENT_INTEGRATION_MODE` selects the backend HTTP payment path or explicit frontend fixture simulation; its code default is HTTP.
  `VITE_BANK_PAYMENT_URL` changes the HTTP payment execution URL; the default is the backend's `/api/v1/pos/bank-payments/execute` route.
  `VITE_BEFA_PAYMENT_URL` supplies a displayed/configured fixture path, but the reviewed preview call itself posts to the backend preview route.
  `VITE_BANK_PAYMENT_RESPONSE_URL` changes the bank-response JSON path used by frontend fixture mode.

The prior frontend README mentions a `VITE_BANK_HEALTH_URL` override, but the reviewed frontend source does not read that variable, and the reviewed backend payment controller does not expose a bank health route. Do not rely on that setting until both sides implement and test the contract.

12.2 Profile behavior

FIXTURE PROFILE:
  • Uses fixture payment service implementations and local JSON payment data.
  • Enables purchase/sale fixture template GET/PUT APIs.
  • Stores fixture payment transactions in the backend relational database through the payment state manager.
  • Does not contact a real bank merely because a fixture response is saved as SETTLED.

NON-FIXTURE PROFILE:
  • Selects the bank payment service and reconciliation scheduler.
  • Currently cannot fetch BEFA data because the production method is intentionally unconfigured.
  • Uses a bank client with a placeholder endpoint. Replace it with a controlled, authenticated, environment-specific bank adapter before deployment.
  • Selects the fiscal authority client that records `FAILED` / `NOT_CONFIGURED`, rather than creating official receipt values.
  • Must not be enabled as "live" until all external requests, responses, errors, idempotency, and reconciliation have been verified against approved test and production environments.

12.3 Database migration practice

Flyway migrations present in the reviewed repository:
  V1__Create_initial_schema.sql — initial schema.
  V2__Add_performance_indexes.sql — performance indexes.
  V3__Add_test_inventory.sql — test inventory.
  V4__Add_preauth_capture_policy.sql — pre-authorization capture policy.
  V5__Use_decimal_money_and_snapshot_pricing.sql — decimal money and pricing snapshots.
  V6__Add_withholding_vat.sql — withholding VAT.
  V7__Repair_null_transaction_versions.sql — repair of null transaction versions.
  V8__Increase_encrypted_column_sizes.sql — encrypted-column size increases.
  V9__Add_fiscal_authority_submission_metadata.sql — allows absent receipt identifiers for non-accepted submissions and stores fiscal mode/status/response metadata and currency.

Use the versioned migration history as the authoritative source for schema evolution. Back up the database, test migrations against a production-like copy, verify row counts and numeric conversions, and maintain a rollback/forward-repair plan. The prior document's proposed immutable-audit V8 script is not part of this migration inventory and must not be described as deployed.

The reviewed configuration enables both Flyway and Hibernate `ddl-auto=update`. Establish a single explicit production schema-management policy and validate it from a clean database and an upgrade of a representative existing database. Do not make manual schema changes outside a tracked and reviewed migration process.

12.4 Production deployment gates

Before any real-money or statutory production use:

1. Replace demo authentication with approved identity management, least-privilege users, secure provisioning, account recovery, and access review.
2. Require authentication for all transaction reads and payment execution; confirm role rules and actor identity for every operation.
3. Set strict CORS origins, correct TLS termination, security headers, network boundaries, secret injection, and rate-limit behavior.
4. Replace placeholder BEFA and bank integrations with documented adapters, secret-managed credentials, timeouts, retries, idempotency, and independent processor confirmation.
5. Implement real status inquiry and durable reconciliation that handles ambiguous responses and safe retries.
6. Integrate actual processor capture, release, refund, and reversal operations; reconcile each returned reference to persisted state.
7. Replace the non-fixture `AUTHORITY_NOT_CONFIGURED` client with the approved authority service, retaining the fixture adapter for isolated testing and persisting verifiable acknowledgement/error records.
8. Define the authoritative country, currency, VAT categories/rates, fee rules, withholding policy, refund window, and accounting/report definitions.
9. Confirm encryption field coverage, key separation, key rotation runbooks, log redaction, audit retention, backup encryption, restore testing, and incident response.
10. Run end-to-end testing against approved bank/BEFA and tax-authority test environments, including outage and recovery scenarios.
11. Validate database migrations, concurrency behavior, idempotency under simultaneous requests, reports, currency boundaries, and inventory rollback.
12. Obtain security, finance, legal/tax, operations, and payment-provider approval before enabling production traffic.

12.5 Suggested release and recovery controls

• Separate development, integration test, pre-production, and production configurations and credentials.
• Require a named approver and a change record for changing payment profiles, endpoints, currency, tax rates, encryption keys, and refund policy.
• Promote immutable application artifacts and versioned migrations through environments; do not copy local fixture databases into production.
• Use monitored secret rotation and verify old/new-key compatibility before migrating protected records.
• Back up before schema or key migrations and test restore in isolation.
• Maintain a payment incident runbook that prioritizes status lookup and reconciliation over blind retry.
• Monitor pending/failed/unknown payments, scheduler health, bank latency, duplicate attempts, refund exceptions, stock conflicts, and report-generation failures.


13. KNOWN GAPS AND POINTS REQUIRING BUSINESS DECISION

The following are confirmed or material issues from the reviewed source, not assumptions that should be hidden in polished product descriptions:

PAYMENT CONNECTIVITY
  BEFA source is not configured in the non-fixture bank service. Bank client endpoint is a placeholder. Real bank payment health/settlement is not proven. The fixture profile is selected in the reviewed backend default.

SIMULATION STATUS
  Backend fixture payment outcomes persist in the database; frontend fixture outcomes persist in browser storage. Both require explicit labeling and separation from production financial reporting.

AUTHENTICATION
  Login uses in-source demo users and a shared configured JWT signing secret. There is no verified identity-provider connection or backend logout/revocation workflow.

AUTHORIZATION
  Payment execution and key transaction access include public routes in the reviewed configuration. This must be resolved and tested before production.

OPERATOR AUDIT
  Some action controllers attribute changes to SYSTEM or a fixed role rather than the authenticated user.

REFUNDS
  Refund state changes are implemented, but actual processor refund execution is not. Current tax/fee allocation is transaction-level and does not implement the previous document's claimed per-line/per-category algorithm.

FISCAL RECEIPT
  Fixture profile reads a configurable JSON authority response and generates visibly test-only references/signatures for accepted outcomes. Non-fixture mode records `AUTHORITY_NOT_CONFIGURED`; no real tax-authority call is demonstrated.

AUDIT IMMUTABILITY
  The actual migration history does not contain the claimed immutable-audit trigger migration. Database/application immutability and retention controls are not verified.

DATABASE POLICY
  PostgreSQL is selected by current properties while both PostgreSQL and MySQL drivers are declared. Flyway and Hibernate schema auto-update are both enabled. Confirm the deployed vendor/version and settle the schema-evolution strategy.

REPORT CONTRACTS
  Daily/monthly frontend parameter conventions do not match the backend controller's date-range inputs in the reviewed code. Audit metric definitions and currency grouping before finance relies on outputs.

INVENTORY AND REFUNDS
  Sales and purchases adjust stock on successful processing. A physical-return workflow that restores stock after refunds is not demonstrated.

FISCAL / SECURITY CLAIMS
  Presence of cryptographic helpers, audit entities, rate limiting, or role checks does not prove legal compliance, PCI scope reduction, immutable audit, or production security.


14. PHASED DELIVERY PLAN

This is a recommended plan based on the gaps above. Owners and dates should be assigned by the product, operations, finance, security, and engineering leads. The phases are dependency-ordered; production bank operation should not be enabled ahead of the foundational controls.

PHASE 0 — BASELINE AND DECISIONS
Business outcomes:
  • Confirm which workflow means customer SALE, supplier PURCHASE, terminal card transaction, and bank payment.
  • Agree system-of-record boundaries for payment, tax, inventory, and customer data.
  • Approve country, legal entity, currency, VAT, service-fee, withholding, refund-window, and revenue policies.

Technical work:
  • Record the effective backend profile, database engine/version, frontend modes, base URLs, and migration version per environment without exposing secrets.
  • Map each UI action to its backend route and role policy.
  • Establish authoritative API schemas and response/error contracts.

Acceptance:
  • Product and finance sign off on a workflow/state glossary.
  • A deployment matrix distinguishes fixtures from live services unambiguously.

PHASE 1 — SECURITY AND CONTROL FOUNDATION
Business outcomes:
  • Restrict payment and customer data to staff who require it.
  • Ensure every operational change is attributable and reviewable.

Technical work:
  • Replace demo authentication; remove demo credentials from deployable code.
  • Require server-side authentication and role-specific authorization for sensitive routes.
  • Derive actor identity from the authenticated principal and record reasons for privileged actions.
  • Replace wildcard CORS with an environment allowlist; review TLS, headers, CSRF assumptions, and rate limits.
  • Remove sensitive TIN and payment details from logs; confirm encrypted-field coverage and retention policy.
  • Define key custody, versioning, rotation, backup, and incident procedures.

Acceptance:
  • Automated security tests prove denied roles cannot read or execute restricted operations.
  • Audit records identify the real actor and cannot be changed through ordinary application access.
  • Secrets are injected from an approved secret manager and are absent from repository and client bundles.

PHASE 2 — BANK AND BEFA INTEGRATION
Business outcomes:
  • A successful payment status means the configured processor confirms payment, not a fixture or local simulation.
  • Uncertain outcomes are safely recoverable without double-charging.

Technical work:
  • Implement an authenticated BEFA source and bank adapter with environment-specific endpoints.
  • Agree request/response schemas, processor idempotency key semantics, status vocabulary, amount/currency units, and bank references.
  • Preserve durable pending checkpoints before outbound network calls.
  • Implement authoritative status lookup, bounded retry policies, timeouts, circuit/availability monitoring, and reconciliation.
  • Implement capture, release, refund, and reversal processor calls as applicable.
  • Keep local fixture services unavailable in production or fail deployment when fixture mode is active.

Acceptance:
  • Integration tests cover approved success, decline, duplicate, timeout-before-response, timeout-after-processor-success, unknown status, and bank outage cases.
  • Every state transition reconciles to processor evidence and is idempotent under repeated/simultaneous requests.
  • A bank-confirmed settlement report can be reconciled to stored transactions.

PHASE 3 — TAX, FISCALIZATION, AND FINANCIAL RULES
Business outcomes:
  • Tax receipts and reports are accurate for the operating jurisdiction.
  • Accounting treatment is approved for VAT, service fees, withholding, purchases, refunds, and captures.

Technical work:
  • Keep the explicit JSON authority fixture for development and integration testing. Implement the production authority client behind the existing client boundary; replace fixture values with authority-issued identifiers and validated signed responses.
  • Define tax categories, effective dates, exemptions, rounding, credit-note, and withholding rules.
  • Implement tax authority errors, retry/idempotency, acknowledgement tracking, and jurisdiction-approved credit-note linkage.
  • Align report definitions with finance and tax filings; explicitly group by currency and lifecycle date.
  • Align frontend daily/monthly report parameters and response normalization with backend contracts.

Acceptance:
  • Finance validates a reference pack of sales, mixed VAT, discounts, inclusive prices, withholding, partial refunds, and currency cases.
  • Reports reconcile to a controlled ledger and authority test environment.

PHASE 4 — INVENTORY, RETURNS, AND OPERATIONS
Business outcomes:
  • Stock movements correspond to completed sales, purchases, and approved physical returns.
  • Register and cashier exceptions are manageable from the product.

Technical work:
  • Confirm item-code/master-data ownership and the rule for missing inventory items.
  • Add an explicit return/restock decision and workflow for refunds.
  • Add register opening/closing and reconciliation controls if required by operations.
  • Add alerts, operational dashboards, scheduler health, and exception queues.
  • Define retention, archive, recovery point, and recovery time targets.

Acceptance:
  • Inventory balances reconcile across successful sales, purchases, cancellations, refunds, and repeated events.
  • Operators can trace an exception from UI to transaction, audit record, processor reference, and resolution.

PHASE 5 — PRODUCTION READINESS AND GOVERNANCE
Business outcomes:
  • Release safely, recover quickly, and demonstrate sustained control operation.

Technical work:
  • Finalize production profile, container/orchestration design, monitoring, logs, TLS, backups, database migration and rollback procedures.
  • Execute load, concurrency, resilience, restore, disaster-recovery, and penetration/security test plans.
  • Maintain role reviews, dependency updates, incident playbooks, change approvals, and compliance evidence.

Acceptance:
  • Business, finance, security, operations, and payment-provider owners approve go-live.
  • Production launch checklist, support runbooks, monitoring, rollback, and incident contacts are tested.


15. OPERATIONAL CHECKLISTS

15.1 Before starting a local fixture demonstration

• Confirm frontend and backend are using the intended fixture/HTTP combination.
• Display a persistent "simulation" indication for fixture outcomes.
• Use test identifiers and data only.
• Confirm demo transactions are clearly marked and excluded from live financial reporting.
• Use a non-production database and isolated fixture files.

15.2 Before executing a live transaction

• Confirm the application is deployed to the approved environment and reports the intended non-fixture backend profile.
• Confirm BEFA and bank connectivity and credentials are healthy without revealing secrets in the UI or logs.
• Verify transaction amount, currency, cashier/register, customer details, VAT, fee, and tender.
• Confirm an idempotency key is present and bound to this one intent.
• Review prior transaction status by BEFA/payment identifier before retrying.
• On an uncertain response, keep the transaction unresolved until status inquiry completes.
• Save processor references and reconcile the final result.

15.3 Before changing tax or currency settings

• Obtain finance/tax approval and record effective date.
• Understand that currency changes apply to new transactions and do not convert existing balances.
• Confirm reports will not aggregate unlike currencies.
• Review active/inactive category effects on existing and new items.
• Validate calculations in a test environment and preserve a before/after record.

15.4 Before running a key-rotation or schema migration

• Confirm the exact environment and administrator identity.
• Read the implementation and expected affected data set; do not infer scope from the endpoint name.
• Create and verify a restorable backup.
• Test on a database copy and compare affected row counts and decryptability.
• Coordinate application versions and key versions to prevent partial access loss.
• Run during an approved window, monitor logs/metrics, and verify post-migration reads and payment workflows.
• Record approver, operator, time, outcome, and recovery decision without recording key material.


16. VERIFICATION AND DOCUMENT MAINTENANCE

This version was prepared by comparing the supplied prior master document with the reviewed backend and frontend source/configuration. It corrects known mismatches, including:

• Backend profile and frontend mode are separate; the reviewed backend selects fixture mode.
• PostgreSQL is selected by runtime properties, but the exact deployed PostgreSQL major version is not verified.
• The actual migration V8 expands encrypted-column sizes; it is not an immutable-audit trigger migration.
• Login uses in-source demo users, not an external identity provider.
• Fiscal receipt generation now uses a profile-based client boundary: fixture responses are simulated and clearly marked, while non-fixture mode records `NOT_CONFIGURED`; neither contacts an authority.
• The non-fixture BEFA source is unconfigured and the bank client URL is a placeholder.
• Ordinary purchase tender authorization is simulated in the reviewed service.
• Refund status is updated in the service without a demonstrated processor refund call.
• Refund proportional allocation is based on transaction totals, not the previously claimed line-level tax-category algorithm.
• Database monetary representation is decimal/major-unit based after the decimal migration, not universally integer santim.
• Audit immutability, production CORS/TLS, and production readiness are not established.

Update this document when any of the following changes: backend routes or DTOs, transaction-state rules, database migrations, active runtime profiles, payment/fiscal integrations, security configuration, frontend workflows, tax policy, report definitions, or deployment controls.

For each update:
1. Verify the behavior from source and tests.
2. Mark each statement as implemented, configured, partial/simulated, or planned.
3. Confirm API contracts from controllers and integration tests.
4. Reconcile workflow language with finance and operations.
5. Recheck that no credentials, private keys, personal data, or sensitive payment payloads are included.

END OF DOCUMENT
