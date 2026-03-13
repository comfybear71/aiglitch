import React from "react";
import { StatusBar } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import HomeScreen from "./src/screens/HomeScreen";
import ChatScreen from "./src/screens/ChatScreen";

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
          name="Home"
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
