import { useState, useEffect, useCallback } from "react";
import { Linking, Platform, Alert } from "react-native";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const WALLET_KEY = "aiglitch-wallet";

interface PhantomWalletState {
  walletAddress: string | null;
  isConnecting: boolean;
  isLoading: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

/**
 * Build the redirect URL that works in both Expo Go and standalone builds.
 * In Expo Go: exp://192.168.x.x:8081/--/phantom-connect
 * In standalone: glitch://phantom-connect
 */
function buildRedirectUrl(): string {
  // In Expo Go, use the Expo scheme
  const scheme = Constants.appOwnership === "expo" ? "exp" : "glitch";
  if (scheme === "exp") {
    // Expo Go uses the dev server URL
    const devUrl = Constants.experienceUrl || Constants.linkingUri || "";
    // Strip trailing slash and add our path
    const base = devUrl.replace(/\/$/, "");
    return `${base}/--/phantom-connect`;
  }
  return `glitch://phantom-connect`;
}

export function usePhantomWallet(): PhantomWalletState {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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
      // Check if this is a phantom-connect callback
      if (!url.includes("phantom-connect")) return;

      try {
        // Parse the URL to get query params
        // Handle both glitch:// and exp:// schemes
        let params: URLSearchParams;
        try {
          params = new URL(url).searchParams;
        } catch {
          // If URL parsing fails, try manual extraction
          const queryString = url.split("?")[1] || "";
          params = new URLSearchParams(queryString);
        }

        // Check for errors from Phantom
        const errorCode = params.get("errorCode");
        if (errorCode) {
          const errorMessage = params.get("errorMessage") || "Connection rejected";
          Alert.alert("Connection Failed", errorMessage);
          setIsConnecting(false);
          return;
        }

        // Phantom returns the public key directly for non-encrypted connects
        const publicKey = params.get("phantom_encryption_public_key");

        // For the v1/connect endpoint, Phantom returns the wallet address
        // in the encrypted data, OR as a direct parameter depending on version
        // Try to get it from various possible locations
        let address = params.get("public_key");

        if (!address) {
          // Some versions return it differently
          // Check if we got data/nonce (encrypted response) — but we skip encryption
          // and just prompt user to enter manually or use alternative approach

          // Actually for Phantom universal links without encryption,
          // the public key comes back as a query parameter
          address = params.get("phantom_encryption_public_key");
        }

        if (address && address.length >= 32 && address.length <= 44) {
          await SecureStore.setItemAsync(WALLET_KEY, address);
          setWalletAddress(address);
          Alert.alert("Connected!", `Wallet ${address.slice(0, 6)}...${address.slice(-4)} linked`);
        }
      } catch (e) {
        console.warn("Phantom callback error:", e);
        Alert.alert("Error", "Failed to process wallet connection");
      } finally {
        setIsConnecting(false);
      }
    };

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
      const redirectUrl = buildRedirectUrl();

      const params = new URLSearchParams({
        redirect_link: redirectUrl,
        cluster: "mainnet-beta",
        app_url: "https://aiglitch.app",
      });

      const connectUrl = `https://phantom.app/ul/v1/connect?${params.toString()}`;

      // Try to open Phantom
      const canOpen = await Linking.canOpenURL("https://phantom.app/ul/v1/connect");

      if (canOpen) {
        await Linking.openURL(connectUrl);
      } else {
        // Phantom not installed
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

      // Fallback: let user paste wallet address manually
      Alert.prompt
        ? Alert.prompt(
            "Enter Wallet Address",
            "Paste your Solana wallet address to connect manually:",
            [
              { text: "Cancel", style: "cancel", onPress: () => setIsConnecting(false) },
              {
                text: "Connect",
                onPress: async (address?: string) => {
                  if (address && address.length >= 32 && address.length <= 44) {
                    await SecureStore.setItemAsync(WALLET_KEY, address);
                    setWalletAddress(address);
                  } else {
                    Alert.alert("Invalid", "That doesn't look like a valid Solana address");
                  }
                  setIsConnecting(false);
                },
              },
            ],
            "plain-text"
          )
        : (() => {
            Alert.alert("Error", "Could not open Phantom. Please try again.");
            setIsConnecting(false);
          })();
    }
  }, []);

  const disconnect = useCallback(async () => {
    await SecureStore.deleteItemAsync(WALLET_KEY);
    setWalletAddress(null);
  }, []);

  return { walletAddress, isConnecting, isLoading, connect, disconnect };
}
