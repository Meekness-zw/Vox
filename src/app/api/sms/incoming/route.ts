import { handleTwilioInboundMessage } from "@/lib/twilio-inbound";

export const maxDuration = 30;

/** Twilio SMS "A message comes in" webhook. */
export async function POST(req: Request) {
  return handleTwilioInboundMessage(req, "sms");
}
