export interface CreateInvoiceInput {
  paymentId: string;
  orderNumber: string;
  amountMnt: number;
  description: string;
  callbackUrl: string;
}

export interface CreatedInvoice {
  providerInvoiceId: string;
  /** Data the client needs to pay: QR text/image, bank deeplinks. Safe to show the payer. */
  payload: {
    qrText?: string;
    qrImage?: string; // base64 PNG
    shortUrl?: string;
    urls?: { name: string; description?: string; logo?: string; link: string }[];
  };
  expiresAt: Date;
}

export type InvoiceCheckStatus = "paid" | "pending" | "failed" | "expired";

export interface InvoiceCheck {
  status: InvoiceCheckStatus;
  providerPaymentId?: string;
  paidAmountMnt?: number;
  raw: unknown;
}

export interface PaymentProvider {
  readonly name: "mock" | "qpay";
  createInvoice(input: CreateInvoiceInput): Promise<CreatedInvoice>;
  /** Authoritative server-to-server status check. Webhooks are only a hint to call this. */
  checkInvoice(providerInvoiceId: string): Promise<InvoiceCheck>;
  cancelInvoice?(providerInvoiceId: string): Promise<void>;
}
