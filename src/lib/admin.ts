export function isVoxAdmin(email: string): boolean {
  const fallback = process.env.NODE_ENV === "production" ? "" : "demo@vox.ai";
  const configured = (process.env.VOX_ADMIN_EMAILS ?? fallback)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return configured.includes(email.toLowerCase());
}
