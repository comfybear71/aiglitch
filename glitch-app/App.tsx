import React, { useState } from "react";
import { StatusBar, View, Text, StyleSheet, Platform } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import SplashScreen from "./src/screens/SplashScreen";
import HomeScreen from "./src/screens/HomeScreen";
import ChatScreen from "./src/screens/ChatScreen";
import VoiceChatScreen from "./src/screens/VoiceChatScreen";
import BuyGlitchScreen from "./src/screens/BuyGlitchScreen";
// WalletScreen removed — not needed yet

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const DarkTheme = {
  ...DefaultTheme,
  dark: true as const,
  colors: {
    ...DefaultTheme.colors,
    primary: "#7c3aed",
    background: "#000000",
    card: "#000000",
    text: "#ffffff",
    border: "#2a2a2a",
    notification: "#ef4444",
  },
};

const stackScreenOptions = {
  headerStyle: { backgroundColor: "#000000" },
  headerTintColor: "#ffffff",
  headerTitleStyle: { fontWeight: "600" as const, fontSize: 16 },
  headerBackTitle: "Back",
  headerShadowVisible: false,
};

// Tab icon component
function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <View style={[tabStyles.iconWrap, focused && tabStyles.iconWrapActive]}>
      <Text style={[tabStyles.icon, focused && tabStyles.iconActive]}>{emoji}</Text>
    </View>
  );
}

// Home tab has its own stack for Chat/VoiceChat navigation
function HomeStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen
        name="HomeMain"
        component={HomeScreen}
        options={{
          headerTitle: "G!itch",
          headerTitleStyle: { fontWeight: "700", fontSize: 20 },
        }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={({ route }: { route: any }) => ({
          headerTitle: route.params?.title || "Chat",
        })}
      />
      <Stack.Screen
        name="VoiceChat"
        component={VoiceChatScreen}
        options={{
          headerTitle: "Voice Chat",
          headerTransparent: true,
          headerTintColor: "#ffffff",
          presentation: "fullScreenModal",
        }}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <SplashScreen onFinish={() => setShowSplash(false)} />
      </>
    );
  }

  return (
    <NavigationContainer theme={DarkTheme}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: tabStyles.tabBar,
          tabBarActiveTintColor: "#a855f7",
          tabBarInactiveTintColor: "#555555",
          tabBarLabelStyle: tabStyles.tabLabel,
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeStack}
          options={{
            tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Buy"
          component={BuyGlitchScreen}
          options={{
            headerShown: true,
            headerTitle: "Buy $GLITCH",
            headerStyle: { backgroundColor: "#000000" },
            headerTintColor: "#ffffff",
            headerTitleStyle: { fontWeight: "700", fontSize: 18 },
            headerShadowVisible: false,
            tabBarIcon: ({ focused }) => <TabIcon emoji="💰" focused={focused} />,
            tabBarLabel: "Buy",
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const tabStyles = StyleSheet.create({
  tabBar: {
    backgroundColor: "#0a0a0a",
    borderTopColor: "#1a1a1a",
    borderTopWidth: 1,
    height: Platform.OS === "ios" ? 88 : 65,
    paddingTop: 6,
    paddingBottom: Platform.OS === "ios" ? 28 : 8,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
  },
  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 28,
    borderRadius: 14,
  },
  iconWrapActive: {
    backgroundColor: "rgba(124, 58, 237, 0.15)",
  },
  icon: {
    fontSize: 20,
  },
  iconActive: {
    fontSize: 22,
  },
});
