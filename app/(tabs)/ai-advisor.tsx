import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button,
  Chip,
  colors,
  HeaderAction,
  HIT,
  PressableScale,
  radius,
  ScreenHeader,
  Segmented,
  shadow,
  space,
  type,
} from "../../components/ui/kit";
import { getLoans } from "../../utils/storage";
import { getTransactions } from "../../utils/transactions";

const USAGE_KEY = "@ai_usage_limit";

const MODELS = [
  {
    id: "gemini-3.1-flash-lite-preview",
    name: "3.1 Flash Lite",
    desc: "Preview • 500 RPD • 15 RPM",
    rpm: 15,
    rpd: 500,
  },
  {
    id: "gemini-3-flash-preview",
    name: "3.0 Flash",
    desc: "Active • 20 RPD • 5 RPM",
    rpm: 5,
    rpd: 20,
  },
  {
    id: "gemini-2.5-flash",
    name: "2.5 Flash",
    desc: "Recommended • 1500 RPD",
    rpm: 15,
    rpd: 1500,
  },
  {
    id: "gemini-2.5-flash-lite",
    name: "2.5 Flash Lite",
    desc: "Ultra Fast • 1500 RPD",
    rpm: 30,
    rpd: 1500,
  },
  {
    id: "gemini-2.5-pro",
    name: "2.5 Pro",
    desc: "Deep Reasoning • 50 RPD",
    rpm: 2,
    rpd: 50,
  },
];

const LOAN_SUGGESTIONS = [
  "Which loan costs me the most interest?",
  "Should I prepay any loan?",
  "When will I be debt-free?",
  "How to reduce my EMI burden?",
];

const SPEND_SUGGESTIONS = [
  "How much did I spend this month?",
  "What is my 3-month spending breakdown?",
  "What is my highest spending category?",
  "Give me a budget and spending health checkup",
];

type ChatMessage = { role: string; text: string; isError?: boolean };

const WELCOME_MESSAGE: ChatMessage = {
  role: "assistant",
  text: "Hi! I'm your **AI Financial Advisor**. I can help you analyze your **Loans** or your **Spends**.\n\nPick a topic above, then ask a question or tap a suggestion below.",
};

// The "Gemini API Key" phrase is used to find and remove this notice once a key exists.
const API_KEY_NOTICE: ChatMessage = {
  role: "assistant",
  text: "**Add your Gemini API Key to start.** Head to **Settings** and paste your key. \n\nThis keeps your personal AI powered and secure!",
  isError: true,
};

const isApiKeyNotice = (m: ChatMessage) =>
  !!m.isError && m.text.includes("Gemini API Key");

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fetchWithRetry = async (
  url: string,
  options: any,
  retries = 3,
  backoff = 1000,
): Promise<{ res: Response; data: any }> => {
  try {
    const res = await fetch(url, options);
    const data = await res.json();
    if (
      (res.status === 429 ||
        res.status === 503 ||
        data?.error?.message?.includes("high demand")) &&
      retries > 0
    ) {
      await new Promise((r) => setTimeout(r, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    return { res, data };
  } catch (err) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw err;
  }
};

const buildLoansPrompt = (loans: any[]) => {
  const today = new Date();

  if (!loans || loans.length === 0) {
    return `You are a professional Indian Financial Advisor specializing in Loan Optimization. Help users understand their loans, minimize interest payments, plan prepayments, and reach debt freedom.
Today: ${today.toDateString()}

USER ACTIVE LOAN PORTFOLIO:
No active loans currently found in the user's portfolio database.

INSTRUCTIONS:
- Inform the user that no active loans were found in their portfolio.
- Guide them to add their loans in the "Loans" tab.
- Keep your response short and concise.`;
  }

  const activeLoans = loans.filter((l) => {
    if (!l) return false;
    const status = String(l.status || "active").toLowerCase();
    if (status === "closed" || status === "paid" || status === "completed")
      return false;
    return true;
  });

  const loansToUse = activeLoans.length > 0 ? activeLoans : loans;

  const context = loansToUse
    .map((l, i) => {
      const name = l.loanName || l.loanname || l.loan_name || `Loan #${i + 1}`;
      const principal = parseFloat(l.principal || 0);
      const interest = parseFloat(l.interest || 0);
      const emi = parseFloat(l.emiAmount || l.emiamount || l.emi_amount || 0);
      const tenure = parseInt(l.tenure || 0);
      const type = l.loanType || l.loantype || l.loan_type || "emi";
      const startDate = l.startDate || l.startdate || l.start_date || "N/A";
      const status = l.status || "active";

      return `- ${name}: Principal ₹${principal.toLocaleString("en-IN")}, Interest ${interest}%, Monthly EMI ₹${emi.toLocaleString("en-IN")}, Tenure ${tenure} months, Type: ${type}, Started: ${startDate}, Status: ${status}`;
    })
    .join("\n");

  return `You are a professional Indian Financial Advisor specializing in Loan Optimization. Help users understand their loans, minimize interest payments, plan prepayments, and reach debt freedom.
Today: ${today.toDateString()}

USER ACTIVE LOAN PORTFOLIO (${loansToUse.length} active loans):
${context}

INSTRUCTIONS:
- ONLY calculate and advise based on the ACTIVE loans listed above.
- Provide clear, actionable advice on prepayment strategies, interest reduction, and debt payoff priority.
- Use Markdown for responses (# for headers, **bold** for emphasis, - for lists).
- Use Indian currency format (₹).
- Keep your response clear, concise, and structured.`;
};

const buildSpendsPrompt = (transactions: any[]) => {
  const today = new Date();
  if (!transactions || transactions.length === 0) {
    return `You are a professional Expense Analyst & Budget Advisor. Analyze the user's spending data.
Today: ${today.toDateString()}

USER TRANSACTION DATA:
No spending/transaction history available.

INSTRUCTIONS:
- Guide the user on how to add transaction data manually or configure automated SMS imports in settings.
- Use Markdown for responses. Keep response short and concise.`;
  }

  const getStatsForRange = (monthsAgoStart: number, monthsAgoEnd?: number) => {
    const startDate = new Date(
      today.getFullYear(),
      today.getMonth() - monthsAgoStart,
      1,
    );
    const endDate =
      monthsAgoEnd !== undefined
        ? new Date(
            today.getFullYear(),
            today.getMonth() - monthsAgoEnd,
            0,
            23,
            59,
            59,
          )
        : new Date();

    const filtered = transactions.filter((t) => {
      const d = new Date(t.date);
      return d >= startDate && d <= endDate;
    });

    let inflow = 0;
    let outflow = 0;
    let upiOutflow = 0;
    let cardOutflow = 0;
    const categories: { [key: string]: number } = {};

    filtered.forEach((t) => {
      const amt = parseFloat(t.amount || 0);
      if (t.type === "credit") {
        inflow += amt;
      } else {
        if (t.category !== "Credit Card Bill" && t.calculate_budget !== false) {
          outflow += amt;
          const mode = t.mode || "UPI";
          if (mode === "Credit Card") {
            cardOutflow += amt;
          } else {
            upiOutflow += amt;
          }
          categories[t.category] = (categories[t.category] || 0) + amt;
        }
      }
    });

    return { inflow, outflow, upiOutflow, cardOutflow, categories };
  };

  const thisMonthStats = getStatsForRange(0);
  const lastMonthStats = getStatsForRange(1, 1);
  const last3MonthsStats = getStatsForRange(3);
  const last6MonthsStats = getStatsForRange(6);

  const formatStats = (title: string, stats: any) => {
    const catBreakdown = Object.entries(stats.categories)
      .map(([cat, amt]: any) => `  - ${cat}: ₹${amt.toLocaleString("en-IN")}`)
      .join("\n");
    return `### ${title}:
- Total Inflow (Credit): ₹${stats.inflow.toLocaleString("en-IN")}
- Total Outflow (Debit): ₹${stats.outflow.toLocaleString("en-IN")}
- Outflow by Payment Method:
  - UPI Spends: ₹${stats.upiOutflow.toLocaleString("en-IN")}
  - Credit Card Spends: ₹${stats.cardOutflow.toLocaleString("en-IN")}
- Category Breakdown:
${catBreakdown || "  - No debit categories recorded."}`;
  };

  const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, 1);
  const recentTxs = transactions
    .filter((t) => new Date(t.date) >= sixMonthsAgo)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 100);

  const txList = recentTxs
    .map(
      (t) =>
        `- ${new Date(t.date).toISOString().split("T")[0]}: ${t.type.toUpperCase()} of ₹${parseFloat(t.amount).toLocaleString("en-IN")} in "${t.category}" (${t.description || "No description"}) [Mode: ${t.mode || "UPI"}]`,
    )
    .join("\n");

  return `You are a professional Expense Analyst & Budget Advisor specializing in Personal Expense Analysis. Help users track budgets, recognize outflow trends (including splitting by Credit Card vs UPI spends), cut unnecessary spending, and manage their cash flow.
Today: ${today.toDateString()}

USER SPENDING & INCOME SUMMARY:
${formatStats("This Month (Current)", thisMonthStats)}

${formatStats("Last Month", lastMonthStats)}

${formatStats("Last 3 Months (Cumulative)", last3MonthsStats)}

${formatStats("Last 6 Months (Cumulative)", last6MonthsStats)}

RECENT TRANSACTION LEDGER (Last 6 Months, up to 100 items):
${txList}

INSTRUCTIONS:
- ONLY analyze and calculate based on the TRANSACTION summaries and list provided above.
- Find averages, maximum amounts, payment method breakdowns (UPI vs Credit Card), and category breakdowns directly using this data.
- Use Markdown for responses (# for headers, **bold** for emphasis, - for lists).
- Use Indian currency format (₹).
- Keep your response short and concise. Do not explain much until asked by the user.`;
};

export default function AIAdvisor() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, () =>
      setKeyboardVisible(true),
    );
    const hideSubscription = Keyboard.addListener(hideEvent, () =>
      setKeyboardVisible(false),
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [contextType, setContextType] = useState<"loans" | "spends">("loans");
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loans, setLoans] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [lastUserQuery, setLastUserQuery] = useState("");
  const [usage, setUsage] = useState({ count: 0, date: "" });
  const [activeKey, setActiveKey] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleCopy = (text: string, idx: number) => {
    if (!text) return;
    Clipboard.setString(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  useFocusEffect(
    useCallback(() => {
      const init = async () => {
        const userKey = await AsyncStorage.getItem("@user_gemini_api_key");
        const envKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
        const effectiveKey = (userKey || envKey || "").trim();

        if (effectiveKey) {
          setActiveKey(effectiveKey);
          setMessages((prev) => prev.filter((m) => !isApiKeyNotice(m)));
        } else {
          setActiveKey("");
          setMessages((prev) => {
            if (prev.some(isApiKeyNotice)) return prev;
            return [...prev, API_KEY_NOTICE];
          });
        }
      };
      init();
      loadLoans();
      loadTransactions();
      loadUsage();
    }, []),
  );

  const loadLoans = async () => {
    try {
      const data = await getLoans();
      setLoans(data || []);
    } catch {}
  };
  const loadTransactions = async () => {
    try {
      const data = await getTransactions();
      setTransactions(data || []);
    } catch {}
  };

  const loadUsage = async () => {
    try {
      const stored = await AsyncStorage.getItem(USAGE_KEY);
      const today = new Date().toDateString();
      if (stored) {
        const data = JSON.parse(stored);
        if (data.date === today) {
          setUsage(data);
          return;
        }
      }
      const fresh = { count: 0, date: today };
      setUsage(fresh);
      await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(fresh));
    } catch {}
  };

  const incrementUsage = async () => {
    const fresh = { count: usage.count + 1, date: new Date().toDateString() };
    setUsage(fresh);
    await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(fresh));
  };

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, loading]);

  const currentModel = MODELS.find((m) => m.id === selectedModel) || MODELS[0];

  const showLimits = () => {
    const remaining = currentModel.rpd - usage.count;
    Alert.alert(
      "AI usage today",
      `Model: ${currentModel.name}\nUsed: ${usage.count}\nRemaining: ${Math.max(0, remaining)}\nDaily Limit: ${currentModel.rpd}\n\nLimit resets at midnight.`,
      [{ text: "Got it" }],
    );
  };

  const clearChat = () => {
    Alert.alert("Start a new chat?", "This clears the current conversation.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear chat",
        style: "destructive",
        onPress: () => {
          setMessages(
            activeKey ? [WELCOME_MESSAGE] : [WELCOME_MESSAGE, API_KEY_NOTICE],
          );
          setLastUserQuery("");
          setInput("");
        },
      },
    ]);
  };

  const sendMessage = async (text?: string, isRetry = false) => {
    const userText = (text || input).trim();
    if (!userText || loading) return;

    if (usage.count >= currentModel.rpd) {
      Alert.alert(
        "Quota Exceeded",
        "You have reached your daily limit for this AI model. Please try again tomorrow.",
      );
      return;
    }

    if (!isRetry) setLastUserQuery(userText);
    setInput("");

    let currentMessages = [...messages];
    if (isRetry && currentMessages[currentMessages.length - 1].isError) {
      currentMessages.pop();
    }

    const newMessages = isRetry
      ? currentMessages
      : [...currentMessages, { role: "user", text: userText }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const storedKey = await AsyncStorage.getItem("@user_gemini_api_key");
      const envKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
      const keyToUse = (activeKey || storedKey || envKey || "").trim();

      if (!keyToUse) {
        Alert.alert(
          "Settings Required",
          "Please add your Gemini API Key in the Settings page first.",
        );
        setLoading(false);
        return;
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${keyToUse}`;
      const history = newMessages
        .filter((m, i) => !(i === 0 && m.role === "assistant"))
        .slice(-8);

      const latestLoans = await getLoans().catch(() => loans);
      const latestTransactions = await getTransactions().catch(
        () => transactions,
      );

      const prompt =
        contextType === "loans"
          ? buildLoansPrompt(
              latestLoans && latestLoans.length > 0 ? latestLoans : loans,
            )
          : buildSpendsPrompt(
              latestTransactions && latestTransactions.length > 0
                ? latestTransactions
                : transactions,
            );

      const { res, data } = await fetchWithRetry(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: prompt }] },
          contents: history.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.text }],
          })),
        }),
      });

      if (!res.ok) {
        let rawMsg = data?.error?.message || `Error ${res.status}`;
        const highDemandRegex = /high demand|capacity|overloaded/i;
        const retryRegex = /retry in (\d+s)/i;

        if (highDemandRegex.test(rawMsg)) {
          const match = rawMsg.match(retryRegex);
          rawMsg = `AI is currently very busy. Please try again in ${match ? match[1] : "a few seconds"}.`;
        }
        throw new Error(rawMsg);
      }

      await incrementUsage();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const aiResponse =
        parts.find((p: any) => p.text)?.text ||
        "I couldn't generate a response.";
      setMessages((prev) => [...prev, { role: "assistant", text: aiResponse }]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: err.message, isError: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions =
    contextType === "loans" ? LOAN_SUGGESTIONS : SPEND_SUGGESTIONS;
  const hasConversation = messages.some((m) => m.role === "user");
  const canSend = input.trim().length > 0 && !loading;
  const remaining = Math.max(0, currentModel.rpd - usage.count);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
        keyboardVerticalOffset={0}
      >
        {/* Fixed top: header, topic switcher, model picker */}
        <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
          <View style={styles.column}>
            <ScreenHeader
              back
              title="AI Advisor"
              subtitle="Answers use your loans and spends"
              actions={
                <>
                  <HeaderAction
                    icon="stats-chart-outline"
                    label="Usage today"
                    onPress={showLimits}
                  />
                  {hasConversation && !loading ? (
                    <HeaderAction
                      icon="create-outline"
                      label="New chat"
                      onPress={clearChat}
                    />
                  ) : null}
                </>
              }
            />
            <Segmented
              options={[
                { key: "loans", label: "Loans" },
                { key: "spends", label: "Spends" },
              ]}
              value={contextType}
              onChange={setContextType}
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.modelScroll}
            contentContainerStyle={styles.modelRow}
          >
            {MODELS.map((m) => (
              <Chip
                key={m.id}
                label={m.name}
                selected={selectedModel === m.id}
                onPress={() => setSelectedModel(m.id)}
              />
            ))}
          </ScrollView>
          <View style={styles.column}>
            <PressableScale
              onPress={showLimits}
              style={styles.usageRow}
              accessibilityLabel={`${usage.count} of ${currentModel.rpd} questions used today on ${currentModel.name}. ${remaining} left.`}
              accessibilityHint="Shows today's usage limits"
            >
              <Ionicons
                name="pulse-outline"
                size={14}
                color={colors.textSecondary}
              />
              <Text style={styles.usageText} numberOfLines={1}>
                {usage.count} of {currentModel.rpd} used today
                <Text style={styles.usageMuted}>{`  ·  ${currentModel.desc}`}</Text>
              </Text>
            </PressableScale>
          </View>
        </View>

        {/* Conversation */}
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[styles.column, styles.chatContent]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {messages.map((msg, idx) => {
            const isUser = msg.role === "user";
            const isNotice = isApiKeyNotice(msg);
            const copied = copiedIdx === idx;
            return (
              <View
                key={idx}
                style={[styles.message, isUser ? styles.messageUser : null]}
              >
                {isUser ? (
                  <View style={styles.userBubble}>
                    <Text selectable style={styles.userText}>
                      {msg.text}
                    </Text>
                  </View>
                ) : (
                  <View
                    style={[
                      styles.aiBubble,
                      msg.isError &&
                        (isNotice ? styles.aiBubbleNotice : styles.aiBubbleError),
                    ]}
                  >
                    <View style={styles.aiLabelRow}>
                      <Ionicons
                        name={
                          isNotice
                            ? "key-outline"
                            : msg.isError
                              ? "alert-circle-outline"
                              : "sparkles"
                        }
                        size={14}
                        color={
                          isNotice
                            ? colors.warning
                            : msg.isError
                              ? colors.danger
                              : colors.primary
                        }
                      />
                      <Text
                        style={[
                          styles.aiLabel,
                          msg.isError && {
                            color: isNotice ? colors.warning : colors.danger,
                          },
                        ]}
                      >
                        {isNotice
                          ? "Setup needed"
                          : msg.isError
                            ? "Couldn't get an answer"
                            : "Advisor"}
                      </Text>
                    </View>
                    <Markdown style={markdownStyles}>{msg.text || ""}</Markdown>
                  </View>
                )}

                <View
                  style={[styles.messageActions, isUser && styles.messageActionsUser]}
                >
                  {isNotice ? (
                    <Button
                      label="Open settings"
                      icon="settings-outline"
                      variant="secondary"
                      onPress={() => router.push("/settings" as any)}
                      style={styles.inlineButton}
                    />
                  ) : msg.isError && lastUserQuery ? (
                    <Button
                      label="Retry question"
                      icon="refresh"
                      variant="secondary"
                      onPress={() => sendMessage(lastUserQuery, true)}
                      disabled={loading}
                      style={styles.inlineButton}
                    />
                  ) : null}
                  {!isNotice ? (
                    <PressableScale
                      onPress={() => handleCopy(msg.text, idx)}
                      style={styles.copyBtn}
                      hitSlop={8}
                      haptic={false}
                      accessibilityLabel={copied ? "Copied" : "Copy message"}
                    >
                      <Ionicons
                        name={copied ? "checkmark" : "copy-outline"}
                        size={14}
                        color={copied ? colors.primary : colors.textSecondary}
                      />
                      <Text
                        style={[styles.copyText, copied && { color: colors.primary }]}
                      >
                        {copied ? "Copied" : "Copy"}
                      </Text>
                    </PressableScale>
                  ) : null}
                </View>
              </View>
            );
          })}

          {loading ? (
            <View
              style={[styles.aiBubble, styles.thinking]}
              accessibilityLiveRegion="polite"
              accessibilityLabel="Advisor is thinking"
            >
              <ActivityIndicator size="small" color={colors.primaryFill} />
              <Text style={styles.thinkingText}>Thinking…</Text>
            </View>
          ) : null}

          {messages.length < 3 && !loading ? (
            <View style={styles.suggestions}>
              <Text style={styles.suggestTitle}>Try asking</Text>
              <View style={styles.suggestWrap}>
                {suggestions.map((s) => (
                  <Chip key={s} label={s} onPress={() => sendMessage(s)} />
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>

        {/* Composer */}
        <View
          style={[
            styles.composer,
            {
              paddingBottom:
                Platform.OS === "ios"
                  ? keyboardVisible
                    ? space.md
                    : insets.bottom + 65
                  : space.md,
            },
          ]}
        >
          <View style={[styles.column, styles.composerRow]}>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                placeholder={
                  contextType === "loans"
                    ? "Ask about your loans…"
                    : "Ask about your spends or budget…"
                }
                placeholderTextColor={colors.textMuted}
                value={input}
                onChangeText={setInput}
                multiline
                accessibilityLabel="Message"
              />
            </View>
            <PressableScale
              onPress={() => sendMessage()}
              disabled={!canSend}
              style={[styles.sendBtn, !canSend && styles.sendBtnIdle]}
              accessibilityLabel="Send message"
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : (
                <Ionicons
                  name="arrow-up"
                  size={22}
                  color={canSend ? colors.textOnAccent : colors.textMuted}
                />
              )}
            </PressableScale>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const markdownStyles: any = {
  body: { ...type.body, fontWeight: "400", lineHeight: 22, color: colors.text },
  paragraph: { marginTop: 0, marginBottom: space.sm },
  heading1: {
    ...type.headline,
    fontSize: 18,
    color: colors.text,
    marginTop: space.xs,
    marginBottom: space.sm,
  },
  heading2: {
    ...type.headline,
    color: colors.text,
    marginTop: space.xs,
    marginBottom: space.sm,
  },
  heading3: {
    ...type.body,
    fontWeight: "700",
    color: colors.text,
    marginTop: space.xs,
    marginBottom: space.xs,
  },
  strong: { fontWeight: "700", color: colors.text },
  em: { fontStyle: "italic" },
  link: { color: colors.indigo },
  bullet_list_icon: { color: colors.primary, fontWeight: "800" },
  ordered_list_icon: { color: colors.primary, fontWeight: "700" },
  list_item: { marginBottom: space.xs },
  code_inline: {
    backgroundColor: colors.surfaceSunken,
    color: colors.text,
    borderRadius: 6,
    paddingHorizontal: 4,
  },
  code_block: {
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: space.md,
  },
  fence: {
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: space.md,
  },
  blockquote: {
    backgroundColor: colors.surfaceMuted,
    borderLeftColor: colors.primaryFill,
    borderLeftWidth: 3,
    paddingHorizontal: space.md,
  },
  hr: { backgroundColor: colors.borderStrong, height: StyleSheet.hairlineWidth },
  table: { borderColor: colors.borderStrong, borderRadius: radius.sm },
  th: { padding: space.sm, fontWeight: "700" },
  td: { padding: space.sm },
  tr: { borderColor: colors.borderStrong },
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  column: {
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    paddingHorizontal: space.lg,
  },
  top: {
    paddingBottom: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
  },
  modelScroll: {
    flexGrow: 0,
    marginTop: space.md,
  },
  modelRow: {
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  usageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs + 2,
    minHeight: HIT,
    alignSelf: "flex-start",
  },
  usageText: {
    ...type.caption,
    fontWeight: "600",
    color: colors.textSecondary,
    fontVariant: ["tabular-nums"],
    flexShrink: 1,
  },
  usageMuted: {
    fontWeight: "500",
  },
  chatContent: {
    paddingTop: space.lg,
    paddingBottom: space.xl,
    gap: space.lg,
  },
  message: {
    alignItems: "flex-start",
    gap: space.xs,
  },
  messageUser: {
    alignItems: "flex-end",
  },
  userBubble: {
    maxWidth: "85%",
    backgroundColor: colors.text,
    borderRadius: radius.lg,
    borderBottomRightRadius: space.xs + 2,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  userText: {
    ...type.body,
    fontWeight: "500",
    lineHeight: 22,
    color: colors.textOnAccent,
  },
  aiBubble: {
    maxWidth: "94%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderBottomLeftRadius: space.xs + 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xs,
    ...shadow.card,
  },
  aiBubbleError: {
    borderColor: colors.dangerFill,
  },
  aiBubbleNotice: {
    borderColor: colors.warningFill,
  },
  aiLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs + 2,
    marginBottom: space.xs + 2,
  },
  aiLabel: {
    ...type.caption,
    color: colors.primary,
  },
  messageActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    flexWrap: "wrap",
  },
  messageActionsUser: {
    justifyContent: "flex-end",
  },
  inlineButton: {
    minHeight: HIT,
    paddingHorizontal: space.lg,
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    minHeight: 28,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
  },
  copyText: {
    ...type.caption,
    color: colors.textSecondary,
  },
  thinking: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.md,
  },
  thinkingText: {
    ...type.label,
    fontWeight: "500",
    color: colors.textMuted,
  },
  suggestions: {
    marginTop: space.sm,
    gap: space.md,
  },
  suggestTitle: {
    ...type.overline,
    color: colors.textSecondary,
  },
  suggestWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
  composer: {
    paddingTop: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
  },
  inputWrap: {
    flex: 1,
    minHeight: HIT,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: space.md + 2,
    justifyContent: "center",
  },
  input: {
    ...type.body,
    color: colors.text,
    maxHeight: 120,
    paddingTop: 11,
    paddingBottom: 11,
  },
  sendBtn: {
    width: HIT,
    height: HIT,
    borderRadius: HIT / 2,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnIdle: {
    backgroundColor: colors.surfaceSunken,
  },
});
