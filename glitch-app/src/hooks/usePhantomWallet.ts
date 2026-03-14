import { useState, useEffect, useCallback } from "react";
import { Alert } from "react-native";
import * as SecureStore from "expo-secure-store";

const WALLET_KEY = "aiglitch-wallet";

interface PhantomWalletState {
  walletAddress: string | null;
  isConnecting: boolean;
  isLoading: boolean;
  showModal: boolean;
  connect: () => void;
  disconnect: () => Promise<void>;
  submitAddress: (address: string) => Promise<void>;
  cancelConnect: () => void;
}

export function usePhantomWallet(): PhantomWalletState {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

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

  const connect = useCallback(() => {
    setIsConnecting(true);
    setShowModal(true);
  }, []);

  const cancelConnect = useCallback(() => {
    setShowModal(false);
    setIsConnecting(false);
  }, []);

  const submitAddress = useCallback(async (address: string) => {
    const trimmed = address.trim();
    if (trimmed.length >= 32 && trimmed.length <= 44) {
      await SecureStore.setItemAsync(WALLET_KEY, trimmed);
      setWalletAddress(trimmed);
      setShowModal(false);
      setIsConnecting(false);
      Alert.alert("Connected!", `Wallet ${trimmed.slice(0, 6)}...${trimmed.slice(-4)} linked`);
    } else {
      Alert.alert("Invalid", "That doesn't look like a valid Solana address");
    }
  }, []);

  const disconnect = useCallback(async () => {
    await SecureStore.deleteItemAsync(WALLET_KEY);
    setWalletAddress(null);
  }, []);

  return { walletAddress, isConnecting, isLoading, showModal, connect, disconnect, submitAddress, cancelConnect };
}
