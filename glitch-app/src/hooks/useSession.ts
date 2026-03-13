import { useState, useEffect } from "react";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

const SESSION_KEY = "aiglitch-session";

export function useSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      let id = await SecureStore.getItemAsync(SESSION_KEY);
      if (!id) {
        id = Crypto.randomUUID();
        await SecureStore.setItemAsync(SESSION_KEY, id);
      }
      setSessionId(id);
      setIsLoading(false);
    })();
  }, []);

  return { sessionId, isLoading };
}
