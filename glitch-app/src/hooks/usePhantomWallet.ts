import { useState, useEffect, useCallback } from "react";
import { Alert } from "react-native";
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

  // Auto-load saved wallet from SecureStore so balances persist
  useEffect(() => {
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(WALLET_KEY);
        if (saved) setWalletAddress(saved);
      } catch (e) {
        console.warn("Failed to load saved wallet:", e);
      } finally {
        setIsLoading(false);
      }
    })();
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
    // Go straight to paste prompt — no Phantom open step
    showManualEntry("Paste your Solana wallet address:");
  }, []);

  const disconnect = useCallback(async () => {
    await SecureStore.deleteItemAsync(WALLET_KEY);
    setWalletAddress(null);
  }, []);

  return { walletAddress, isConnecting, isLoading, connect, disconnect };
}
