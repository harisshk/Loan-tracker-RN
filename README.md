# Loan Tracker - iOS Style Glassmorphism App

A modern, beautiful loan tracking application built with Expo Router featuring dark glassmorphism UI inspired by premium finance apps.

## Features

- 📊 **Dashboard** - View total outstanding loans, upcoming EMI, and quick summaries
- 💰 **Loan Management** - Add, view, and delete loans with detailed information
- 📈 **Loan Analytics** - Beautiful graphs showing principal vs interest breakdown
- 📉 **Payment Progress** - Visual progress bars and payment tracking
- 📝 **Payment History** - Track and record EMI payments
- 🎨 **Premium UI** - Dark glassmorphism design with blur effects and smooth gradients
- 💾 **Local Storage** - All data stored locally using AsyncStorage
- 🧮 **Auto-calculation** - Remaining balance calculated based on start date

## Tech Stack

- **Expo Router** - File-based routing
- **expo-blur** - Glassmorphism blur effects
- **expo-linear-gradient** - Beautiful gradient backgrounds
- **AsyncStorage** - Local data persistence
- **React Native** - Cross-platform mobile development

## App Structure

```
app/
  ├── index.js       → Dashboard screen
  ├── loans.js       → List of all loans
  ├── add-loan.js    → Form to add new loan
  ├── loan-detail.js → Detailed view with graphs
  ├── history.js     → Payment history screen
  └── _layout.tsx    → Root navigation layout

utils/
  └── storage.js     → AsyncStorage helper functions
```

## Design Features

- **30px rounded corners** on all glass cards
- **Soft border glow** with rgba(255, 255, 255, 0.1)
- **Clean iOS spacing** and typography
- **Dark gradient background** (#0a0a0a → #1a1a2e → #16213e)
- **Blur intensity** optimized for readability

## Running the App

```bash
# Start the development server
npx expo start

# Run on iOS
npx expo start --ios

# Run on Android
npx expo start --android

# Run on Web
npx expo start --web
```

## Usage

### Adding a Loan
1. Navigate to Dashboard
2. Tap "Add New Loan"
3. Fill in loan details:
   - Loan Name (e.g., Home Loan)
   - Principal Amount
   - Interest Rate (%)
   - EMI Amount
   - Start Date
   - Tenure (months)
4. Tap "Save Loan"

### Viewing Loans
- Tap "View All Loans" from Dashboard
- Long-press any loan card to delete

### Recording Payments
1. Navigate to "Payment History"
2. Tap "+ Add"
3. Select loan and enter amount
4. Tap "Record Payment"

## Data Storage

All data is stored locally on the device using AsyncStorage:
- Loans are stored under `@loans` key
- Payments are stored under `@payments` key

## Future Enhancements

- [ ] EMI calculator
- [ ] Payment reminders/notifications
- [ ] Charts and analytics
- [ ] Export data to CSV
- [ ] Cloud sync
- [ ] Multiple currency support

## License

MIT
