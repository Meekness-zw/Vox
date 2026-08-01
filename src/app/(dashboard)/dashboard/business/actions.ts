"use server";

import { revalidatePath } from "next/cache";
import { requireFinancialManager } from "@/lib/auth/session-cookies";
import {
  claimBusinessResearch,
  getBookkeepingSummary,
  recordCashbookTransaction,
  saveBusinessAnalysis,
  updateAccountingCurrency,
} from "@/lib/business-operations";
import { formatMinorMoney, majorToMinor } from "@/lib/currency";
import { getCompanyProfile, getWorkspaceName } from "@/lib/repository";
import { requestBusinessAnalysis } from "@/lib/python-bot";

export type BusinessActionState = { ok?: boolean; error?: string; message?: string; nextId?: string };

export async function recordTransactionAction(
  _previous: BusinessActionState,
  formData: FormData
): Promise<BusinessActionState> {
  try {
    const session = await requireFinancialManager();
    const direction = String(formData.get("direction") ?? "") as "income" | "expense";
    const amount = Number(formData.get("amount") ?? 0);
    const entryDate = String(formData.get("entryDate") ?? "");
    const description = String(formData.get("description") ?? "").trim();
    const currency = String(formData.get("currency") ?? "USD").trim().toUpperCase();
    const reference = String(formData.get("reference") ?? "").trim();
    const sourceId = String(formData.get("idempotencyKey") ?? "").trim();
    if (!['income', 'expense'].includes(direction)) return { error: "Choose income or expense." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return { error: "Choose a valid transaction date." };
    if (!description || description.length > 500) return { error: "Add a description of 500 characters or fewer." };
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) return { error: "Enter a valid positive amount." };
    if (!/^[A-Z]{3}$/.test(currency)) return { error: "Currency must be a three-letter code such as USD." };
    const amountCents = majorToMinor(amount, currency);
    const result = await recordCashbookTransaction({
      workspaceId: session.workspaceId,
      direction,
      entryDate,
      amountCents,
      currency,
      description,
      reference: reference.slice(0, 200) || undefined,
      sourceId,
      createdBy: session.email,
    });
    revalidatePath("/dashboard/business");
    return {
      ok: true,
      message: result.created ? "Balanced bookkeeping entry posted." : "This entry was already posted; no duplicate was created.",
      nextId: crypto.randomUUID(),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not post the entry." };
  }
}

export async function updateAccountingCurrencyAction(
  _previous: BusinessActionState,
  formData: FormData
): Promise<BusinessActionState> {
  try {
    const session = await requireFinancialManager();
    const currency = String(formData.get("currency") ?? "").trim().toUpperCase();
    await updateAccountingCurrency({
      workspaceId: session.workspaceId,
      currency,
      actorEmail: session.email,
    });
    revalidatePath("/dashboard/business");
    return { ok: true, message: `Base currency changed to ${currency}.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not change the base currency." };
  }
}

export async function generateBusinessAnalysisAction(
  _previous: BusinessActionState,
  formData: FormData
): Promise<BusinessActionState> {
  try {
    const session = await requireFinancialManager();
    const kind = String(formData.get("kind") ?? "") as "swot" | "sales_research";
    const query = String(formData.get("query") ?? "").trim();
    if (!['swot', 'sales_research'].includes(kind)) return { error: "Choose a valid analysis type." };
    if (query.length < 10 || query.length > 2_000) return { error: "Describe the goal in 10–2,000 characters." };
    const [profile, workspaceName, summary] = await Promise.all([
      getCompanyProfile(session.workspaceId),
      getWorkspaceName(session.workspaceId),
      getBookkeepingSummary(session.workspaceId),
    ]);
    const businessContext = profile
      ? [
          `Business: ${profile.businessName}`,
          `Industry: ${profile.industry}`,
          `Description: ${profile.description}`,
          `Services: ${profile.services}`,
          `Location/timezone: ${profile.timezone ?? "not specified"}`,
        ].join("\n")
      : `Business: ${workspaceName}\nNo detailed company profile has been supplied.`;
    const financialSummary = [
      `Currency: ${summary.currency}`,
      `Cash balance: ${formatMinorMoney(summary.cashCents, summary.currency)}`,
      `Revenue recorded: ${formatMinorMoney(summary.revenueCents, summary.currency)}`,
      `Expenses recorded: ${formatMinorMoney(summary.expenseCents, summary.currency)}`,
      `Net profit: ${formatMinorMoney(summary.profitCents, summary.currency)}`,
    ].join("\n");
    await claimBusinessResearch(session.workspaceId);
    const result = await requestBusinessAnalysis({ kind, businessContext, query, financialSummary });
    await saveBusinessAnalysis({
      workspaceId: session.workspaceId,
      kind,
      title: result.title,
      query,
      report: result.report,
      sources: result.sources,
      model: result.model,
      createdBy: session.email,
    });
    revalidatePath("/dashboard/business");
    return { ok: true, message: "Research completed and saved with its sources." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Business research failed." };
  }
}
