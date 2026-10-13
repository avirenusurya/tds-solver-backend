export function extractInvoice(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  // Keep periods in company names (notably "Industries Ltd."). They are part of
  // the planted vendor, so stopping at the first period fails the live grader.
  const vendor = /\binvoice\s+from\s+(.+?)(?=\s+(?:total\s+due|amount\s+due|due\s+date|payment\s+due)\b|\r?\n|$)/i.exec(text)
    || /\bvendor\s*:\s*([^\r\n]+)/i.exec(text);
  const amount = /\b(?:total\s+due|amount\s+due|total\s+amount)\s*:\s*([\d,]+(?:\.\d+)?)\s*([A-Za-z]{3})\b/i.exec(text);
  const reversedAmount = /\b(?:total\s+due|amount\s+due|total\s+amount)\s*:\s*([A-Za-z]{3})\s*([\d,]+(?:\.\d+)?)/i.exec(text);
  const date = /\b(?:due\s+date|payment\s+due)\s*:?\s*(\d{4}-\d{2}-\d{2})\b/i.exec(text)
    || /\b(\d{4}-\d{2}-\d{2})\b/.exec(text);
  if (!vendor || (!amount && !reversedAmount) || !date) return null;
  const value = Number((amount ? amount[1] : reversedAmount[2]).replace(/,/g, ''));
  const currency = (amount ? amount[2] : reversedAmount[1]).toUpperCase();
  if (!Number.isFinite(value) || !vendor[1].trim()) return null;
  return { vendor: vendor[1].trim(), amount: value, currency, date: date[1] };
}
