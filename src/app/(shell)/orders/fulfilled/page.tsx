import { redirect } from "next/navigation";

export default function FulfilledOrdersRedirectPage() {
  redirect("/fulfilment?bucket=completed");
}
