# POS Terminal Module Plan

This folder is reserved for a separate, device-oriented POS terminal interface. It will share the existing backend contract but must not replace the browser administration POS screens.

## Purpose

The terminal app supports purchase/sale, pre-authorization, capture, reversal, refund, receipt printing, and reliable device recovery. It is designed for Android payment terminals and older fixed POS workflows: large touch targets, a constrained single-task flow, obvious connection/payment states, and no browser-like dashboard clutter during checkout.

## Architecture

```text
Terminal UI (Android kiosk / React shell)
  -> Terminal orchestration client
  -> Native Android payment bridge (device SDK, printer, scanner, secure PIN pad)
  -> POS backend transaction API
  -> BEFA / bank adapter
```

A web page alone must not handle card/PIN/EMV data. For Android terminal hardware, use the acquirer/device vendor SDK in a native Android application or Capacitor bridge. The terminal UI asks the bridge to start a payment; the bridge returns only a tokenized result, masked card details, and device reference. PAN, PIN, and cryptograms must never enter browser JavaScript, application logs, or the current POS backend unless the certified payment architecture explicitly requires it.

## Backend additions (additive; existing endpoints remain unchanged)

1. `POST /api/v1/pos/terminal/sessions` – opens a device session with device ID, register ID, cashier identity, and software version.
2. `POST /api/v1/pos/terminal/transactions/purchase` – creates a server-side transaction intent and idempotency key.
3. `POST /api/v1/pos/terminal/transactions/{id}/payment-result` – accepts a tokenized/acquirer result from the native bridge and finalizes or leaves it pending.
4. `POST /api/v1/pos/terminal/transactions/preauth` – creates an authorization-hold intent.
5. `POST /api/v1/pos/terminal/transactions/{id}/capture` – captures an approved pre-authorization.
6. `POST /api/v1/pos/terminal/transactions/{id}/reverse` and `/refund` – role-gated financial actions.
7. `GET /api/v1/pos/terminal/transactions/{id}/status` – polling-safe status recovery.
8. `POST /api/v1/pos/terminal/receipts/{id}/print` – queues receipt rendering/printing; return a job ID.
9. `GET /api/v1/pos/terminal/devices/{deviceId}/health` – returns device registration, integration, printer, paper, network, and clock status.

Every financial request needs an idempotency key created before the native device call. Unknown network outcomes remain `PENDING`; the terminal must query status rather than blindly submit a new charge.

## Terminal state machine

```text
IDLE
  -> CASHIER_SIGN_IN
  -> BASKET_OR_BEFA_LOOKUP
  -> REVIEW_TOTAL
  -> SELECT_TENDER
  -> DEVICE_PROCESSING
  -> APPROVED | DECLINED | PENDING | OUTCOME_UNKNOWN
  -> PRINTING_RECEIPT
  -> COMPLETE
```

`PENDING` and `OUTCOME_UNKNOWN` must show the same safe message style everywhere: "Payment status is being confirmed. Do not remove the card or retry." The available action is `Check status`, not `Pay again`.

## UI direction

- Full-screen landscape-first terminal layout; support portrait Android handhelds.
- 48px minimum touch targets, high contrast, readable totals, and no hover-only controls.
- Persistent top status strip: terminal ID, register, cashier, network/online state, and time.
- Two-column checkout: basket/BEFA detail at left; large total and tender actions at right.
- Fixed lower action bar: Cancel, Back, Confirm, and contextual primary action.
- Device-native loading language and formats:
  - `Connecting to payment service…`
  - `Reading card…`
  - `Enter PIN on the payment terminal`
  - `Processing payment — do not remove card`
  - `Printing receipt…`
  - `Payment pending — checking status`
- Use a modal blocking state only while a device operation is active. It must display the transaction reference, elapsed time, and a recovery action where appropriate.
- Success/decline screens use large outcome text, amount, masked tender data, reference, timestamp, and receipt/reprint actions.

## Suggested source layout

```text
pos-terminal/
  README.md
  src/
    app/
    screens/
      IdleScreen
      BefaLookupScreen
      BasketReviewScreen
      TenderScreen
      DeviceProcessingScreen
      PaymentOutcomeScreen
      PreAuthScreen
    components/
      TerminalStatusBar
      TerminalKeypad
      PaymentProgress
      ReceiptPreview
    services/
      terminalApi
      deviceBridge
      receiptPrinter
      offlineQueue
    state/
      terminalMachine
    styles/
      terminal.css
```

## Implementation phases

1. **Contract and certification**: select device/acquirer SDK, confirm token/result payloads, map bank status codes, define terminal/device identity and receipt rules.
2. **Terminal shell**: build the kiosk UI and local state machine using mock `deviceBridge` responses only.
3. **Backend intents and recovery**: add the terminal endpoints, audit fields, idempotency, and pending reconciliation.
4. **Native Android bridge**: implement card-reader, PIN-pad, scanner, printer, and network callbacks with the certified vendor SDK.
5. **Purchase and sale**: wire BEFA lookup, basket review, tender selection, device processing, receipt, and safe retry/status recovery.
6. **Pre-auth lifecycle**: authorize, capture, cancel/reverse, expiry display, and receipt rules.
7. **Operational hardening**: offline queue rules, device health, observability, role enforcement, remote configuration, and test harness.
8. **Certification and UAT**: device/vendor certification, failure injection, duplicate-charge tests, printer/scanner tests, power-loss recovery, and accessibility/touch tests.

## Acceptance criteria

- A terminal executes a purchase with one server-created idempotency key.
- It never exposes PAN/PIN or raw card cryptograms to the UI or regular backend logs.
- A timeout is recoverable by transaction-status lookup.
- Pre-auth, capture, reversal, refund, and receipt states remain traceable to cashier, register, and device.
- The terminal is useful offline only for explicitly supported flows; it never claims a payment succeeded without an authoritative device/acquirer result.