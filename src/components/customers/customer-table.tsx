"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, MessageCircle, Plus, Users } from "lucide-react";
import { formatMoney, type MoneyFormat } from "@/lib/format";
import { formatPhone, whatsappLink } from "@/lib/phone";
import type { Paged } from "@/lib/pagination";
import type { CustomerListItem } from "@/lib/types/customer";
import type { CustomerTag } from "@/lib/customer-lists";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { CustomerAvatar, CustomerTypeBadge } from "./customer-badges";
import { CustomerDialog } from "./customer-dialog";
import { TagChips } from "./customer-tags";

type Props = {
  /** One page of the directory + the total matching the filters. */
  result: Paged<CustomerListItem>;
  money: MoneyFormat;
  allowInternationalPhones: boolean;
  /** The organization's customer tags (RF-19.2), for the chips. */
  tags: CustomerTag[];
  /** True when a search, type or tag filter is active (changes the empty state). */
  filtered: boolean;
};

export function CustomerTable({ result, money, allowInternationalPhones, tags, filtered }: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const customers = result.rows;

  if (result.total === 0) {
    return (
      <div className="empty-state">
        <span className="header-icon blue"><Users size={18} /></span>
        {filtered ? (
          <>
            <strong>No customers match these filters</strong>
            Try a different search, customer type or tag.
          </>
        ) : (
          <>
            <strong>No customers yet</strong>
            Register your first customer.
            <div className="empty-state-action">
              <button type="button" className="button button-primary" onClick={() => setAdding(true)}>
                <Plus size={14} /> Register Customer
              </button>
            </div>
            <CustomerDialog
              open={adding}
              onOpenChange={setAdding}
              allowInternationalPhones={allowInternationalPhones}
              onSaved={(id) => router.push(`/customers/${id}`)}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="table-wrap desktop-table">
        <table className="customer-table">
          <thead>
            <tr>
              <th>CUSTOMER / COMPANY</th>
              <th>PRIMARY CONTACT</th>
              <th>WHATSAPP</th>
              <th>ACTIVITY</th>
              <th>OUTSTANDING</th>
              <th><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => {
              const href = `/customers/${c.id}`;
              return (
                <tr key={c.id} onClick={() => router.push(href)}>
                  <td>
                    <div className="customer-name">
                      <CustomerAvatar name={c.name} />
                      <div>
                        <Link href={href} className="row-link" onClick={(e) => e.stopPropagation()}>
                          <strong>{c.name}</strong>
                        </Link>
                        <span className="customer-badges">
                          <CustomerTypeBadge type={c.customer_type} />
                          <TagChips tagIds={c.tagIds} tags={tags} />
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="contact-cell">
                      <strong>{c.contact_person || "—"}</strong>
                      {c.email && <span>{c.email}</span>}
                    </div>
                  </td>
                  <td>
                    {c.whatsapp_number && (
                      <a
                        className="whatsapp-link"
                        href={whatsappLink(c.whatsapp_number)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`WhatsApp ${c.name} on ${formatPhone(c.whatsapp_number)}`}
                      >
                        <MessageCircle size={15} />
                        {formatPhone(c.whatsapp_number)}
                      </a>
                    )}
                  </td>
                  <td>
                    <strong>{c.quoteCount}</strong> {c.quoteCount === 1 ? "quote / invoice" : "quotes / invoices"}
                  </td>
                  <td className={c.outstanding > 0 ? "balance" : "settled"}>
                    {c.outstanding > 0 ? formatMoney(c.outstanding, money) : <span className="badge badge-green">Settled</span>}
                  </td>
                  <td><ChevronRight size={16} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Phones: one card per customer instead of the wide table (CSS swaps them at 768px). */}
      <ul className="mobile-cards" aria-label="Customers">
        {customers.map((c) => (
          <li key={c.id} className="mobile-card">
            <Link href={`/customers/${c.id}`} className="mobile-card-main">
              <span className="mobile-card-top">
                <span className="mobile-card-title">{c.name}</span>
                <CustomerTypeBadge type={c.customer_type} />
              </span>
              <TagChips tagIds={c.tagIds} tags={tags} />
              <span className="mobile-card-meta">
                <span className="mobile-card-muted">
                  {c.quoteCount} {c.quoteCount === 1 ? "document" : "documents"}
                </span>
                {c.outstanding > 0 ? (
                  <span className="mobile-card-balance">Owes {formatMoney(c.outstanding, money)}</span>
                ) : (
                  <span className="badge badge-green">Settled</span>
                )}
              </span>
            </Link>
            {c.whatsapp_number && (
              <span className="mobile-card-actions">
                <a
                  className="icon-button whatsapp-button"
                  href={whatsappLink(c.whatsapp_number)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`WhatsApp ${c.name} on ${formatPhone(c.whatsapp_number)}`}
                >
                  <MessageCircle size={18} />
                </a>
              </span>
            )}
          </li>
        ))}
      </ul>
      <PaginationBar total={result.total} page={result.page} limit={result.limit} noun={["customer", "customers"]} />
    </>
  );
}

export function AddCustomerButton({ allowInternationalPhones }: { allowInternationalPhones: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="button button-primary" onClick={() => setOpen(true)}>
        <Plus size={14} /> Register Customer
      </button>
      <CustomerDialog
        open={open}
        onOpenChange={setOpen}
        allowInternationalPhones={allowInternationalPhones}
        onSaved={(id) => router.push(`/customers/${id}`)}
      />
    </>
  );
}
