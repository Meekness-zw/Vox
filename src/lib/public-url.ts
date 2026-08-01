import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateAddress(address: string) {
  if (
    address === "::1" || address === "::" || address.startsWith("fe80:") ||
    address.startsWith("fc") || address.startsWith("fd")
  ) return true;
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  const ipv4 = mapped ?? (isIP(address) === 4 ? address : "");
  if (!ipv4) return false;
  const [a, b] = ipv4.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || a >= 224;
}

/** Reject credentials, non-HTTP protocols, and hosts resolving to private IPs. */
export async function assertPublicUrl(raw: string, httpsOnly = false) {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error("Enter a valid public URL."); }
  const protocols = httpsOnly ? ["https:"] : ["http:", "https:"];
  if (!protocols.includes(parsed.protocol)) {
    throw new Error(httpsOnly ? "The URL must use HTTPS." : "Only HTTP and HTTPS URLs are supported.");
  }
  if (parsed.username || parsed.password) throw new Error("URLs cannot contain credentials.");
  const addresses = await lookup(parsed.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("That address is not publicly reachable.");
  }
  return parsed;
}
