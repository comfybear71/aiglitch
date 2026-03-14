/**
 * Phantom wallet deep link integration for React Native / Expo.
 *
 * Handles the full flow:
 * 1. Connect — establishes encrypted session with Phantom
 * 2. SignAndSendTransaction — sends a base64 transaction to Phantom for signing + submission
 *
 * Uses tweetnacl for encryption (Phantom's required protocol).
 * URL scheme: glitch:// (registered in app.json)
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { Alert, Linking, Platform } from "react-native";
import * as Linking2 from "expo-linking";
import * as SecureStore from "expo-secure-store";
import nacl from "tweetnacl";
import bs58 from "bs58";

const PHANTOM_CONNECT_URL = "https://phantom.app/ul/v1/connect";
const PHANTOM_SIGN_AND_SEND_URL = "https://phantom.app/ul/v1/signAndSendTransaction";
const PHANTOM_SIGN_TX_URL = "https://phantom.app/ul/v1/signTransaction";
const APP_URL = "https://aiglitch.app";
const CLUSTER = "mainnet-beta";

// Build redirect URLs that work in both Expo Go and standalone builds
function buildRedirectUrl(path: string): string {
  return Linking2.createURL(`phantom/${path}`);
}

// SecureStore keys
const KEYS = {
  WALLET: "aiglitch-wallet",
  SESSION: "aiglitch-phantom-session",
  SHARED_SECRET: "aiglitch-phantom-shared-secret",
  DAPP_KEYPAIR_SECRET: "aiglitch-dapp-keypair-secret",
  DAPP_KEYPAIR_PUBLIC: "aiglitch-dapp-keypair-public",
  PHANTOM_PUBLIC: "aiglitch-phantom-public",
};

interface PhantomDeepLinkState {
  walletAddress: string | null;
  isConnecting: boolean;
  isLoading: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signAndSendTransaction: (base64Transaction: string) => Promise<string>;
  signTransaction: (base64Transaction: string) => Promise<string>;
}

// Pending promise for signAndSendTransaction callback
let pendingSignResolve: ((sig: string) => void) | null = null;
let pendingSignReject: ((err: Error) => void) | null = null;

// Pending promise for signTransaction callback (sign only, returns signed tx)
let pendingSignTxResolve: ((signedTx: string) => void) | null = null;
let pendingSignTxReject: ((err: Error) => void) | null = null;

export function usePhantomDeepLink(): PhantomDeepLinkState {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Keep mutable refs for the encryption state so deep link callbacks can access them
  const dappKeypairRef = useRef<nacl.BoxKeyPair | null>(null);
  const sharedSecretRef = useRef<Uint8Array | null>(null);
  const sessionRef = useRef<string | null>(null);

  // Load saved state on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(KEYS.WALLET);
        if (saved) setWalletAddress(saved);

        // Restore encryption state
        const secretStr = await SecureStore.getItemAsync(KEYS.DAPP_KEYPAIR_SECRET);
        const publicStr = await SecureStore.getItemAsync(KEYS.DAPP_KEYPAIR_PUBLIC);
        const phantomPubStr = await SecureStore.getItemAsync(KEYS.PHANTOM_PUBLIC);
        const sessionStr = await SecureStore.getItemAsync(KEYS.SESSION);

        if (secretStr && publicStr && phantomPubStr && sessionStr) {
          const secretKey = bs58.decode(secretStr);
          const publicKey = bs58.decode(publicStr);
          dappKeypairRef.current = { secretKey, publicKey };
          const phantomPub = bs58.decode(phantomPubStr);
          sharedSecretRef.current = nacl.box.before(phantomPub, secretKey.slice(0, 32));
          sessionRef.current = sessionStr;
        }
      } catch (e) {
        console.warn("Failed to load Phantom state:", e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Handle incoming deep links from Phantom
  useEffect(() => {
    const handleUrl = ({ url }: { url: string }) => {
      // Accept deep links from both Expo Go (exp://) and standalone (glitch://) builds
      // Match on the callback name in the URL rather than a fixed prefix
      if (!url.includes("onConnect") && !url.includes("onSignTransaction") && !url.includes("onSignAndSendTransaction") && !url.includes("errorCode")) return;

      try {
        if (url.includes("onConnect")) {
          handleConnectResponse(url);
        } else if (url.includes("onSignTransaction") && !url.includes("onSignAndSendTransaction")) {
          handleSignTransactionResponse(url);
        } else if (url.includes("onSignAndSendTransaction")) {
          handleSignAndSendResponse(url);
        } else if (url.includes("errorCode")) {
          // Error from Phantom
          const params = new URL(url).searchParams;
          const errorMessage = params.get("errorMessage") || "Phantom returned an error";
          console.warn("Phantom error:", errorMessage);
          setIsConnecting(false);
          if (pendingSignReject) {
            pendingSignReject(new Error(errorMessage));
            pendingSignReject = null;
            pendingSignResolve = null;
          }
          if (pendingSignTxReject) {
            pendingSignTxReject(new Error(errorMessage));
            pendingSignTxReject = null;
            pendingSignTxResolve = null;
          }
        }
      } catch (e) {
        console.warn("Deep link parse error:", e);
      }
    };

    // Handle deep links when app is already open
    const subscription = Linking.addEventListener("url", handleUrl);

    // Handle deep link that opened the app
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    return () => subscription.remove();
  }, []);

  const handleConnectResponse = async (url: string) => {
    try {
      const params = new URL(url).searchParams;
      const phantomEncryptionPubKey = params.get("phantom_encryption_public_key");
      const nonce = params.get("nonce");
      const data = params.get("data");

      if (!phantomEncryptionPubKey || !nonce || !data || !dappKeypairRef.current) {
        throw new Error("Missing connect response params");
      }

      const phantomPub = bs58.decode(phantomEncryptionPubKey);
      // Derive shared secret: nacl.box.before(theirPublicKey, ourSecretKey)
      // Our secretKey from nacl.box.keyPair() is 32 bytes
      const dappSecret = dappKeypairRef.current.secretKey;
      const secret32 = dappSecret.length === 64 ? dappSecret.slice(0, 32) : dappSecret;
      const sharedSecret = nacl.box.before(phantomPub, secret32);
      sharedSecretRef.current = sharedSecret;

      // Decrypt the response
      const decrypted = nacl.box.open.after(
        bs58.decode(data),
        bs58.decode(nonce),
        sharedSecret,
      );

      if (!decrypted) throw new Error("Failed to decrypt Phantom response");

      const payload = JSON.parse(new TextDecoder().decode(decrypted));
      const walletAddr = payload.public_key;
      const session = payload.session;

      sessionRef.current = session;
      setWalletAddress(walletAddr);
      setIsConnecting(false);

      // Save everything
      await SecureStore.setItemAsync(KEYS.WALLET, walletAddr);
      await SecureStore.setItemAsync(KEYS.SESSION, session);
      await SecureStore.setItemAsync(KEYS.PHANTOM_PUBLIC, phantomEncryptionPubKey);
      await SecureStore.setItemAsync(
        KEYS.DAPP_KEYPAIR_SECRET,
        bs58.encode(Buffer.from(dappKeypairRef.current.secretKey)),
      );
      await SecureStore.setItemAsync(
        KEYS.DAPP_KEYPAIR_PUBLIC,
        bs58.encode(Buffer.from(dappKeypairRef.current.publicKey)),
      );

      Alert.alert("Connected!", `Wallet ${walletAddr.slice(0, 6)}...${walletAddr.slice(-4)} linked via Phantom`);
    } catch (e: any) {
      console.error("Connect response error:", e);
      setIsConnecting(false);
      Alert.alert("Connection Failed", e?.message || "Could not connect to Phantom");
    }
  };

  const handleSignAndSendResponse = async (url: string) => {
    try {
      const params = new URL(url).searchParams;
      const nonce = params.get("nonce");
      const data = params.get("data");

      if (!nonce || !data || !sharedSecretRef.current) {
        throw new Error("Missing signAndSend response params");
      }

      const decrypted = nacl.box.open.after(
        bs58.decode(data),
        bs58.decode(nonce),
        sharedSecretRef.current,
      );

      if (!decrypted) throw new Error("Failed to decrypt Phantom response");

      const payload = JSON.parse(new TextDecoder().decode(decrypted));
      const signature = payload.signature;

      if (pendingSignResolve) {
        pendingSignResolve(signature);
        pendingSignResolve = null;
        pendingSignReject = null;
      }
    } catch (e: any) {
      console.error("SignAndSend response error:", e);
      if (pendingSignReject) {
        pendingSignReject(new Error(e?.message || "Failed to process Phantom response"));
        pendingSignReject = null;
        pendingSignResolve = null;
      }
    }
  };

  const handleSignTransactionResponse = async (url: string) => {
    try {
      const params = new URL(url).searchParams;
      const nonce = params.get("nonce");
      const data = params.get("data");

      if (!nonce || !data || !sharedSecretRef.current) {
        throw new Error("Missing signTransaction response params");
      }

      const decrypted = nacl.box.open.after(
        bs58.decode(data),
        bs58.decode(nonce),
        sharedSecretRef.current,
      );

      if (!decrypted) throw new Error("Failed to decrypt Phantom response");

      const payload = JSON.parse(new TextDecoder().decode(decrypted));
      // Phantom returns { transaction: "<base58-encoded signed tx>" }
      const signedTxBase58 = payload.transaction;

      if (pendingSignTxResolve) {
        // Convert from base58 to base64 for server submission
        const signedTxBytes = bs58.decode(signedTxBase58);
        const signedTxBase64 = Buffer.from(signedTxBytes).toString("base64");
        pendingSignTxResolve(signedTxBase64);
        pendingSignTxResolve = null;
        pendingSignTxReject = null;
      }
    } catch (e: any) {
      console.error("SignTransaction response error:", e);
      if (pendingSignTxReject) {
        pendingSignTxReject(new Error(e?.message || "Failed to process Phantom response"));
        pendingSignTxReject = null;
        pendingSignTxResolve = null;
      }
    }
  };

  const connect = useCallback(async () => {
    setIsConnecting(true);

    // Generate a new keypair for this dApp session
    const keypair = nacl.box.keyPair();
    dappKeypairRef.current = keypair;

    const params = new URLSearchParams({
      app_url: APP_URL,
      dapp_encryption_public_key: bs58.encode(Buffer.from(keypair.publicKey)),
      redirect_link: buildRedirectUrl("onConnect"),
      cluster: CLUSTER,
    });

    const url = `${PHANTOM_CONNECT_URL}?${params.toString()}`;

    try {
      const canOpen = await Linking.canOpenURL("phantom://");
      if (!canOpen) {
        setIsConnecting(false);
        Alert.alert(
          "Phantom Not Found",
          "Please install Phantom wallet from the App Store to connect.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Get Phantom",
              onPress: () => Linking.openURL(
                Platform.OS === "ios"
                  ? "https://apps.apple.com/app/phantom-crypto-wallet/id1598432977"
                  : "https://play.google.com/store/apps/details?id=app.phantom"
              ),
            },
          ],
        );
        return;
      }

      // Auto-reset connecting state after 30s if Phantom doesn't respond
      setTimeout(() => {
        setIsConnecting((current) => {
          if (current) {
            Alert.alert(
              "Connection Timed Out",
              "Phantom didn't respond. Please try again.",
            );
          }
          return false;
        });
      }, 30000);

      await Linking.openURL(url);
    } catch (e: any) {
      setIsConnecting(false);
      Alert.alert("Connection Error", e?.message || "Could not open Phantom");
    }
  }, []);

  const disconnect = useCallback(async () => {
    setWalletAddress(null);
    dappKeypairRef.current = null;
    sharedSecretRef.current = null;
    sessionRef.current = null;

    await SecureStore.deleteItemAsync(KEYS.WALLET);
    await SecureStore.deleteItemAsync(KEYS.SESSION);
    await SecureStore.deleteItemAsync(KEYS.SHARED_SECRET);
    await SecureStore.deleteItemAsync(KEYS.DAPP_KEYPAIR_SECRET);
    await SecureStore.deleteItemAsync(KEYS.DAPP_KEYPAIR_PUBLIC);
    await SecureStore.deleteItemAsync(KEYS.PHANTOM_PUBLIC);
  }, []);

  const signAndSendTransaction = useCallback(async (base64Transaction: string): Promise<string> => {
    if (!sharedSecretRef.current || !sessionRef.current || !dappKeypairRef.current) {
      throw new Error("Not connected to Phantom. Please connect your wallet first.");
    }

    // Phantom deep link protocol requires base58-encoded transactions (NOT base64)
    const txBytes = Buffer.from(base64Transaction, "base64");
    const txBase58 = bs58.encode(txBytes);

    // Encrypt the payload
    const payload = JSON.stringify({
      transaction: txBase58,
      session: sessionRef.current,
      sendOptions: { skipPreflight: false },
    });

    const nonce = nacl.randomBytes(24);
    const encrypted = nacl.box.after(
      new TextEncoder().encode(payload),
      nonce,
      sharedSecretRef.current,
    );

    const params = new URLSearchParams({
      dapp_encryption_public_key: bs58.encode(Buffer.from(dappKeypairRef.current.publicKey)),
      nonce: bs58.encode(Buffer.from(nonce)),
      redirect_link: buildRedirectUrl("onSignAndSendTransaction"),
      payload: bs58.encode(Buffer.from(encrypted)),
    });

    const url = `${PHANTOM_SIGN_AND_SEND_URL}?${params.toString()}`;

    // Create a promise that resolves when Phantom responds via deep link
    const signPromise = new Promise<string>((resolve, reject) => {
      pendingSignResolve = resolve;
      pendingSignReject = reject;

      // Timeout after 2 minutes
      setTimeout(() => {
        if (pendingSignReject) {
          pendingSignReject(new Error("Transaction signing timed out"));
          pendingSignReject = null;
          pendingSignResolve = null;
        }
      }, 120000);
    });

    await Linking.openURL(url);
    return signPromise;
  }, []);

  /**
   * Sign a transaction via Phantom deep link (sign only — does NOT submit).
   * Returns the signed transaction as a base64 string for server-side submission.
   * This matches the web app flow: client signs → server submits → server confirms on-chain.
   */
  const signTransaction = useCallback(async (base64Transaction: string): Promise<string> => {
    if (!sharedSecretRef.current || !sessionRef.current || !dappKeypairRef.current) {
      throw new Error("Not connected to Phantom. Please connect your wallet first.");
    }

    // Phantom deep link protocol requires base58-encoded transactions (NOT base64)
    // Our backend returns base64, so convert: base64 → bytes → base58
    const txBytes = Buffer.from(base64Transaction, "base64");
    const txBase58 = bs58.encode(txBytes);

    // Encrypt the payload
    const payload = JSON.stringify({
      transaction: txBase58,
      session: sessionRef.current,
    });

    const nonce = nacl.randomBytes(24);
    const encrypted = nacl.box.after(
      new TextEncoder().encode(payload),
      nonce,
      sharedSecretRef.current,
    );

    const params = new URLSearchParams({
      dapp_encryption_public_key: bs58.encode(Buffer.from(dappKeypairRef.current.publicKey)),
      nonce: bs58.encode(Buffer.from(nonce)),
      redirect_link: buildRedirectUrl("onSignTransaction"),
      payload: bs58.encode(Buffer.from(encrypted)),
    });

    const url = `${PHANTOM_SIGN_TX_URL}?${params.toString()}`;

    // Create a promise that resolves when Phantom responds via deep link
    const signPromise = new Promise<string>((resolve, reject) => {
      pendingSignTxResolve = resolve;
      pendingSignTxReject = reject;

      // Timeout after 2 minutes
      setTimeout(() => {
        if (pendingSignTxReject) {
          pendingSignTxReject(new Error("Transaction signing timed out"));
          pendingSignTxReject = null;
          pendingSignTxResolve = null;
        }
      }, 120000);
    });

    await Linking.openURL(url);
    return signPromise;
  }, []);

  return { walletAddress, isConnecting, isLoading, connect, disconnect, signAndSendTransaction, signTransaction };
}
