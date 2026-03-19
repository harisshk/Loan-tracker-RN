import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { exportAllData, importAllData } from '../utils/storage';

export default function SyncScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleExportData = async () => {
    setLoading(true);
    try {
      const data = await exportAllData();
      const fileUri = FileSystem.documentDirectory + 'loan_tracker_backup.json';
      await FileSystem.writeAsStringAsync(fileUri, data, { encoding: 'utf8' });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Success', 'Data exported to ' + fileUri);
      }
    } catch (error) {
      Alert.alert('Export Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImportData = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', '*/*'],
        copyToCacheDirectory: true
      });
      
      if (result.canceled) return;
      
      const fileUri = result.assets[0].uri;
      const data = await FileSystem.readAsStringAsync(fileUri, { encoding: 'utf8' });
      
      Alert.alert(
        'Restore Data',
        'This will OVERWRITE your local data with the imported data. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore',
            onPress: async () => {
              setLoading(true);
              try {
                await importAllData(data);
                Alert.alert('Success', 'Data restored successfully! Please return to the dashboard.');
              } catch (error) {
                Alert.alert('Restore Failed', error.message);
              } finally {
                setLoading(false);
              }
            },
          },
        ]
      );
    } catch (error) {
      Alert.alert('Import Failed', error.message);
    }
  };

  return (
    <LinearGradient colors={['#f8fafc', '#f1f5f9', '#e2e8f0']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Export & Import</Text>
          <Text style={styles.headerSubtitle}>Backup your data to a local file</Text>
        </View>

        <View style={styles.actionsContainer}>
          <TouchableOpacity 
            style={[styles.syncButton, loading && styles.disabledButton]} 
            onPress={handleExportData}
            disabled={loading}
          >
            <BlurView intensity={30} tint="light" style={styles.actionBlur}>
              {loading ? <ActivityIndicator color="#10b981" /> : (
                <>
                  <Text style={styles.syncButtonText}>💾 Export Data</Text>
                  <Text style={styles.syncButtonSubtext}>Download current data as a JSON file</Text>
                </>
              )}
            </BlurView>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.restoreButton, loading && styles.disabledButton]} 
            onPress={handleImportData}
            disabled={loading}
          >
            <BlurView intensity={30} tint="light" style={styles.actionBlur}>
              {loading ? <ActivityIndicator color="#ffffff" /> : (
                <>
                  <Text style={styles.restoreButtonText}>📥 Import Data</Text>
                  <Text style={styles.restoreButtonSubtext}>Upload from a previously downloaded JSON file</Text>
                </>
              )}
            </BlurView>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 60 },
  header: { marginBottom: 30 },
  backButton: { fontSize: 16, color: '#10b981', marginBottom: 10 },
  headerTitle: { fontSize: 32, fontWeight: '700', color: '#0f172a' },
  headerSubtitle: { fontSize: 14, color: 'rgba(15, 23, 42, 0.6)', marginTop: 4 },
  actionsContainer: { gap: 15 },
  syncButton: { borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: '#10b98155' },
  restoreButton: { borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(15, 23, 42, 0.2)' },
  actionBlur: { padding: 20, alignItems: 'center' },
  syncButtonText: { fontSize: 18, fontWeight: '700', color: '#10b981' },
  syncButtonSubtext: { fontSize: 12, color: 'rgba(16, 185, 129, 0.6)', marginTop: 4 },
  restoreButtonText: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  restoreButtonSubtext: { fontSize: 12, color: 'rgba(15, 23, 42, 0.4)', marginTop: 4 },
  disabledButton: { opacity: 0.5 }
});
