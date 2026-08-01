function normalizedCurrency(currency: string) {
  const normalized = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("Currency must be a three-letter code such as USD, ZAR, or ZWG.");
  }
  return normalized;
}

export function currencyFractionDigits(currency: string) {
  const normalized = normalizedCurrency(currency);
  try {
    const digits = new Intl.NumberFormat("en", {
      style: "currency",
      currency: normalized,
    }).resolvedOptions().maximumFractionDigits;
    if (typeof digits !== "number" || !Number.isInteger(digits) || digits < 0 || digits > 4) {
      throw new Error("Unsupported currency precision.");
    }
    return digits;
  } catch {
    throw new Error(`Currency ${normalized} is not supported by this server.`);
  }
}

export function majorToMinor(amount: number, currency: string) {
  const multiplier = 10 ** currencyFractionDigits(currency);
  const scaled = amount * multiplier;
  const rounded = Math.round(scaled);
  if (!Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > 1e-6) {
    throw new Error(`The amount has too many decimal places for ${normalizedCurrency(currency)}.`);
  }
  return rounded;
}

export function formatMinorMoney(cents: number, currency: string, locale = "en") {
  const normalized = normalizedCurrency(currency);
  const divisor = 10 ** currencyFractionDigits(normalized);
  return new Intl.NumberFormat(locale, { style: "currency", currency: normalized }).format(cents / divisor);
}
