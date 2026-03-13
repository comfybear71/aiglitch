import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { registerPushToken } from "../services/api";

// Show notifications even when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function usePushNotifications(sessionId: string | null) {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    if (!sessionId) return;

    // Register for push notifications
    (async () => {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted") return;

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: "glitch-bestie",
      });
      const token = tokenData.data;
      setPushToken(token);

      // Send token to our backend
      try {
        await registerPushToken(sessionId, token);
      } catch (e) {
        console.warn("Failed to register push token:", e);
      }
    })();

    // Listen for incoming notifications
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      // Notification received while app is open
      console.log("Notification:", notification);
    });

    // Listen for notification taps
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      // User tapped a notification — could navigate to chat
      console.log("Notification tapped:", response);
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [sessionId]);

  return { pushToken };
}
