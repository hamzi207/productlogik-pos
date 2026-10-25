import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlarmClock,
  ArrowLeft,
  CalendarClock,
  Hourglass,
  Wallet,
  FilePlus2,
  FileText,
  Mail,
  MapPin,
  MessageCircle,
  Percent,
  Phone,
  Receipt,
  StickyNote,
  User,
} from "lucide-react";
import { getCustomer } from "@/lib/actions/customers";
import { getShopSession } from "@/lib/auth";
import { getCustomerTags } from "@/lib/customer-list-data";
import { documentHref, localDate, SECTION, sectionForStatus, statusDisplay, statusKey } from "@/lib/documents";
import { formatDate, formatMoney } from "@/lib/format";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { formatStrn, taxIdKind } from "@/lib/tax-id";
import { CustomerAvatar, CustomerTypeBadge } from "@/components/customers/customer-badges";
import { CustomerProfileActions } from "@/components/customers/customer-profile-actions";
import { TagChips } from "@/components/customers/customer-tags";

export const metadata: Metadata = { title: "Customer" };

type Params = Promise<{ id: string }>;

function Detail({
  icon,
  label,
  value,
  mono,
  href,
}: {
  icon: ReactNode;
  label: string;
  value: string | null;
  mono?: boolean;
  /** tel: / mailto: link, so tapping the value calls or starts an email. */
  href?: string | null;
}) {
  return (
    <div>
      {icon}
      <span>{label}</span>
      <strong className={mono ? "mono" : undefined}>
        {value && href ? <a href={href} className="detail-link">{value}</a> : value || "—"}
      </strong>
    </div>
  );
}

function StatCard({ icon, tone, label, value, note }: { icon: ReactNode; tone: string; label: string; value: string; note: string }) {
  return (
    <section className={`card stat-card ${tone}`}>
      <div className="stat-head">
        <span className={`metric-icon ${tone}`}>{icon}</span>
        <h3>{label}</h3>
      </div>
      <strong>{value}</strong>
      <span>{note}</span>
    </section>
  );
}

async function CustomerProfile({ params }: { params: Params }) {
  const { id } = await params;
  const [customer, { tenant }, tags] = await Promise.all([getCustomer(id), getShopSession(), getCustomerTags()]);
  if (!customer) notFound();

  const today = localDate(tenant.timezone);
  const greeting = `Hello ${customer.contact_person || customer.name}, this is ${tenant.name}.`;
  const iconProps = { size: 15, className: "icon" };
  const money = (n: number) => formatMoney(n, tenant.money);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  // All-time account summary (cancelled invoices don't count).
  const invoices = customer.quotes.filter((q) => q.status === "invoiced" || q.status === "paid");
  const unpaid = invoices.filter((q) => q.status === "invoiced");
  const overdue = unpaid.filter((q) => statusKey(q, today) === "due");
  const balance = (list: typeof invoices) => list.reduce((sum, q) => sum + q.total_amount - q.amount_paid, 0);
  const totalDue = balance(unpaid);
  const overdueAmount = balance(overdue);

  return (
    <>
      <div className="page-heading">
        <div className="profile-heading">
          <CustomerAvatar name={customer.name} large />
          <div>
            <span className="eyebrow">CUSTOMER PROFILE</span>
            <h1>{customer.name}</h1>
            <div className="profile-badges">
              <CustomerTypeBadge type={customer.customer_type} />
              <TagChips tagIds={customer.tagIds} tags={tags} />
              <span className="badge">Customer since {formatDate(customer.created_at, tenant.timezone)}</span>
            </div>
          </div>
        </div>
        <div className="heading-actions">
          {/* The shop's walk-in / cash record has no profile of its own to edit. */}
          {!customer.is_walk_in && (
            <CustomerProfileActions
              customer={customer}
              tagIds={customer.tagIds}
              allowInternationalPhones={tenant.allowInternationalPhones}
              hasQuotes={customer.quotes.length > 0}
            />
          )}
          <Link href={`/quotations/new?customer=${customer.id}`} className="button button-primary">
            <FilePlus2 size={14} /> New Quotation
          </Link>
          {customer.whatsapp_number && (
            <a
              className="button button-success"
              href={whatsappLink(customer.whatsapp_number, greeting)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={14} /> Message on WhatsApp
            </a>
          )}
        </div>
      </div>

      <div className="customer-profile-grid">
        <section className="card drawer-section profile-details">
          <div className="section-title"><h3>Account details</h3></div>
          <div className="details-list">
            <Detail icon={<User {...iconProps} />} label="Primary contact" value={customer.contact_person} />
            <Detail
              icon={<MessageCircle {...iconProps} />}
              label="WhatsApp"
              value={formatPhone(customer.whatsapp_number)}
              href={customer.whatsapp_number && `tel:${customer.whatsapp_number}`}
            />
            <Detail
              icon={<Phone {...iconProps} />}
              label="Other phone"
              value={formatPhone(customer.phone)}
              href={customer.phone && `tel:${customer.phone}`}
            />
            <Detail icon={<Mail {...iconProps} />} label="Email" value={customer.email} href={customer.email && `mailto:${customer.email}`} />
            <Detail icon={<MapPin {...iconProps} />} label="Billing address" value={customer.billing_address} />
            <Detail
              icon={<Receipt {...iconProps} />}
              label={customer.cnic_or_ntn ? taxIdKind(customer.cnic_or_ntn) : "CNIC / NTN"}
              value={customer.cnic_or_ntn}
              mono
            />
            <Detail
              icon={<Receipt {...iconProps} />}
              label="Sales tax"
              value={customer.tax_registration_status === "registered" ? `Registered · STRN ${formatStrn(customer.strn)}` : "Not registered"}
            />
            <Detail
              icon={<CalendarClock {...iconProps} />}
              label="Credit period"
              value={customer.credit_days > 0 ? `${customer.credit_days} days` : "None (due on the invoice date)"}
            />
            <Detail
              icon={<Percent {...iconProps} />}
              label="Default discount"
              value={Number(customer.default_discount_percentage) > 0 ? `${Number(customer.default_discount_percentage)}%` : "None"}
            />
          </div>
          {customer.notes && (
            <div className="profile-notes">
              <StickyNote size={14} />
              <p>{customer.notes}</p>
            </div>
          )}
        </section>

        <div className="profile-main">
        <div className="stat-grid" aria-label="Account summary, all time">
          <StatCard
            icon={<Receipt size={16} />}
            tone="blue"
            label="Total invoices"
            value={String(invoices.length)}
            note={`${money(invoices.reduce((sum, q) => sum + q.total_amount, 0))} invoiced`}
          />
          <StatCard
            icon={<Hourglass size={16} />}
            tone="amber"
            label="Pending invoices"
            value={String(unpaid.length)}
            note={unpaid.length ? "Not yet fully paid" : "All invoices paid"}
          />
          <StatCard
            icon={<Wallet size={16} />}
            tone="purple"
            label="Total due"
            value={money(totalDue)}
            note={unpaid.length ? `Across ${plural(unpaid.length, "invoice")}` : "Nothing owed"}
          />
          <StatCard
            icon={<AlarmClock size={16} />}
            tone={overdueAmount > 0 ? "red" : "green"}
            label="Overdue"
            value={money(overdueAmount)}
            note={overdue.length ? `${plural(overdue.length, "invoice")} past the due date` : "Nothing overdue"}
          />
        </div>

        <section className="card">
          <div className="card-header">
            <div>
              <h2>Purchase &amp; quote history</h2>
              <p>
                {customer.outstanding > 0
                  ? `${formatMoney(customer.outstanding, tenant.money)} outstanding`
                  : "No outstanding balance"}
              </p>
            </div>
          </div>
          {customer.quotes.length === 0 ? (
            <div className="empty-state">
              <span className="header-icon blue"><FileText size={18} /></span>
              <strong>No quotes or invoices yet</strong>
              Drafts, quotations and invoices for this customer will appear here.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>NUMBER</th>
                    <th>TYPE</th>
                    <th>DATE</th>
                    <th>STATUS</th>
                    <th>TOTAL</th>
                    <th>BALANCE</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.quotes.map((q) => {
                    const status = statusDisplay(statusKey(q, today));
                    const invoice = sectionForStatus(q.status) === "invoices" && q.status !== "void";
                    return (
                    <tr key={q.id}>
                      <td>
                        <Link href={documentHref(q)} className="mono strong">{q.quote_number}</Link>
                      </td>
                      <td>{SECTION[sectionForStatus(q.status)].singular}</td>
                      <td>{formatDate(q.created_at, tenant.timezone)}</td>
                      <td>
                        <span className={`badge ${status.tone}`}>{status.label}</span>
                        {q.walk_in_name && <span className="doc-sub">{q.walk_in_name}</span>}
                      </td>
                      <td className="amount">{formatMoney(q.total_amount, tenant.money)}</td>
                      <td className="amount">{invoice ? formatMoney(q.total_amount - q.amount_paid, tenant.money) : "—"}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        </div>
      </div>
    </>
  );
}

export default function CustomerPage({ params }: { params: Params }) {
  return (
    <div className="page">
      <Link href="/customers" className="back-link">
        <ArrowLeft size={14} /> All customers
      </Link>
      <Suspense fallback={<section className="card"><div className="empty-state">Loading customer…</div></section>}>
        <CustomerProfile params={params} />
      </Suspense>
    </div>
  );
}
