import { Platform } from 'react-native';

let Notifications = null;
let isSupported = true;

// Helper to lazily load expo-notifications only when a function is called
function getNotifications() {
  if (!isSupported) return null;
  if (Notifications) return Notifications;
  try {
    Notifications = require('expo-notifications');
    // Configure how notifications appear when the app is in foreground
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    return Notifications;
  } catch (e) {
    console.warn('expo-notifications is not supported in this environment (e.g. Expo Go). Falling back to mock implementation.', e.message);
    isSupported = false;
    return null;
  }
}

// Request local notification permissions (no remote push token needed)
export async function registerForPushNotificationsAsync() {
  const notifications = getNotifications();
  if (!notifications) return null;

  try {
    if (Platform.OS === 'android') {
      await notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#10b981',
      });
    }

    const { status: existingStatus } = await notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Notification permission not granted.');
      return null;
    }

    return 'local-only'; // No remote token needed
  } catch (e) {
    console.warn('Failed to register for push notifications:', e.message);
    return null;
  }
}

// Schedule a monthly local notification for an EMI loan
export async function scheduleEMIReminder(loan) {
  if (!loan.startDate || !loan.emiAmount) return;

  const notifications = getNotifications();
  if (!notifications) return null;

  const startDate = new Date(loan.startDate);
  const dueDay = startDate.getDate();

  let targetDay = dueDay - 1;
  if (targetDay <= 0) targetDay = 28; // Safe fallback for 1st-of-month due dates

  try {
    const identifier = await notifications.scheduleNotificationAsync({
      content: {
        title: '💰 EMI Reminder',
        body: `Your EMI for ${loan.loanName} of ₹${parseFloat(loan.emiAmount).toLocaleString('en-IN')} is due tomorrow!`,
        data: { loanId: loan.id },
      },
      trigger: {
        type: 'calendar',
        day: targetDay,
        hour: 15,
        minute: 0,
        repeats: true,
      },
    });
    return identifier;
  } catch (e) {
    console.warn('EMI reminder scheduling failed:', e.message);
  }
}

// Cancel all scheduled notifications (call before rescheduling)
export async function cancelAllLoanNotifications() {
  const notifications = getNotifications();
  if (!notifications) return;

  try {
    await notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    console.warn('Could not cancel notifications:', e.message);
  }
}

// Schedule local notifications for an insurance policy
export async function scheduleInsuranceReminder(insurance) {
  if (!insurance.startDate || !insurance.premiumAmount) return;

  const notifications = getNotifications();
  if (!notifications) return;

  const startDate = new Date(insurance.startDate);
  const dueDay = startDate.getDate();
  const baseMonth = startDate.getMonth() + 1; // 1–12

  let targetDay = dueDay - 1;
  if (targetDay <= 0) targetDay = 28;

  const body = `Your ${insurance.frequency} ${insurance.name} premium of ₹${parseFloat(insurance.premiumAmount).toLocaleString('en-IN')} is due tomorrow!`;

  try {
    if (insurance.frequency === 'monthly') {
      await notifications.scheduleNotificationAsync({
        content: { title: '🛡️ Insurance Premium Due!', body },
        trigger: { type: 'calendar', day: targetDay, hour: 10, minute: 0, repeats: true },
      });
    } else {
      // Build the list of months for this frequency
      let targetMonths = [];
      switch (insurance.frequency) {
        case 'yearly':
          targetMonths = [baseMonth];
          break;
        case 'half-yearly':
          targetMonths = [baseMonth, ((baseMonth + 5) % 12) + 1];
          break;
        case 'quarterly':
          targetMonths = [0, 3, 6, 9].map(offset => ((baseMonth - 1 + offset) % 12) + 1);
          break;
        default:
          targetMonths = [baseMonth];
      }

      for (const month of targetMonths) {
        await notifications.scheduleNotificationAsync({
          content: { title: '🛡️ Insurance Premium Due!', body },
          trigger: { type: 'calendar', month, day: targetDay, hour: 10, minute: 0, repeats: true },
        });
      }
    }
  } catch (e) {
    console.warn('Insurance reminder scheduling failed:', e.message);
  }
}
