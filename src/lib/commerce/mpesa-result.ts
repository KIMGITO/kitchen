/** Plain-language explanation of a Daraja STK result, shown to the customer the moment the callback arrives. */
export function describePaymentFailure(code: number | null | undefined, desc?: string | null): string {
  switch (code) {
    case 1: return 'Your M-Pesa balance is too low for this payment. Top up and try again.';
    case 1032: return 'You cancelled the payment on your phone. Nothing was charged.';
    case 1037: return 'The prompt timed out before you entered your PIN. Check that your phone is on, then try again.';
    case 2001: return 'The M-Pesa PIN was incorrect. Nothing was charged. Try again.';
    case 1019: return 'The payment request expired. Send a new prompt.';
    case 17: case 26: case 1001: case 1025: case 9999:
      return 'M-Pesa is busy right now. Wait a minute and try again.';
    default: return desc && !/^amount_mismatch$/.test(desc) ? `M-Pesa said: ${desc}` : 'The payment did not go through. Nothing was charged. You can try again.';
  }
}
