const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

// Development-only terminal façade. A certified Android/vendor SDK replaces
// this later and must return only tokenized or masked payment data.
export async function simulateBankPurchase({ onState, execute }) {
  onState({ code: 'READING_CARD', message: 'Present card or select bank payment.' })
  await wait(450)
  onState({ code: 'PROCESSING', message: 'Processing payment — do not remove card.' })
  return execute()
}
