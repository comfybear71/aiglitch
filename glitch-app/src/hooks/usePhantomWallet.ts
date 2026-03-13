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

  // Load saved wallet on mount
  useEffect(() => {
    (async () => {
      const saved = await SecureStore.getItemAsync(WALLET_KEY);
      if (saved) setWalletAddress(saved);
      setIsLoading(false);
    })();
  }, []);

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
      // Android fallback - no Alert.prompt available
      Alert.alert("Enter Address", "Please go to the Wallet tab to enter your address.");
      setIsConnecting(false);
    }
  };

  const connect = useCallback(async () => {
    setIsConnecting(true);

    // Step 1: Ask user if they have Phantom installed
    Alert.alert(
      "Connect Wallet",
      "To connect, open Phantom wallet, copy your Solana address, then come back and paste it.",
      [
        { text: "Cancel", style: "cancel", onPress: () => setIsConnecting(false) },
        {
          text: "Open Phantom",
          onPress: async () => {
            // Try to open Phantom app
            try {
              const canOpen = await Linking.canOpenURL("https://phantom.app");
              if (canOpen) {
                await Linking.openURL("https://phantom.app");
              }
            } catch {}

            // After a short delay, show paste prompt
            // User will switch back to our app and paste
            setTimeout(() => {
              showManualEntry("Paste your Solana wallet address from Phantom:");
            }, 1500);
          },
        },
        {
          text: "Paste Address",
          onPress: () => {
            showManualEntry("Paste your Solana wallet address:");
          },
        },
      ]
    );
  }, []);

  const disconnect = useCallback(async () => {
    await SecureStore.deleteItemAsync(WALLET_KEY);
    setWalletAddress(null);
  }, []);

  return { walletAddress, isConnecting, isLoading, connect, disconnect };
}
