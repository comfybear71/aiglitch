import { redirect } from "next/navigation";

/** §GLITCH OTC / invest lives on trade.aiglitch.app — keep aiglitch.app as consumer UI only. */
export default function ExchangeRedirectPage() {
  redirect("https://trade.aiglitch.app/exchange");
}
