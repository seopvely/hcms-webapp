import { redirect } from "next/navigation";

export default function BillingIndex() {
  redirect("/managed/billing/payments");
}
