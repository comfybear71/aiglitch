import React from "react";
import { Text, StatusBar } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import HomeScreen from "./src/screens/HomeScreen";
import ChatScreen from "./src/screens/ChatScreen";
import BriefingScreen from "./src/screens/BriefingScreen";
import WalletScreen from "./src/screens/WalletScreen";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

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

function TabIcon({ emoji }: { emoji: string }) {
  return <Text style={{ fontSize: 22 }}>{emoji}</Text>;
}

function HomeTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#000000",
          borderTopColor: "rgba(124, 58, 237, 0.2)",
          borderTopWidth: 1,
          height: 85,
          paddingBottom: 30,
          paddingTop: 8,
        },
        tabBarActiveTintColor: "#a855f7",
        tabBarInactiveTintColor: "#555555",
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: "Home",
          tabBarIcon: () => <TabIcon emoji="🏠" />,
        }}
      />
      <Tab.Screen
        name="Briefing"
        component={BriefingScreen}
        options={{
          tabBarLabel: "Briefing",
          tabBarIcon: () => <TabIcon emoji="📰" />,
        }}
      />
      <Tab.Screen
        name="Wallet"
        component={WalletScreen}
        options={{
          tabBarLabel: "Wallet",
          tabBarIcon: () => <TabIcon emoji="💰" />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer theme={DarkTheme}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: "#000000" },
          headerTintColor: "#ffffff",
          headerTitleStyle: { fontWeight: "600", fontSize: 16 },
          headerBackTitle: "Back",
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen
          name="Tabs"
          component={HomeTabs}
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
