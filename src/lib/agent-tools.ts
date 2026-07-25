import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { bookAppointment, getAvailability } from "@/lib/calendar";
import { createInvoice } from "@/lib/invoices";
import { getWorkspaceName } from "@/lib/repository";

/**
 * Everything the agent needs to act on behalf of one workspace/conversation.
 * IMPORTANT: workspaceId/agentId are only ever taken from here (closure), never
 * from a model-supplied tool argument — a caller/visitor's words must never be
 * able to redirect a booking or invoice to a different tenant.
 */
export type ToolContext = {
  workspaceId: string;
  agentId: string;
  conversationId?: string;
  contactPhone?: string;
  contactEmail?: string;
};

function formatSlotLabel(iso: string, timezone: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });
}

export function buildTools(ctx: ToolContext): ToolSet {
  return {
    check_availability: tool({
      description:
        "Check open appointment slots for a given calendar date. Always call this before booking so you can offer the caller real options. Resolve relative dates (e.g. 'tomorrow') to an actual YYYY-MM-DD yourself before calling.",
      inputSchema: z.object({
        date: z.string().describe("Date to check, as YYYY-MM-DD"),
        serviceMinutes: z
          .number()
          .default(30)
          .describe("Expected length of the appointment in minutes"),
      }),
      execute: async ({ date, serviceMinutes }) => {
        try {
          const { slots, timezone } = await getAvailability(
            ctx.workspaceId,
            date,
            serviceMinutes
          );
          return {
            timezone,
            slots: slots
              .slice(0, 8)
              .map((iso) => ({ startsAt: iso, label: formatSlotLabel(iso, timezone) })),
          };
        } catch {
          return { error: "Couldn't check the calendar right now." };
        }
      },
    }),

    book_appointment: tool({
      description:
        "Book a confirmed appointment at a specific start time (use a slot returned by check_availability). Captures the caller's contact details for confirmation.",
      inputSchema: z.object({
        contactName: z.string().describe("The caller's/client's full name"),
        contactPhone: z.string().optional(),
        contactEmail: z.string().optional(),
        service: z.string().describe("What the appointment is for"),
        startsAt: z.string().describe("ISO 8601 start time, from check_availability"),
        durationMinutes: z.number().default(30),
      }),
      execute: async (input) => {
        try {
          const appointment = await bookAppointment({
            workspaceId: ctx.workspaceId,
            agentId: ctx.agentId,
            conversationId: ctx.conversationId,
            contactName: input.contactName,
            contactPhone: input.contactPhone ?? ctx.contactPhone,
            contactEmail: input.contactEmail ?? ctx.contactEmail,
            service: input.service,
            startsAt: input.startsAt,
            durationMinutes: input.durationMinutes,
          });
          return {
            appointmentId: appointment.id,
            confirmed: true,
            startsAt: appointment.startsAt,
            addedToCalendar: Boolean(appointment.googleEventId),
          };
        } catch {
          return { error: "Couldn't complete that booking just now — please offer to have someone follow up." };
        }
      },
    }),

    create_invoice: tool({
      description:
        "Create and email an invoice once a service/price has been agreed with the client. Only call this when you have a real email address for them.",
      inputSchema: z.object({
        contactName: z.string(),
        contactEmail: z.string().optional().describe("Falls back to the contact on file if omitted"),
        lineItems: z
          .array(
            z.object({
              description: z.string(),
              quantity: z.number().default(1),
              unitPriceCents: z.number().describe("Price per unit, in cents"),
            })
          )
          .min(1),
        notes: z.string().optional(),
      }),
      execute: async (input) => {
        const contactEmail = input.contactEmail ?? ctx.contactEmail;
        if (!contactEmail) {
          return { error: "I don't have an email address on file yet — please ask the client for one." };
        }
        try {
          const businessName = await getWorkspaceName(ctx.workspaceId);
          const { invoice, emailed } = await createInvoice({
            workspaceId: ctx.workspaceId,
            agentId: ctx.agentId,
            conversationId: ctx.conversationId,
            contactName: input.contactName,
            contactEmail,
            lineItems: input.lineItems,
            notes: input.notes,
            businessName,
          });
          return {
            invoiceId: invoice.id,
            totalCents: invoice.totalCents,
            emailed,
          };
        } catch {
          return { error: "Couldn't create that invoice right now." };
        }
      },
    }),
  };
}
