export function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function calculateLineItemTotal(item, pricesIncludeVat, applyCustomerFee, vatRates, serviceFeeRate) {
  const unitPrice = Number(item.unitPrice) || 0
  const quantity = Number(item.quantity) || 0
  const discount = Number(item.discountAmount) || 0
  const enteredSubtotal = roundMoney(unitPrice * quantity - discount)
  const configuredRate = vatRates.find((rate) => rate.categoryCode === item.vatCategory && rate.active)
  const vatRate = item.vatExempt ? 0 : Number(configuredRate?.rate)
  const vatAmount = !vatRate
    ? 0
    : roundMoney(pricesIncludeVat
      ? enteredSubtotal * vatRate / (1 + vatRate)
      : enteredSubtotal * vatRate)
  const gross = roundMoney(pricesIncludeVat ? enteredSubtotal - vatAmount : enteredSubtotal)
  const serviceFee = applyCustomerFee ? roundMoney(gross * serviceFeeRate) : 0
  const net = roundMoney(gross + vatAmount + serviceFee)
  return { gross, vatAmount, serviceFee, net }
}

export function calculateTotals(lineItems, pricesIncludeVat, applyCustomerFee, vatRates, serviceFeeRate) {
  return lineItems.reduce((totals, item) => {
    const line = calculateLineItemTotal(item, pricesIncludeVat, applyCustomerFee, vatRates, serviceFeeRate)
    return {
      totalGross: roundMoney(totals.totalGross + line.gross),
      totalVat: roundMoney(totals.totalVat + line.vatAmount),
      totalServiceFee: roundMoney(totals.totalServiceFee + line.serviceFee),
      totalNet: roundMoney(totals.totalNet + line.net),
    }
  }, { totalGross: 0, totalVat: 0, totalServiceFee: 0, totalNet: 0 })
}
