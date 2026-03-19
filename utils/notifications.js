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
    type: 'calendar',
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

// Schedule notification for insurance
export async function scheduleInsuranceReminder(insurance) {
  if (!insurance.startDate || !insurance.premiumAmount) return;

  const startDate = new Date(insurance.startDate);
  const dueDay = startDate.getDate();
  let baseMonth = startDate.getMonth() + 1; // 1-12
  
  // Create yearly triggers based on frequency
  let targetMonths = [];
  
  switch (insurance.frequency) {
    case 'yearly':
      targetMonths = [baseMonth];
      break;
    case 'half-yearly':
      targetMonths = [baseMonth, (baseMonth + 6 > 12) ? baseMonth - 6 : baseMonth + 6];
      break;
    case 'quarterly':
      targetMonths = [
        baseMonth,
        (baseMonth + 3 > 12) ? baseMonth - 9 : baseMonth + 3,
        (baseMonth + 6 > 12) ? baseMonth - 6 : baseMonth + 6,
        (baseMonth + 9 > 12) ? baseMonth - 3 : baseMonth + 9,
      ];
      break;
    case 'monthly':
      // Handled natively by Expo with just "day"
      break;
    default:
      targetMonths = [baseMonth];
  }

  // Ensure day is realistic (e.g. 28)
  let targetDay = dueDay - 1;
  if (targetDay <= 0) targetDay = 28;

  if (insurance.frequency === 'monthly') {
    const trigger = { type: 'calendar', day: targetDay, hour: 10, minute: 0, repeats: true };
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🛡️ Insurance Premium Due!",
        body: `Your ${insurance.name} premium of ₹${parseFloat(insurance.premiumAmount).toLocaleString('en-IN')} is due tomorrow!`,
      },
      trigger,
    });
  } else {
    // Schedule multiple yearly notifications
    for (const month of targetMonths) {
      const trigger = { type: 'calendar', month: month, day: targetDay, hour: 10, minute: 0, repeats: true };
      
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "🛡️ Insurance Premium Due!",
          body: `Your ${insurance.frequency} ${insurance.name} premium of ₹${parseFloat(insurance.premiumAmount).toLocaleString('en-IN')} is due tomorrow!`,
        },
        trigger,
      });
    }
  }
}
