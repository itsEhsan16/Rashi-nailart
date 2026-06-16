import "server-only";

export type NotifyArgs = { phone: string; message: string };

/**
 * TODO(notify): wire a real SMS/WhatsApp provider (e.g. Twilio, MSG91, Gupshup).
 * For now this is a no-op stub that logs intent, called after a payment is
 * verified or rejected so the customer can be informed of the outcome.
 */
export async function notifyCustomer({ phone, message }: NotifyArgs): Promise<void> {
  if (!phone) return;
  // eslint-disable-next-line no-console
  console.info(`[notifyCustomer] → ${phone}: ${message}`);
}
