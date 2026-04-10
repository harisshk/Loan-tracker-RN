import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLoans } from '../utils/storage';
import Config from '../utils/Config';

const USAGE_KEY = '@ai_usage_limit';

const MODELS = [
  { id: 'gemini-3.1-flash-lite-preview', name: '3.1 Flash Lite', desc: 'Default • 500 RPD • 15 RPM', rpm: 15, rpd: 500 },
  { id: 'gemini-3-flash-preview', name: '3.0 Flash', desc: 'Active • 20 RPD • 5 RPM', rpm: 5, rpd: 20 },
  { id: 'gemini-2.5-flash-lite-preview', name: '2.5 Flash Lite', desc: 'Active • 20 RPD • 10 RPM', rpm: 10, rpd: 20 },
  { id: 'gemini-2.5-flash-preview', name: '2.5 Flash', desc: 'Active • 20 RPD • 5 RPM', rpm: 5, rpd: 20 }
];

const SUGGESTIONS = [
  '💰 Which loan costs me the most interest?',
  '📊 Should I prepay any loan?',
  '🗓️ When will I be debt-free?',
  '📈 How to reduce my EMI burden?',
  '📝 Give me a financial health checkup',
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fetchWithRetry = async (url, options, retries = 3, backoff = 1000) => {
  try {
    const res = await fetch(url, options);
    const data = await res.json();
    if ((res.status === 429 || res.status === 503 || data?.error?.message?.includes('high demand')) && retries > 0) {
      await new Promise(r => setTimeout(r, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    return { res, data };
  } catch (err) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw err;
  }
};

const buildSystemPrompt = (loans) => {
  const today = new Date();
  
  // Filter for ONLY active loans
  const activeLoans = loans.filter(l => {
    if (l.status === 'closed') return false;
    
    // Check if tenure has already expired based on start date
    if (l.startDate && l.tenure) {
      const start = new Date(l.startDate);
      const monthsDiff = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
      if (monthsDiff >= parseInt(l.tenure)) return false;
    }
    return true;
  });

  const context = activeLoans.map(l => 
    `- ${l.loanName}: ₹${parseFloat(l.principal || 0).toLocaleString('en-IN')} @ ${l.interest}% interest. EMI: ₹${parseFloat(l.emiAmount || 0).toLocaleString('en-IN')}. Tenure: ${l.tenure} months. Started: ${l.startDate}`
  ).join('\n');

  return `You are a professional Indian Financial Advisor. Help users understand their loans and optimize their finances.
Today: ${today.toDateString()}

USER ACTIVE LOAN PORTFOLIO (Only current debts):
${context || 'No active loans currently.'}

INSTRUCTIONS:
- ONLY calculate based on the ACTIVE loans listed above.
- Ignore any mention of past/finished car or property loans if they aren't in the list above.
- Use Markdown for responses (# for headers, **bold** for emphasis, - for lists).
- Use Indian currency format (₹).
- Keep your response short and concise. Do not explain much until asked by the user.`;
};

export default function AIAdvisor() {
  const router = useRouter();
  const scrollRef = useRef(null);
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "👋 Hi! I'm your **AI Financial Advisor**. I've analyzed your loans and I'm ready to help you save money!\n\nWhat would you like to know?" },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loans, setLoans] = useState([]);
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [lastUserQuery, setLastUserQuery] = useState('');
  const [usage, setUsage] = useState({ count: 0, date: '' });

  const [activeKey, setActiveKey] = useState('');

  useEffect(() => { 
    const init = async () => {
      const userKey = await AsyncStorage.getItem('@user_gemini_api_key');
      if (userKey) {
        setActiveKey(userKey);
      } else {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          text: "👋 **Welcome!** To start chatting, please head to **Settings** and add your Gemini API Key. \n\nThis keeps your personal AI powered and secure!",
          isError: true 
        }]);
      }
    };
    init();
    loadLoans(); 
    loadUsage();
  }, []);

  const loadLoans = async () => { try { const data = await getLoans(); setLoans(data || []); } catch (e) {} };
  
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
    } catch (e) {}
  };

  const incrementUsage = async () => {
    const fresh = { count: usage.count + 1, date: new Date().toDateString() };
    setUsage(fresh);
    await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(fresh));
  };

  useEffect(() => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100); }, [messages, loading]);

  const showLimits = () => {
    const currentModel = MODELS.find(m => m.id === selectedModel) || MODELS[0];
    const remaining = currentModel.rpd - usage.count;
    Alert.alert(
      '📊 AI Usage Today',
      `Model: ${currentModel.name}\nUsed: ${usage.count}\nRemaining: ${Math.max(0, remaining)}\nDaily Limit: ${currentModel.rpd}\n\nLimit resets at midnight.`,
      [{ text: 'Got it' }, { text: 'Switch Model', onPress: () => {} }]
    );
  };

  const sendMessage = async (text, isRetry = false) => {
    const userText = (text || input).trim();
    if (!userText || loading) return;

    const currentModel = MODELS.find(m => m.id === selectedModel) || MODELS[0];
    if (usage.count >= currentModel.rpd) {
      Alert.alert('Quota Exceeded', 'You have reached your 20 daily messages for this AI model. Please try again tomorrow.');
      return;
    }

    if (!isRetry) setLastUserQuery(userText);
    setInput('');
    
    let currentMessages = [...messages];
    if (isRetry && currentMessages[currentMessages.length - 1].isError) {
      currentMessages.pop();
    }
    
    const newMessages = isRetry ? currentMessages : [...currentMessages, { role: 'user', text: userText }];
    setMessages(newMessages);
    setLoading(true);

    try {
      if (!activeKey) {
      Alert.alert('Settings Required', 'Please add your Gemini API Key in the Settings page first.');
      return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${activeKey}`;
      const history = newMessages.filter((m, i) => !(i === 0 && m.role === 'assistant')).slice(-8);

      const { res, data } = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: buildSystemPrompt(loans) }] },
          contents: history.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.text }]
          })),
        }),
      });

      if (!res.ok) {
        let rawMsg = data?.error?.message || `Error ${res.status}`;
        const highDemandRegex = /high demand|capacity|overloaded/i;
        const retryRegex = /retry in (\d+s)/i;
        
        if (highDemandRegex.test(rawMsg)) {
          const match = rawMsg.match(retryRegex);
          rawMsg = `🚀 AI is currently very busy (High Demand). Please try again in ${match ? match[1] : 'a few seconds'}.`;
        }
        throw new Error(rawMsg);
      }

      await incrementUsage();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const aiResponse = parts.find(p => p.text)?.text || "I couldn't generate a response.";
      setMessages(prev => [...prev, { role: 'assistant', text: aiResponse }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: `⚠️ ${err.message}`, isError: true }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#0f172a', '#1e293b', '#0f2d20']} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} style={styles.flex} keyboardVerticalOffset={40}>
        <BlurView intensity={20} tint="dark" style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerAction}><Text style={styles.backBtnText}>← Back</Text></TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerTitle}>🤖 AI Advisor</Text>
            {(() => {
              const currentModel = MODELS.find(m => m.id === selectedModel) || MODELS[0];
              return (
                <Text style={styles.quotaText}>
                  {usage.count} / {currentModel.rpd} <Text style={{ fontSize: 10, opacity: 0.6 }}>RPD</Text>
                </Text>
              );
            })()}
          </View>
          <TouchableOpacity onPress={showLimits} style={styles.headerAction}>
            <Ionicons name="stats-chart" size={18} color="#10b981" />
          </TouchableOpacity>
        </BlurView>

        <View style={styles.modelBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modelScroll}>
            {MODELS.map(m => (
              <TouchableOpacity key={m.id} onPress={() => setSelectedModel(m.id)} style={[styles.modelChip, selectedModel === m.id && styles.modelChipActive]}>
                <Text style={[styles.modelChipText, selectedModel === m.id && styles.modelChipTextActive]}>{m.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <ScrollView ref={scrollRef} style={styles.chatArea} contentContainerStyle={styles.chatContent} keyboardShouldPersistTaps="handled">
          {messages.map((msg, idx) => (
            <View key={idx} style={{ gap: 8 }}>
              <View style={[styles.bubble, msg.role === 'user' ? styles.userBubble : styles.aiBubble]}>
                {msg.role === 'assistant' && <Text style={styles.aiLabel}>{msg.isError ? 'ERROR' : 'ADVISOR'}</Text>}
                {msg.role === 'user' ? (
                  <Text style={{ color: '#fff', fontSize: 16 }}>{msg.text}</Text>
                ) : (
                  <Markdown style={markdownStyles}>{msg.text || ""}</Markdown>
                )}
              </View>
              {msg.isError && (
                <TouchableOpacity style={styles.retryBtn} onPress={() => sendMessage(lastUserQuery, true)}>
                  <Text style={styles.retryBtnText}>🔄 Retry question</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
          {loading && <ActivityIndicator color="#10b981" style={{ alignSelf: 'flex-start', margin: 20 }} />}
          
          {messages.length < 3 && !loading && (
            <View style={styles.suggestGrid}>
              {SUGGESTIONS.map((s, i) => (
                <TouchableOpacity key={i} style={styles.suggestChip} onPress={() => sendMessage(s)}><Text style={styles.suggestText}>{s}</Text></TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>

        <BlurView intensity={40} tint="dark" style={styles.inputBar}>
          <TextInput style={styles.input} placeholder="Ask about your loans..." placeholderTextColor="rgba(255,255,255,0.3)" value={input} onChangeText={setInput} multiline />
          <TouchableOpacity style={styles.sendBt} onPress={() => sendMessage()} disabled={loading}><Text style={styles.sendBtText}>↑</Text></TouchableOpacity>
        </BlurView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const markdownStyles = {
  body: { color: 'rgba(255,255,255,0.95)', fontSize: 15, lineHeight: 22 },
  heading1: { color: '#10b981', fontSize: 24, fontWeight: '800', marginVertical: 10 },
  heading2: { color: '#10b981', fontSize: 20, fontWeight: '700', marginVertical: 10 },
  strong: { fontWeight: '800', color: '#fff' },
  bullet_list_icon: { color: '#10b981' },
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingBottom: 15, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  headerAction: { width: 60, alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  quotaText: { fontSize: 11, fontWeight: '700', color: '#10b981', marginTop: 2, letterSpacing: 1 },
  backBtnText: { color: '#10b981', fontWeight: 'bold' },
  usageCounter: { backgroundColor: 'rgba(16,185,129,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  usageText: { color: '#10b981', fontWeight: '800', fontSize: 12 },
  modelBar: { backgroundColor: 'rgba(0,0,0,0.2)', paddingVertical: 12 },
  modelScroll: { paddingHorizontal: 15, gap: 10 },
  modelChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modelChipActive: { backgroundColor: '#10b981', borderColor: '#10b981' },
  modelChipText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 'bold' },
  modelChipTextActive: { color: '#fff' },
  chatArea: { flex: 1 },
  chatContent: { padding: 15, gap: 15 },
  bubble: { maxWidth: '88%', padding: 14, borderRadius: 18 },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.08)' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#10b981' },
  aiLabel: { fontSize: 10, fontWeight: 'bold', color: '#10b981', marginBottom: 4 },
  retryBtn: { alignSelf: 'flex-start', marginLeft: 10, backgroundColor: 'rgba(225, 29, 72, 0.15)', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(225, 29, 72, 0.3)' },
  retryBtnText: { color: '#fb7185', fontSize: 13, fontWeight: 'bold' },
  suggestGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
  suggestChip: { padding: 12, borderRadius: 15, backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)' },
  suggestText: { color: '#10b981', fontSize: 14, fontWeight: '500' },
  inputBar: { flexDirection: 'row', padding: 15, paddingBottom: Platform.OS === 'ios' ? 35 : 15, gap: 12, alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  input: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 22, paddingHorizontal: 18, paddingVertical: 12, color: '#fff', fontSize: 16, maxHeight: 120 },
  sendBt: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#10b981', justifyContent: 'center', alignItems: 'center' },
  sendBtText: { color: '#fff', fontSize: 24, fontWeight: 'bold' }
});
