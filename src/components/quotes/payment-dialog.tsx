"use client";

import { useState } from "react";
import { Dialog } from "radix-ui";
import { Banknote, Coins, Loader2, X } from "lucide-react";
import { ModalSheet } from "@/components/shared/modal-sheet";
import { recordPayment } from "@/lib/actions/quotes";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/documents";
import { formatMoney, type MoneyFormat } from "@/lib/format";
import { notify } from "@/lib/notify";
import { allocationSummary, type LineBalance } from "@/lib/payments";
import { paymentSchema } from "@/lib/validations/quote.schema";
import { formatNumber } from "@/lib/uom";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  number: string;
  /** What is still owed; the default amount. */
  balance: number;
  /** The invoice's lines and what each still owes, for paying for specific items. */
  lines: LineBalance[];
  money: MoneyFormat;
  /** Shop-local date (YYYY-MM-DD) for the default "paid on". */
  today: string;
};

/**
 * Manual payment logging: cash, card terminal, bank transfer or cheque. Three ways, all in one form:
 *   - just an amount (on the invoice as a whole);
 *   - tick items (and how many units): the amount fills in from what they still owe;
 *   - type an amount, then tick items: it is spread over them in order. Each item's share stays editable,
 *     and whatever isn't applied to items counts as a general payment.
 */
export function PaymentDialog({ open, onOpenChange, ...props }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <ModalSheet className={props.lines.length > 0 ? "modal modal-payment" : "modal modal-sm"}>
        {open && <PaymentForm {...props} onDone={() => onOpenChange(false)} />}
      </ModalSheet>
    </Dialog.Root>
  );
}

type Row = { on: boolean; apply: number; qty: number | null };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Quick cash buttons: notes the customer hands over, added up. */
const CASH_NOTES = [500, 1000, 5000];

/** Units that `amount` pays for in full, when it's a whole number of units. */
function wholeUnits(line: LineBalance, amount: number) {
  if (line.unitShare <= 0) return null;
  const units = amount / line.unitShare;
  const whole = Math.round(units);
  return whole >= 1 && whole <= line.quantity && Math.abs(units - whole) < 0.01 ? whole : null;
}

function PaymentForm({ invoiceId, number, balance, lines, money, today, onDone }: Omit<Props, "open" | "onOpenChange"> & { onDone: () => void }) {
  const fmt = (n: number) => formatMoney(n, money);
  const fmtNote = (n: number) => formatMoney(n, { ...money, showPaisa: false });
  const [amount, setAmount] = useState(balance);
  // Once the amount is typed, ticking items spreads it over them; until then, ticking items sets the amount.
  const [amountTyped, setAmountTyped] = useState(false);
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, { on: false, apply: 0, qty: null }])),
  );
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [paidOn, setPaidOn] = useState(today);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cash handed over (quick cash). Up to `cashDue` of it is the payment; anything above is change.
  const [received, setReceived] = useState<number | null>(null);
  const [cashDue, setCashDue] = useState<number | null>(null);

  const payable = lines.filter((l) => l.remaining > 0);
  const selected = lines.filter((l) => rows[l.id].on);
  const applied = round2(selected.reduce((sum, l) => sum + (rows[l.id].apply || 0), 0));
  const general = round2((Number.isFinite(amount) ? amount : 0) - applied);

  /** Fill the ticked items in order from `total`. */
  const spread = (next: Record<string, Row>, total: number) => {
    let left = Number.isFinite(total) ? total : 0;
    for (const l of lines) {
      if (!next[l.id].on) continue;
      const apply = round2(Math.max(Math.min(l.remaining, left), 0));
      left -= apply;
      next[l.id] = { ...next[l.id], apply, qty: wholeUnits(l, apply) };
    }
    return next;
  };
  const sumOf = (next: Record<string, Row>) => round2(lines.reduce((sum, l) => sum + (next[l.id].on ? next[l.id].apply || 0 : 0), 0));

  /** After a change to the items: either spread the typed amount, or make the amount their total. */
  const commit = (next: Record<string, Row>, respread: boolean) => {
    clearCash();
    if (amountTyped && respread) {
      setRows(spread(next, amount));
      return;
    }
    setRows(next);
    const total = sumOf(next);
    if (!amountTyped) setAmount(total > 0 ? total : balance);
    else if (total > amount) setAmount(total);
  };

  const toggle = (l: LineBalance) => {
    const on = !rows[l.id].on;
    const next = { ...rows, [l.id]: on ? { on, apply: l.remaining, qty: wholeUnits(l, l.remaining) } : { on, apply: 0, qty: null } };
    commit(next, true);
  };
  const setQty = (l: LineBalance, qty: number) => {
    const units = Number.isFinite(qty) ? Math.min(Math.max(qty, 0), l.quantity) : 0;
    const apply = round2(Math.min(units * l.unitShare, l.remaining));
    commit({ ...rows, [l.id]: { on: true, apply, qty: units || null } }, false);
  };
  const setApply = (l: LineBalance, value: number) => {
    const apply = Number.isFinite(value) ? value : 0;
    commit({ ...rows, [l.id]: { on: true, apply, qty: wholeUnits(l, apply) } }, false);
  };
  const applyAmount = (value: number) => {
    setAmount(value);
    setAmountTyped(true);
    if (selected.length > 0) setRows(spread({ ...rows }, value));
  };
  const changeAmount = (value: number) => {
    clearCash();
    applyAmount(value);
  };

  /** Cash received: the payment is what's due (or all of it, when it's less); the rest is change. */
  const takeCash = (value: number) => {
    const due = cashDue ?? (Number.isFinite(amount) && amount > 0 ? amount : balance);
    const cash = Number.isFinite(value) && value > 0 ? round2(value) : 0;
    applyAmount(cash ? Math.min(cash, due) : due);
    if (!cash) return clearCash();
    setCashDue(due);
    setReceived(cash);
  };
  const clearCash = () => {
    setReceived(null);
    setCashDue(null);
  };
  const change = received !== null && Number.isFinite(amount) ? round2(received - amount) : 0;
  const selectAll = (on: boolean) => {
    const next = Object.fromEntries(
      lines.map((l) => [l.id, on && l.remaining > 0 ? { on: true, apply: l.remaining, qty: wholeUnits(l, l.remaining) } : { on: false, apply: 0, qty: null }]),
    );
    commit(next, true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Ticked items the amount didn't reach (0) are simply left out.
    const paying = selected.filter((l) => rows[l.id].apply > 0);
    for (const l of selected) {
      const apply = rows[l.id].apply;
      if (!Number.isFinite(apply) || apply < 0) return setError(`Enter an amount for "${l.description}", or untick it.`);
      if (apply > l.remaining + 0.005) return setError(`"${l.description}" has only ${fmt(l.remaining)} left to pay.`);
    }
    const items = paying.map((l) => ({ quoteItemId: l.id, amount: round2(rows[l.id].apply), quantity: rows[l.id].qty }));
    const parsed = paymentSchema.safeParse({ amount, method, paidOn, notes, items });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the payment.");
      return;
    }
    if (parsed.data.amount > balance + 0.005) {
      setError(`That's more than the balance of ${fmt(balance)}.`);
      return;
    }
    setPending(true);
    const result = await recordPayment(invoiceId, parsed.data);
    setPending(false);
    if (result.status === "error") {
      setError(result.message);
      notify.error("Payment not recorded", result.message);
      return;
    }
    const paidBy = parsed.data.method === "Check" ? "Cheque" : parsed.data.method;
    const left = round2(balance - parsed.data.amount);
    const giveChange = received !== null && received - parsed.data.amount > 0.005 ? ` Give ${fmt(round2(received - parsed.data.amount))} change.` : "";
    const forItems = paying.length
      ? ` For ${allocationSummary(paying.map((l) => ({ description: l.description, quantity: rows[l.id].qty })))}.`
      : "";
    notify.success(
      parsed.data.amount >= balance ? `${number} paid in full` : `${fmt(parsed.data.amount)} recorded on ${number}`,
      left <= 0
        ? `${fmt(parsed.data.amount)} by ${paidBy}.${forItems} The invoice is now Paid.${giveChange}`
        : `${paidBy}.${forItems} Balance due: ${fmt(left)} (Partially Paid).${giveChange}`,
    );
    onDone();
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="modal-header">
        <div>
          <span className="header-icon blue"><Banknote size={18} /></span>
          <div>
            <Dialog.Title asChild><h2>Record payment · {number}</h2></Dialog.Title>
            <Dialog.Description asChild>
              <p>Balance due: {fmt(balance)}. Enter any amount, pay for specific items, or both.</p>
            </Dialog.Description>
          </div>
        </div>
        <Dialog.Close asChild>
          <button type="button" className="icon-button" aria-label="Close"><X size={16} /></button>
        </Dialog.Close>
      </div>
      <div className="modal-body">
        {error && <div className="form-alert form-alert-error modal-alert" role="alert">{error}</div>}
        <div className="form-grid">
          <label>
            <span>AMOUNT ({money.currency})</span>
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={Number.isFinite(amount) ? amount : ""}
              onChange={(e) => changeAmount(e.target.valueAsNumber)}
              autoFocus
            />
          </label>
          <label>
            <span>METHOD</span>
            <select
              value={method}
              onChange={(e) => {
                setMethod(e.target.value as PaymentMethod);
                clearCash();
              }}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m === "Check" ? "Cheque" : m}</option>
              ))}
            </select>
          </label>
          <label>
            <span>PAID ON</span>
            <input type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} />
          </label>
          <label>
            <span>REFERENCE / NOTES (OPTIONAL)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Cheque #4521, HBL transfer" maxLength={300} />
          </label>
        </div>

        {method === "Cash" && (
          <div className="quick-cash">
            <span className="quick-cash-label"><Coins size={13} /> CASH RECEIVED</span>
            <div className="quick-cash-row">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={received ?? ""}
                placeholder="Amount handed over"
                onChange={(e) => (e.target.value === "" ? takeCash(0) : takeCash(e.target.valueAsNumber))}
                aria-label="Cash received"
              />
              {CASH_NOTES.map((n) => (
                <button key={n} type="button" className="quick-cash-chip" onClick={() => takeCash((received ?? 0) + n)}>
                  +{fmtNote(n)}
                </button>
              ))}
              <button
                type="button"
                className="quick-cash-chip"
                onClick={() => takeCash(cashDue ?? (Number.isFinite(amount) && amount > 0 ? amount : balance))}
              >
                Exact Amount
              </button>
            </div>
            {received !== null && (
              <p className={`quick-cash-result${change > 0.005 ? " change" : ""}`} role="status">
                Received: <strong>{fmt(received)}</strong> →{" "}
                {change > 0.005 ? (
                  <>Change Due: <strong>{fmt(change)}</strong></>
                ) : received < balance - 0.005 ? (
                  <>{fmt(round2(balance - received))} left on the invoice</>
                ) : (
                  <>No change</>
                )}
                <button type="button" className="link-button" onClick={() => takeCash(0)}>Clear</button>
              </p>
            )}
          </div>
        )}

        {lines.length > 0 && (
          <fieldset className="pay-items">
            <legend>
              <span>APPLY TO ITEMS (OPTIONAL)</span>
              {payable.length > 0 && (
                <span className="pay-items-actions">
                  <button type="button" className="link-button" onClick={() => selectAll(true)}>Select all</button>
                  {selected.length > 0 && <button type="button" className="link-button" onClick={() => selectAll(false)}>Clear</button>}
                </span>
              )}
            </legend>
            <p className="pay-items-hint">
              Tick items to pay for them (choose how many units, or edit the amount). Type an amount first to spread it over the
              ticked items. Leave everything unticked to pay against the whole invoice.
            </p>
            <div className="table-wrap">
              <table className="pay-items-table">
                <thead>
                  <tr>
                    <th aria-label="Select" />
                    <th>ITEM</th>
                    <th>UNITS</th>
                    <th>LEFT TO PAY</th>
                    <th>APPLY</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const row = rows[l.id];
                    const done = l.remaining <= 0;
                    return (
                      <tr key={l.id} className={row.on ? "selected" : done ? "done" : undefined}>
                        <td>
                          <input
                            type="checkbox"
                            checked={row.on}
                            disabled={done}
                            onChange={() => toggle(l)}
                            aria-label={`Pay for ${l.description}`}
                          />
                        </td>
                        <td>
                          <strong>{l.description}</strong>
                          <small>
                            {l.sku ? `${l.sku} · ` : ""}
                            {l.paid > 0 ? `${fmt(l.paid)} of ${fmt(l.share)} paid` : `${fmt(l.share)} incl. tax & discount`}
                          </small>
                        </td>
                        <td>
                          {done ? (
                            <span className="badge badge-green">Paid</span>
                          ) : (
                            <span className="pay-units">
                              <input
                                type="number"
                                min="0"
                                max={l.quantity}
                                step="any"
                                value={row.qty ?? ""}
                                placeholder="—"
                                onChange={(e) => setQty(l, e.target.valueAsNumber)}
                                aria-label={`Units of ${l.description}`}
                              />
                              <small>of {formatNumber(l.quantity)}</small>
                            </span>
                          )}
                        </td>
                        <td className="amount">{fmt(l.remaining)}</td>
                        <td>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            className="pay-apply"
                            disabled={done}
                            value={row.on ? (Number.isFinite(row.apply) ? row.apply : "") : ""}
                            placeholder="0.00"
                            onChange={(e) => setApply(l, e.target.valueAsNumber)}
                            aria-label={`Amount for ${l.description}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {selected.length > 0 && (
              <div className="pay-split">
                <span>For items <strong>{fmt(applied)}</strong></span>
                <span className={general < -0.005 ? "over" : undefined}>
                  {general < -0.005 ? (
                    <>Items are <strong>{fmt(-general)}</strong> more than the amount</>
                  ) : (
                    <>General payment <strong>{fmt(Math.max(general, 0))}</strong></>
                  )}
                </span>
              </div>
            )}
          </fieldset>
        )}
      </div>
      <div className="modal-footer">
        <Dialog.Close asChild>
          <button type="button" className="button" disabled={pending}>Cancel</button>
        </Dialog.Close>
        <button type="submit" className="button button-primary" disabled={pending}>
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Banknote size={14} />} Record {Number.isFinite(amount) && amount > 0 ? fmt(amount) : "Payment"}
        </button>
      </div>
    </form>
  );
}
