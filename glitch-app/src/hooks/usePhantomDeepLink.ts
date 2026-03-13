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
import * as SecureStore from "expo-secure-store";
import nacl from "tweetnacl";
import bs58 from "bs58";

const PHANTOM_CONNECT_URL = "https://phantom.app/ul/v1/connect";
const PHANTOM_SIGN_AND_SEND_URL = "https://phantom.app/ul/v1/signAndSendTransaction";
const APP_URL = "https://aiglitch.app";
const REDIRECT_BASE = "glitch://phantom";
const CLUSTER = "mainnet-beta";

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
}

// Pending promise for signAndSendTransaction callback
let pendingSignResolve: ((sig: string) => void) | null = null;
let pendingSignReject: ((err: Error) => void) | null = null;

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
      if (!url.startsWith("glitch://phantom")) return;

      try {
        const parsed = new URL(url);
        const path = parsed.hostname + parsed.pathname;

        if (path === "phantom/onConnect" || url.includes("onConnect")) {
          handleConnectResponse(url);
        } else if (path === "phantom/onSignAndSendTransaction" || url.includes("onSignAndSendTransaction")) {
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

  const connect = useCallback(async () => {
    setIsConnecting(true);

    // Generate a new keypair for this dApp session
    const keypair = nacl.box.keyPair();
    dappKeypairRef.current = keypair;

    const params = new URLSearchParams({
      app_url: APP_URL,
      dapp_encryption_public_key: bs58.encode(Buffer.from(keypair.publicKey)),
      redirect_link: `${REDIRECT_BASE}/onConnect`,
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

    // Encrypt the payload
    const payload = JSON.stringify({
      transaction: base64Transaction,
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
      redirect_link: `${REDIRECT_BASE}/onSignAndSendTransaction`,
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

  return { walletAddress, isConnecting, isLoading, connect, disconnect, signAndSendTransaction };
}
