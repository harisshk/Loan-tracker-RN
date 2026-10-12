import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Card,
  colors,
  Gap,
  IconBadge,
  radius,
  Screen,
  ScreenHeader,
  SectionHeader,
  space,
  type,
} from '../components/ui/kit';
import { exportAllData, importAllData } from '../utils/storage';

const STATUS_TONES = {
  success: { icon: 'checkmark-circle', color: colors.primary, soft: colors.primarySoft },
  error: { icon: 'alert-circle', color: colors.danger, soft: colors.dangerSoft },
  info: { icon: 'information-circle', color: colors.info, soft: colors.infoSoft },
};

const INCLUDED = [
  { icon: 'wallet-outline', label: 'Loans and payments' },
  { icon: 'shield-checkmark-outline', label: 'Insurance policies' },
  { icon: 'pie-chart-outline', label: 'Spends and monthly budget' },
];

export default function SyncScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  // Which action is running, so only that button shows a spinner.
  const [busy, setBusy] = useState(null);
  const [status, setStatus] = useState(null);
  const [restored, setRestored] = useState(false);

  const handleExportData = async () => {
    setLoading(true);
    setBusy('export');
    setStatus(null);
    try {
      const data = await exportAllData();
      const fileUri = FileSystem.documentDirectory + 'loan_tracker_backup.json';
      await FileSystem.writeAsStringAsync(fileUri, data, { encoding: 'utf8' });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
        setStatus({ tone: 'success', title: 'Backup created', message: 'Keep the file somewhere safe, like Files or Google Drive.' });
      } else {
        setStatus({ tone: 'success', title: 'Backup saved', message: 'Data exported to ' + fileUri });
      }
    } catch (error) {
      setStatus({ tone: 'error', title: 'Export failed', message: error.message });
    } finally {
      setLoading(false);
      setBusy(null);
    }
  };

  const handleImportData = async () => {
    setStatus(null);
    setRestored(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const fileUri = result.assets[0].uri;
      const data = await FileSystem.readAsStringAsync(fileUri, { encoding: 'utf8' });

      Alert.alert(
        'Restore Data',
        'This replaces the loans, payments, insurance and spends saved in your account with the ones in this backup. This cannot be undone. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore',
            style: 'destructive',
            onPress: async () => {
              setLoading(true);
              setBusy('import');
              setStatus({ tone: 'info', title: 'Restoring…', message: 'This can take a few seconds. Keep the app open.' });
              try {
                await importAllData(data);
                setStatus({ tone: 'success', title: 'Data restored', message: 'Your backup has been restored. Return to the dashboard to see it.' });
                setRestored(true);
              } catch (error) {
                setStatus({ tone: 'error', title: 'Restore failed', message: error.message });
              } finally {
                setLoading(false);
                setBusy(null);
              }
            },
          },
        ]
      );
    } catch (error) {
      setStatus({ tone: 'error', title: 'Import failed', message: error.message });
    }
  };

  const tone = status ? STATUS_TONES[status.tone] : null;

  return (
    <Screen>
      <ScreenHeader back title="Backup & restore" subtitle="Keep a copy of your data in a file you control" />

      {status && tone ? (
        <>
          <View
            style={[styles.status, { backgroundColor: tone.soft }]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Ionicons name={tone.icon} size={20} color={tone.color} />
            <View style={styles.statusText}>
              <Text style={[styles.statusTitle, { color: tone.color }]}>{status.title}</Text>
              <Text style={styles.statusMessage}>{status.message}</Text>
            </View>
          </View>
          {restored ? (
            <Button label="Go to dashboard" variant="ghost" icon="home-outline" onPress={() => router.replace('/')} />
          ) : null}
          <Gap size={space.lg} />
        </>
      ) : null}

      <Card>
        <View style={styles.actionHead}>
          <IconBadge name="download-outline" color={colors.primary} backgroundColor={colors.primarySoft} />
          <View style={styles.actionText}>
            <Text style={styles.actionTitle} accessibilityRole="header">
              Export backup
            </Text>
            <Text style={styles.actionBody}>
              Creates a JSON file with all your data. Save it to Files, Drive or email it to yourself.
            </Text>
          </View>
        </View>
        <Button
          label="Export backup"
          icon="share-outline"
          onPress={handleExportData}
          loading={busy === 'export'}
          disabled={loading}
          style={styles.actionButton}
        />
      </Card>

      <Gap size={space.lg} />

      <Card>
        <View style={styles.actionHead}>
          <IconBadge name="cloud-upload-outline" color={colors.indigo} backgroundColor={colors.indigoSoft} />
          <View style={styles.actionText}>
            <Text style={styles.actionTitle} accessibilityRole="header">
              Import backup
            </Text>
            <Text style={styles.actionBody}>
              Pick a backup file you exported earlier. It replaces your current loans, payments, policies and spends.
            </Text>
          </View>
        </View>
        <View style={styles.warning}>
          <Ionicons name="warning-outline" size={16} color={colors.warning} />
          <Text style={styles.warningText}>Restoring overwrites existing data and can&apos;t be undone.</Text>
        </View>
        <Button
          label="Import backup"
          icon="folder-open-outline"
          variant="secondary"
          onPress={handleImportData}
          loading={busy === 'import'}
          disabled={loading}
          style={styles.actionButton}
        />
      </Card>

      <Gap />
      <SectionHeader title="What's in a backup" />
      <Card padded={false}>
        {INCLUDED.map((item, i) => (
          <View key={item.label} style={[styles.includedRow, i > 0 && styles.includedDivider]}>
            <Ionicons name={item.icon} size={18} color={colors.textSecondary} />
            <Text style={styles.includedText}>{item.label}</Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  status: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm + 2,
    padding: space.md + 2,
    borderRadius: radius.md,
  },
  statusText: {
    flex: 1,
    minWidth: 0,
  },
  statusTitle: {
    ...type.label,
    fontWeight: '700',
  },
  statusMessage: {
    ...type.label,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 2,
  },
  actionHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
  },
  actionText: {
    flex: 1,
    minWidth: 0,
  },
  actionTitle: {
    ...type.headline,
    color: colors.text,
  },
  actionBody: {
    ...type.label,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: space.xs,
  },
  actionButton: {
    marginTop: space.lg,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.md,
    padding: space.sm + 2,
    borderRadius: radius.sm,
    backgroundColor: colors.warningSoft,
  },
  warningText: {
    ...type.caption,
    fontWeight: '600',
    color: colors.warning,
    flex: 1,
  },
  includedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    minHeight: 48,
  },
  includedDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  includedText: {
    ...type.body,
    color: colors.text,
  },
});
