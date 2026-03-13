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

function buildRedirectUrl(): string {
  if (Constants.appOwnership === "expo") {
    const scheme = Constants.expoConfig?.scheme || "glitch";
    return `${scheme}://phantom-connect`;
  }
  return "glitch://phantom-connect";
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
      if (!url.includes("phantom-connect")) return;

      try {
        // Parse query params from the callback URL
        let params: URLSearchParams;
        try {
          params = new URL(url).searchParams;
        } catch {
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

        // Phantom v1/connect returns phantom_encryption_public_key, data, nonce
        // Without shared secret decryption, we can't read the encrypted data.
        // But some Phantom versions also return public_key directly.
        let address = params.get("public_key");

        if (!address) {
          // Phantom returned encrypted data - we need the user to paste manually
          // Show the manual entry prompt
          showManualEntry("Phantom connected but we need your address. Copy it from Phantom and paste here:");
          return;
        }

        if (address.length >= 32 && address.length <= 44) {
          await SecureStore.setItemAsync(WALLET_KEY, address);
          setWalletAddress(address);
          Alert.alert("Connected!", `Wallet ${address.slice(0, 6)}...${address.slice(-4)} linked`);
        } else {
          showManualEntry("Could not read wallet address. Please paste it manually:");
        }
      } catch (e) {
        console.warn("Phantom callback error:", e);
        showManualEntry("Connection error. Please paste your wallet address:");
      } finally {
        setIsConnecting(false);
      }
    };

    const sub = Linking.addEventListener("url", handleUrl);

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    return () => sub.remove();
  }, []);

  const showManualEntry = (message: string) => {
    if (Alert.prompt) {
      Alert.prompt(
        "Enter Wallet Address",
        message,
        [
          { text: "Cancel", style: "cancel", onPress: () => setIsConnecting(false) },
          {
            text: "Connect",
            onPress: async (address?: string) => {
              if (address && address.length >= 32 && address.length <= 44) {
                await SecureStore.setItemAsync(WALLET_KEY, address);
                setWalletAddress(address);
                Alert.alert("Connected!", `Wallet ${address.slice(0, 6)}...${address.slice(-4)} linked`);
              } else {
                Alert.alert("Invalid", "That doesn't look like a valid Solana address");
              }
              setIsConnecting(false);
            },
          },
        ],
        "plain-text"
      );
    } else {
      Alert.alert("Enter Address", "Please go to Settings > Wallet to enter your address manually.");
      setIsConnecting(false);
    }
  };

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

      const canOpen = await Linking.canOpenURL("https://phantom.app");

      if (canOpen) {
        await Linking.openURL(connectUrl);
      } else {
        // Phantom not installed - offer manual entry or install
        Alert.alert(
          "Connect Wallet",
          "You can install Phantom or enter your wallet address manually.",
          [
            { text: "Cancel", style: "cancel", onPress: () => setIsConnecting(false) },
            {
              text: "Enter Manually",
              onPress: () => showManualEntry("Paste your Solana wallet address:"),
            },
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
      showManualEntry("Could not open Phantom. Paste your wallet address:");
    }
  }, []);

  const disconnect = useCallback(async () => {
    await SecureStore.deleteItemAsync(WALLET_KEY);
    setWalletAddress(null);
  }, []);

  return { walletAddress, isConnecting, isLoading, connect, disconnect };
}
