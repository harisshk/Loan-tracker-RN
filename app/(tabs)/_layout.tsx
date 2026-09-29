import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform, StyleSheet } from "react-native";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#38bdf8", // Neon Sky active
        tabBarInactiveTintColor: "#64748b", // Slate gray inactive
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarIconStyle: styles.tabBarIcon,
        tabBarStyle: styles.tabBar,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Loans",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "wallet" : "wallet-outline"}
              size={20}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="spend-tracker"
        options={{
          title: "Spends",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "card" : "card-outline"}
              size={20}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: "EMI",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "analytics" : "analytics-outline"}
              size={20}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "calendar" : "calendar-outline"}
              size={20}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "More",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "grid" : "grid-outline"}
              size={20}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="ai-advisor"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: Platform.OS === "android" ? 74 : 64,
    backgroundColor: "#090d16", // Dark glassmorphic background matching 2026 theme
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    paddingBottom: Platform.OS === "android" ? 18 : 8,
    paddingTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 12,
  },
  tabBarLabel: {
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
    letterSpacing: 0.2,
  },
  tabBarIcon: {
    marginBottom: -2,
  },
});
