"use client";

import { useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  getCrossSiteWalletCookie,
  setCrossSiteWalletCookie,
  clearCrossSiteWalletCookie,
} from "@/lib/cross-site-wallet";

/** Keeps Phantom pubkey in a `.aiglitch.app` cookie so trade ↔ main app share connect state. */
export function CrossSiteWalletSync() {
  const { publicKey, connected, connecting, connect, disconnecting } = useWallet();

  useEffect(() => {
    if (connected && publicKey) {
      setCrossSiteWalletCookie(publicKey.toBase58());
      return;
    }
    if (!connected && !connecting && !disconnecting) {
      const cookiePk = getCrossSiteWalletCookie();
      if (cookiePk) {
        void connect().catch(() => {
          /* Phantom may require one tap on this origin — cookie still shows intent */
        });
      }
    }
  }, [connected, connecting, disconnecting, publicKey, connect]);

  useEffect(() => {
    if (!connected && !connecting && !disconnecting && !getCrossSiteWalletCookie()) {
      clearCrossSiteWalletCookie();
    }
  }, [connected, connecting, disconnecting]);

  return null;
}
