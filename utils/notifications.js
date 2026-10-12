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

// Reminders are scheduled as individual dates (the day before each due date) so they
// follow month-end clamping and stop when a loan ends. iOS keeps at most 64 pending
// local notifications, so only the next few occurrences are scheduled; they are
// refreshed whenever loans change and once a day from the dashboard.
const EMI_REMINDERS_AHEAD = 3;
const PREMIUM_REMINDERS_AHEAD = 2;

const dayBefore = (date, hour) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1, hour, 0, 0);

async function scheduleAt(notifications, date, content) {
  if (!(date > new Date())) return null;
  return notifications.scheduleNotificationAsync({
    content,
    trigger: { type: notifications.SchedulableTriggerInputTypes?.DATE ?? 'date', date },
  });
}

// Schedule reminders for an EMI loan's next few EMIs, or a bullet loan's maturity
export async function scheduleEMIReminder(loan) {
  if (!loan.startDate) return;

  const notifications = getNotifications();
  if (!notifications) return null;

  const { getInstalmentDate, getNextInstalment, getBulletMaturityDate } = require('./emiCalculator');

  try {
    if (loan.loanType === 'bullet') {
      const maturity = getBulletMaturityDate(loan.startDate, loan.tenure);
      const at = new Date(maturity.getFullYear(), maturity.getMonth(), maturity.getDate() - 3, 10, 0, 0);
      return await scheduleAt(notifications, at, {
        title: 'Loan maturing soon',
        body: `${loan.loanName} matures in 3 days. Plan to renew or close it.`,
        data: { loanId: loan.id },
      });
    }

    if (!loan.emiAmount) return;
    const next = getNextInstalment(loan.startDate, loan.tenure, new Date());
    if (!next) return;
    const last = Math.min(parseInt(loan.tenure, 10) || 0, next.number + EMI_REMINDERS_AHEAD - 1);
    for (let k = next.number; k <= last; k++) {
      await scheduleAt(notifications, dayBefore(getInstalmentDate(loan.startDate, k), 10), {
        title: 'EMI due tomorrow',
        body: `${loan.loanName}: ₹${parseFloat(loan.emiAmount).toLocaleString('en-IN')} will be debited tomorrow.`,
        data: { loanId: loan.id },
      });
    }
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

// Schedule reminders for an insurance policy's next premiums
export async function scheduleInsuranceReminder(insurance) {
  if (!insurance.startDate || !insurance.premiumAmount) return;

  const notifications = getNotifications();
  if (!notifications) return;

  const { getNextPremiumDate, getPremiumStepMonths, addMonthsClamped, parseLocalDate } = require('./emiCalculator');
  const body = `${insurance.name}: ₹${parseFloat(insurance.premiumAmount).toLocaleString('en-IN')} premium is due tomorrow.`;

  try {
    const next = getNextPremiumDate(insurance.startDate, insurance.frequency, new Date());
    if (!next) return;
    const start = parseLocalDate(insurance.startDate);
    const step = getPremiumStepMonths(insurance.frequency);
    const n0 = Math.round(((next.getFullYear() - start.getFullYear()) * 12 + (next.getMonth() - start.getMonth())) / step);
    for (let i = 0; i < PREMIUM_REMINDERS_AHEAD; i++) {
      const due = addMonthsClamped(start, (n0 + i) * step);
      await scheduleAt(notifications, dayBefore(due, 10), {
        title: 'Insurance premium due tomorrow',
        body,
        data: { insuranceId: insurance.id },
      });
    }
  } catch (e) {
    console.warn('Insurance reminder scheduling failed:', e.message);
  }
}
