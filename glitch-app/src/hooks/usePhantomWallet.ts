import { useState, useEffect, useCallback, useRef } from "react";
import { Linking, Platform, Alert } from "react-native";
import * as SecureStore from "expo-secure-store";
import nacl from "tweetnacl";
import bs58 from "bs58";

const WALLET_KEY = "aiglitch-wallet";
const DAPP_KEYPAIR_KEY = "aiglitch-dapp-keypair";

// Phantom deep link base
const PHANTOM_CONNECT = "https://phantom.app/ul/v1/connect";

// Our app scheme for callbacks
const APP_SCHEME = "glitch";
const REDIRECT_LINK = `${APP_SCHEME}://phantom-connect`;

interface PhantomWalletState {
  walletAddress: string | null;
  isConnecting: boolean;
  isLoading: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

/**
 * Encodes a Uint8Array to base58 string.
 */
function toBase58(bytes: Uint8Array): string {
  return bs58.encode(Buffer.from(bytes));
}

/**
 * Decodes a base58-encoded string to Uint8Array.
 */
function fromBase58(str: string): Uint8Array {
  return new Uint8Array(bs58.decode(str));
}

/**
 * Gets or creates a persistent dApp keypair for Phantom encryption.
 */
async function getDappKeypair(): Promise<nacl.BoxKeyPair> {
  const stored = await SecureStore.getItemAsync(DAPP_KEYPAIR_KEY);
  if (stored) {
    const parsed = JSON.parse(stored);
    return {
      publicKey: fromBase58(parsed.publicKey),
      secretKey: fromBase58(parsed.secretKey),
    };
  }
  const kp = nacl.box.keyPair();
  await SecureStore.setItemAsync(
    DAPP_KEYPAIR_KEY,
    JSON.stringify({
      publicKey: toBase58(kp.publicKey),
      secretKey: toBase58(kp.secretKey),
    })
  );
  return kp;
}

/**
 * Decrypts Phantom's encrypted response data.
 */
function decryptPayload(
  data: string,
  nonce: string,
  sharedSecret: Uint8Array
): any {
  const decrypted = nacl.box.open.after(
    fromBase58(data),
    fromBase58(nonce),
    sharedSecret
  );
  if (!decrypted) throw new Error("Failed to decrypt Phantom response");
  return JSON.parse(new TextDecoder().decode(decrypted));
}

export function usePhantomWallet(): PhantomWalletState {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const sharedSecretRef = useRef<Uint8Array | null>(null);
  const dappKeypairRef = useRef<nacl.BoxKeyPair | null>(null);

  // Load saved wallet on mount
  useEffect(() => {
    (async () => {
      const saved = await SecureStore.getItemAsync(WALLET_KEY);
      if (saved) setWalletAddress(saved);
      setIsLoading(false);
    })();
  }, []);

  // Listen for Phantom deep link callback
  useEffect(() => {
    const handleUrl = async ({ url }: { url: string }) => {
      if (!url.startsWith(`${APP_SCHEME}://phantom-connect`)) return;

      try {
        const params = new URL(url).searchParams;

        // Check for errors
        const errorCode = params.get("errorCode");
        if (errorCode) {
          const errorMessage = params.get("errorMessage") || "Connection rejected";
          Alert.alert("Connection Failed", errorMessage);
          setIsConnecting(false);
          return;
        }

        // Successful connect — extract wallet address
        const phantomPublicKey = params.get("phantom_encryption_public_key");
        const data = params.get("data");
        const nonce = params.get("nonce");

        if (phantomPublicKey && data && nonce && dappKeypairRef.current) {
          // Compute shared secret
          const phantomPubKey = fromBase58(phantomPublicKey);
          const shared = nacl.box.before(
            phantomPubKey,
            dappKeypairRef.current.secretKey
          );
          sharedSecretRef.current = shared;

          // Decrypt the response to get the wallet public key
          const decrypted = decryptPayload(data, nonce, shared);
          const address = decrypted.public_key;

          if (address) {
            await SecureStore.setItemAsync(WALLET_KEY, address);
            setWalletAddress(address);
          }
        }
      } catch (e) {
        console.warn("Phantom callback error:", e);
        Alert.alert("Error", "Failed to process wallet connection");
      } finally {
        setIsConnecting(false);
      }
    };

    // Handle deep links when app is already open
    const sub = Linking.addEventListener("url", handleUrl);

    // Handle deep link that launched the app
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    return () => sub.remove();
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);

    try {
      const dappKp = await getDappKeypair();
      dappKeypairRef.current = dappKp;

      const params = new URLSearchParams({
        dapp_encryption_public_key: toBase58(dappKp.publicKey),
        redirect_link: REDIRECT_LINK,
        cluster: "mainnet-beta",
        app_url: "https://aiglitch.app",
      });

      const connectUrl = `${PHANTOM_CONNECT}?${params.toString()}`;

      // Check if Phantom is installed
      const canOpen = await Linking.canOpenURL("phantom://");

      if (canOpen) {
        // Open Phantom directly
        await Linking.openURL(connectUrl);
      } else {
        // Phantom not installed — open App Store / Play Store
        Alert.alert(
          "Phantom Wallet Required",
          "Install Phantom wallet to connect your Solana wallet.",
          [
            { text: "Cancel", style: "cancel", onPress: () => setIsConnecting(false) },
            {
              text: "Install Phantom",
              onPress: () => {
                const storeUrl = Platform.OS === "ios"
                  ? "https://apps.apple.com/app/phantom-solana-wallet/id1598432977"
                  : "https://play.google.com/store/apps/details?id=app.phantom";
                Linking.openURL(storeUrl);
                setIsConnecting(false);
              },
            },
          ]
        );
      }
    } catch (e) {
      console.warn("Phantom connect error:", e);
      Alert.alert("Error", "Failed to open Phantom wallet");
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await SecureStore.deleteItemAsync(WALLET_KEY);
    sharedSecretRef.current = null;
    setWalletAddress(null);
  }, []);

  return { walletAddress, isConnecting, isLoading, connect, disconnect };
}
