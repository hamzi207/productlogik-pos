import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { TENANT_STATUS_LABEL, type TenantStatus } from "@/lib/validations/admin.schema";

// Shared by the /admin pages: platform times are shown in Pakistan time, money in whole units.

export const adminDate = (value: string | null) => (value ? formatDate(value, DEFAULT_TIMEZONE) : "Never");

export const adminDateTime = (value: string) => formatDateTime(value, DEFAULT_TIMEZONE);

export const adminMoney = (amount: number, currency: string) => formatMoney(amount, { currency, showPaisa: false });

const STATUS_TONE: Record<TenantStatus, string> = { active: "badge-green", trial: "badge-blue", suspended: "badge-red" };

export function statusBadge(status: string) {
  const s = (status in STATUS_TONE ? status : "active") as TenantStatus;
  return { label: TENANT_STATUS_LABEL[s], tone: `badge ${STATUS_TONE[s]}` };
}

/** One audit row in words, for the activity lists. */
export function describeAction(action: string, details: Record<string, unknown>) {
  const d = (k: string) => (typeof details[k] === "string" || typeof details[k] === "number" ? String(details[k]) : "");
  switch (action) {
    case "impersonation.start":
      return "Started acting as the shop (Login As)";
    case "impersonation.end":
      return `Left the shop after ${d("minutes") || "0"} min`;
    case "impersonation.request":
      return `Changed something while acting as the shop (${d("method")} ${d("path")})`;
    case "tenant.create":
      return `Created the shop, owner ${d("owner")}`;
    case "tenant.update":
      return `Edited company details (${Object.keys((details.after as object) ?? {}).join(", ") || "no changes"})`;
    case "tenant.status":
      return `Status ${d("before")} → ${d("after")}`;
    case "tenant.logo":
      return "Uploaded a new logo";
    case "tenant.logo_removed":
      return "Removed the logo";
    case "user.password_reset_email":
      return `Sent a password reset email to ${d("email")}`;
    case "user.temporary_password":
      return `Set a temporary password for ${d("email")}`;
    case "user.role":
      return `${d("email")}: role ${d("before")} → ${d("after")}`;
    // Phase 17
    case "tenant.settings":
    case "tenant.documents":
      return `Changed ${action === "tenant.documents" ? "document" : "shop"} settings (${Object.keys((details.after as object) ?? {}).join(", ") || "no changes"})`;
    case "tenant.archive":
      return "Archived the organization";
    case "tenant.restore":
      return "Restored the organization from the archive";
    case "tenant.owner":
      return `Made ${d("email")} the owner`;
    case "tenant.export":
      return "Downloaded a full export";
    case "tenant.note_delete":
      return "Deleted a note";
    case "user.invite":
      return `Invited ${d("email")} as ${d("role")}`;
    case "user.invite_resent":
      return `Resent the invitation to ${d("email")}`;
    case "user.invite_cancelled":
      return `Cancelled the invitation to ${d("email")}`;
    case "user.deactivate":
      return `Deactivated ${d("email")}`;
    case "user.reactivate":
      return `Reactivated ${d("email")}`;
    case "user.delete":
      return "Deleted the account of " + d("email");
    case "user.force_sign_out":
      return `Signed ${d("email")} out everywhere`;
    case "superadmin.grant":
      return `Made ${d("email")} a superadmin`;
    case "superadmin.mfa_reset":
      return `Reset two-factor sign-in for ${d("email")}`;
    case "superadmin.revoke":
      return `Removed superadmin from ${d("email")}`;
    case "category.create":
      return `Added the category “${d("name")}”`;
    case "category.rename":
      return `Renamed a category to “${String((details.after as Record<string, unknown> | undefined)?.name ?? d("name"))}”`;
    case "category.delete":
      return `Deleted the category “${d("name")}”`;
    // Phase 18
    case "category.update":
      return `Changed a category (${Object.keys((details.after as object) ?? {}).join(", ") || "no changes"})`;
    case "category.move":
      return `Moved the category “${d("name")}”`;
    case "category.archive":
      return `Archived “${d("name")}” (${d("categories")} categories)`;
    case "category.restore":
      return `Restored “${d("name")}” (${d("categories")} categories)`;
    case "category.hide":
      return `Hid “${d("name")}” from the organization`;
    case "category.show":
      return `Showed “${d("name")}” to the organization again`;
    case "category.image":
      return `Uploaded an image for “${d("name")}”`;
    case "category.image_remove":
      return `Removed the image of “${d("name")}”`;
    case "category.duplicate":
      return `Copied ${d("categories")} categories from another industry`;
    case "category.import":
      return `Imported ${d("categories")} categories from CSV`;
    case "category_request.approved_tenant":
      return `Approved the request “${d("name")}” as the organization's own category`;
    case "category_request.approved_industry":
      return `Approved the request “${d("name")}” into the industry catalog`;
    case "category_request.rejected":
      return `Declined the request “${d("name")}”`;
    case "attribute.create":
      return `Added the attribute “${d("label")}”`;
    case "attribute.update":
      return `Changed the attribute ${d("key")}`;
    case "attribute.archive":
      return `Archived the attribute ${d("key")}`;
    case "attribute.delete":
      return `Deleted the attribute “${d("label")}”`;
    case "attribute.restore":
      return `Restored the attribute ${d("key")}`;
    case "industry.create":
      return `Added the industry “${d("name")}”`;
    case "industry.update":
      return `Changed the industry “${d("name")}”`;
    case "industry.delete":
      return `Deleted the industry “${d("name")}”`;
    case "subscription.start_date":
      return `Moved the subscription start to ${String((details.after as Record<string, unknown> | undefined)?.started_at ?? "")}`;
    case "product.create":
      return `Added the product ${d("sku")} “${d("name")}”`;
    case "product.update":
      return `Changed the product ${d("sku")} (${Object.keys((details.after as object) ?? {}).join(", ") || "no changes"})`;
    case "product.delete":
      return `Deleted the product ${d("sku")} “${d("name")}”`;
    case "tenant.modules":
      return `Modules: ${((details.after as { modules?: string[] } | undefined)?.modules ?? []).join(", ") || "none"}`;
    case "tenant.industry":
      return `Industry ${String((details.before as Record<string, unknown> | undefined)?.industry ?? "")} → ${String((details.after as Record<string, unknown> | undefined)?.industry ?? "")} (${d("items_moved")} items moved)`;
    case "tag.create":
      return `Created the tag “${d("name")}”`;
    case "tag.delete":
      return `Deleted the tag “${d("name")}”`;
    case "vehicle.create":
      return "Added " + d("vehicle") + " to the vehicle catalog";
    case "vehicle.update":
      return "Changed " + d("before") + " to " + d("after");
    case "vehicle.merge":
      return "Merged duplicate vehicles into " + d("kept");
    case "vehicle.deactivate":
      return "Deactivated " + d("count") + " catalog vehicles";
    case "vehicle.reactivate":
      return "Reactivated " + d("count") + " catalog vehicles";
    case "platform.settings":
      return `Changed platform settings (${Object.keys((details.after as object) ?? {}).join(", ") || "no changes"})`;
    case "announcement.create":
      return "Posted an announcement";
    case "announcement.end":
      return "Ended an announcement";
    default:
      if (action.startsWith("subscription.") || action.startsWith("plan.")) return `${action.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase())}`;
      return action;
  }
}
