import { useState, useEffect, useCallback } from "react";
import { Linking, Platform, Alert } from "react-native";
import * as SecureStore from "expo-secure-store";

const WALLET_KEY = "aiglitch-wallet";

interface PhantomWalletState {
  walletAddress: string | null;
  isConnecting: boolean;
  isLoading: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function usePhantomWallet(): PhantomWalletState {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Don't auto-load cached wallet — user wants fresh connect flow each launch
  // Wallet only gets set when user explicitly connects via connect()
  useEffect(() => {
    setIsLoading(false);
  }, []);

  const saveWallet = async (address: string) => {
    await SecureStore.setItemAsync(WALLET_KEY, address);
    setWalletAddress(address);
    setIsConnecting(false);
    Alert.alert("Connected!", `Wallet ${address.slice(0, 6)}...${address.slice(-4)} linked`);
  };

  const showManualEntry = (message: string) => {
    if (Alert.prompt) {
      Alert.prompt(
        "Connect Wallet",
        message,
        [
          { text: "Cancel", style: "cancel", onPress: () => setIsConnecting(false) },
          {
            text: "Connect",
            onPress: async (address?: string) => {
              const trimmed = address?.trim();
              if (trimmed && trimmed.length >= 32 && trimmed.length <= 44) {
                await saveWallet(trimmed);
              } else {
                Alert.alert("Invalid", "That doesn't look like a valid Solana address");
                setIsConnecting(false);
              }
            },
          },
        ],
        "plain-text"
      );
    } else {
      Alert.alert("Enter Address", "Please go to the Wallet tab to enter your address.");
      setIsConnecting(false);
    }
  };

  const connect = useCallback(async () => {
    setIsConnecting(true);

    // Check if Phantom app is installed
    let phantomInstalled = false;
    try {
      phantomInstalled = await Linking.canOpenURL("phantom://");
    } catch {}

    if (phantomInstalled) {
      // Phantom IS installed — open it, then prompt for address paste
      Alert.alert(
        "Connect Wallet",
        "We'll open Phantom so you can copy your wallet address. Then come back here and paste it.",
        [
          { text: "Cancel", style: "cancel", onPress: () => setIsConnecting(false) },
          {
            text: "Open Phantom & Copy Address",
            onPress: async () => {
              try {
                await Linking.openURL("phantom://");
              } catch {}
              // Show paste prompt after user returns
              setTimeout(() => {
                showManualEntry("Paste your Solana wallet address from Phantom:");
              }, 2000);
            },
          },
        ]
      );
    } else {
      // Phantom NOT installed — offer manual entry or install
      Alert.alert(
        "Connect Wallet",
        "Phantom wallet not detected. You can enter your address manually or install Phantom.",
        [
          { text: "Cancel", style: "cancel", onPress: () => setIsConnecting(false) },
          {
            text: "Enter Address",
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
  }, []);

  const disconnect = useCallback(async () => {
    await SecureStore.deleteItemAsync(WALLET_KEY);
    setWalletAddress(null);
  }, []);

  return { walletAddress, isConnecting, isLoading, connect, disconnect };
}
