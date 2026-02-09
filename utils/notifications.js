import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Request permissions
export async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return;
    }
    token = (await Notifications.getExpoPushTokenAsync()).data;
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}

// Schedule notification for a loan
export async function scheduleEMIReminder(loan) {
  if (!loan.startDate || !loan.emiAmount) return;

  const startDate = new Date(loan.startDate);
  const dueDay = startDate.getDate();
  
  // Notification should be on the previous day
  // If due day is 1st, previous day is end of previous month. 
  // However, local notifications based on day of month are easier to logic.
  // We want to trigger every month on (dueDay - 1) at 15:00 (3 PM)
  
  let targetDay = dueDay - 1;
  if (targetDay === 0) {
    // Handling edge case: If EMI is on 1st, notify on 30th/31st is tricky with simple recurring triggers.
    // For simplicity, we'll use day 30 or 28 etc, but standard local triggers prefer specific day numbers.
    targetDay = 28; // Safer fallback for simplicity in this version
  }

  const trigger = {
    day: targetDay,
    hour: 15,
    minute: 0,
    repeats: true,
  };

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: "💰 EMI Reminder",
      body: `Your EMI for ${loan.loanName} of ₹${parseFloat(loan.emiAmount).toLocaleString('en-IN')} is due tomorrow!`,
      data: { loanId: loan.id },
    },
    trigger,
  });

  return identifier;
}

// Cancel all notifications for a specific loan (useful when deleting/updating)
export async function cancelAllLoanNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
