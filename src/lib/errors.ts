/** Maps database / function error codes to plain-language messages. Unknown errors never leak internals. */
const MESSAGES: Record<string, string> = {
  not_authenticated: 'Your session has expired. Log in again.',
  permission_denied: "You don't have permission to do that.",
  no_customer_account: "You don't have a customer account with this kitchen yet.",
  customer_blocked: 'Your account cannot place orders. Contact the kitchen.',
  kitchen_unavailable: 'This kitchen is not taking orders right now.',
  product_unavailable: 'An item in your cart is no longer available. Remove it and try again.',
  invalid_options: 'Choose the required options for each item.',
  invalid_option: 'One of the selected options is no longer available.',
  invalid_quantity: 'Check the quantity of each item.',
  below_minimum_order: 'Your order is below this kitchen’s minimum.',
  delivery_unavailable: 'This kitchen does not deliver.',
  pickup_unavailable: 'This kitchen does not offer pickup.',
  address_required: 'Choose or add a delivery address.',
  empty_order: 'Your cart is empty.',
  invalid_transition: 'That change is not allowed for this order’s current status.',
  staff_limit_reached: 'Your plan’s staff limit is reached. Upgrade the plan to add more people.',
  last_admin: 'A kitchen needs at least one active admin.',
  invalid_slug: 'Use 3–40 letters, numbers or hyphens.',
  reserved_slug: 'That address is reserved. Choose another.',
  insufficient_balance: 'That is more than the available balance.',
  order_not_refundable: 'This order cannot be refunded.',
  invalid_invitation: 'This invitation is invalid or has expired.',
  invitation_email_mismatch: 'Log in with the email address the invitation was sent to.',
  payout_not_pending: 'That payout is no longer pending.',
  rate_limited: 'Too many attempts. Wait a few minutes and try again.',
  no_payout_account: 'This kitchen has no approved payout number yet.',
  refund_in_progress: 'A refund for this payment is already in progress or finished.',
  receipt_missing: 'This payment has no M-Pesa receipt yet. Enter the receipt first, or refund manually.',
  invalid_phone: 'Enter a valid Safaricom number, for example 0712 345 678.',
  amount_not_whole_shillings: 'Amounts must be whole shillings.',
  invalid_receipt: 'Enter the M-Pesa receipt code (at least 8 characters).',
  nothing_to_review: 'That request was already reviewed.',
  invalid_adjustment: 'Enter a non-zero amount and a reason.',
  setup_completed: 'Platform setup is already completed — the platform already has an owner.',
};

export function friendlyError(raw: string | null | undefined, fallback = 'Something went wrong. Try again.'): string {
  if (!raw) return fallback;
  const code = raw.split(':')[0]!.trim();
  if (MESSAGES[code]) return MESSAGES[code]!;
  if (/duplicate key|unique/i.test(raw)) return 'That already exists. Choose a different name or address.';
  if (/row-level security|permission denied/i.test(raw)) return MESSAGES.permission_denied!;
  if (/violates check constraint .*whole_currency/i.test(raw)) return 'Enter whole shillings only (no cents).';
  return fallback;
}
