import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { exportAllData, importAllData } from '../utils/storage';
import { syncToCloud, restoreFromCloud } from '../utils/sync';

const GITHUB_TOKEN_KEY = '@github_token';
const LAST_SYNC_KEY = '@last_sync';

export default function SyncScreen() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [lastSync, setLastSync] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const savedToken = await AsyncStorage.getItem(GITHUB_TOKEN_KEY);
    const savedSync = await AsyncStorage.getItem(LAST_SYNC_KEY);
    if (savedToken) setToken(savedToken);
    if (savedSync) setLastSync(savedSync);
  };

  const handleSaveToken = async () => {
    await AsyncStorage.setItem(GITHUB_TOKEN_KEY, token);
    Alert.alert('Success', 'GitHub Token saved locally.');
  };

  const handleSyncToCloud = async () => {
    if (!token) {
      Alert.alert('Error', 'Please enter a GitHub Personal Access Token first.');
      return;
    }

    setLoading(true);
    try {
      const data = await exportAllData();
      await syncToCloud(token, data);
      
      const now = new Date().toLocaleString();
      await AsyncStorage.setItem(LAST_SYNC_KEY, now);
      setLastSync(now);
      
      Alert.alert('Success', 'Data backed up to GitHub Gist successfully!');
    } catch (error) {
      Alert.alert('Sync Failed', error.message || 'Make sure your token is valid and has "gist" permissions.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreFromCloud = async () => {
    if (!token) {
      Alert.alert('Error', 'Please enter your GitHub Token to find your backup.');
      return;
    }

    Alert.alert(
      'Restore Data',
      'This will OVERWRITE your local data with the cloud backup. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            setLoading(true);
            try {
              const cloudData = await restoreFromCloud(token);
              await importAllData(cloudData);
              Alert.alert('Success', 'Data restored successfully! Please restart the app or refresh the dashboard.');
            } catch (error) {
              Alert.alert('Restore Failed', error.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <LinearGradient colors={['#0a0a0a', '#1a1a2e', '#16213e']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Backup & Sync</Text>
          <Text style={styles.headerSubtitle}>Sync your data across devices using GitHub</Text>
        </View>

        <BlurView intensity={20} tint="dark" style={styles.card}>
          <View style={styles.cardContent}>
            <Text style={styles.label}>GitHub Personal Access Token</Text>
            <TextInput
              style={styles.input}
              placeholder="ghp_xxxxxxxxxxxx"
              placeholderTextColor="rgba(255, 255, 255, 0.3)"
              secureTextEntry
              value={token}
              onChangeText={setToken}
            />
            <Text style={styles.helpText}>
              Requires a token with 'gist' scope. You can create one in GitHub Settings → Developer Settings → Personal Access Tokens.
            </Text>
            
            <TouchableOpacity style={styles.saveButton} onPress={handleSaveToken}>
              <Text style={styles.saveButtonText}>Save Token Locally</Text>
            </TouchableOpacity>
          </View>
        </BlurView>

        <View style={styles.actionsContainer}>
          <TouchableOpacity 
            style={[styles.syncButton, loading && styles.disabledButton]} 
            onPress={handleSyncToCloud}
            disabled={loading}
          >
            <BlurView intensity={30} tint="dark" style={styles.actionBlur}>
              {loading ? <ActivityIndicator color="#4ade80" /> : (
                <>
                  <Text style={styles.syncButtonText}>☁️ Backup to Cloud</Text>
                  <Text style={styles.syncButtonSubtext}>Upload current data to private Gist</Text>
                </>
              )}
            </BlurView>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.restoreButton, loading && styles.disabledButton]} 
            onPress={handleRestoreFromCloud}
            disabled={loading}
          >
            <BlurView intensity={30} tint="dark" style={styles.actionBlur}>
              {loading ? <ActivityIndicator color="#ffffff" /> : (
                <>
                  <Text style={styles.restoreButtonText}>📥 Restore from Cloud</Text>
                  <Text style={styles.restoreButtonSubtext}>Download latest backup from GitHub</Text>
                </>
              )}
            </BlurView>
          </TouchableOpacity>
        </View>

        {lastSync && (
          <Text style={styles.lastSyncText}>Last synced: {lastSync}</Text>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 60 },
  header: { marginBottom: 30 },
  backButton: { fontSize: 16, color: '#4ade80', marginBottom: 10 },
  headerTitle: { fontSize: 32, fontWeight: '700', color: '#ffffff' },
  headerSubtitle: { fontSize: 14, color: 'rgba(255, 255, 255, 0.6)', marginTop: 4 },
  card: { borderRadius: 24, overflow: 'hidden', marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  cardContent: { padding: 20 },
  label: { fontSize: 13, color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', marginBottom: 10 },
  input: { backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 12, padding: 15, color: '#ffffff', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  helpText: { fontSize: 11, color: 'rgba(255, 255, 255, 0.4)', marginTop: 10, lineHeight: 16 },
  saveButton: { marginTop: 15, padding: 10, alignItems: 'center' },
  saveButtonText: { color: '#4ade80', fontSize: 14, fontWeight: '600' },
  actionsContainer: { gap: 15 },
  syncButton: { borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: '#4ade8055' },
  restoreButton: { borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.2)' },
  actionBlur: { padding: 20, alignItems: 'center' },
  syncButtonText: { fontSize: 18, fontWeight: '700', color: '#4ade80' },
  syncButtonSubtext: { fontSize: 12, color: 'rgba(74, 222, 128, 0.6)', marginTop: 4 },
  restoreButtonText: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
  restoreButtonSubtext: { fontSize: 12, color: 'rgba(255, 255, 255, 0.4)', marginTop: 4 },
  lastSyncText: { textAlign: 'center', marginTop: 30, color: 'rgba(255, 255, 255, 0.3)', fontSize: 12 },
  disabledButton: { opacity: 0.5 }
});
